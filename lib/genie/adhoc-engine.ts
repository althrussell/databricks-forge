/**
 * Ad-Hoc Genie Engine — full-power space generator from a table list.
 *
 * Runs all 7 Genie Engine passes (column intelligence, semantic expressions,
 * join inference, trusted assets, instruction generation, benchmarks, metric
 * views) without requiring a pipeline run. Designed for the /genie/new
 * construction flow and Ask Forge integration.
 *
 * Mirrors the parallel execution structure of the pipeline engine's
 * `processDomain` function for equivalent output quality.
 */

import type { MetadataSnapshot, BusinessContext } from "@/lib/domain/types";
import type {
  GenieEngineConfig,
  GenieEnginePassOutputs,
  GenieSpaceRecommendation,
} from "./types";
import { defaultGenieEngineConfig } from "./types";
import { buildSchemaAllowlist } from "./schema-allowlist";
import { runColumnIntelligence } from "./passes/column-intelligence";
import { runSemanticExpressions } from "./passes/semantic-expressions";
import { runJoinInference } from "./passes/join-inference";
import { runTrustedAssetAuthoring } from "./passes/trusted-assets";
import { runInstructionGeneration } from "./passes/instruction-generation";
import { runBenchmarkGeneration } from "./passes/benchmark-generation";
import { runMetricViewProposals } from "./passes/metric-view-proposals";
import { assembleSerializedSpace, buildRecommendation } from "./assembler";
import { fetchTableInfoBatch, fetchColumnsBatch, fetchForeignKeysBatch } from "@/lib/queries/metadata";
import { getServingEndpoint, getFastServingEndpoint } from "@/lib/dbx/client";
import { logger } from "@/lib/logger";

export interface AdHocGenieConfig {
  title?: string;
  description?: string;
  domain?: string;
  glossary?: GenieEngineConfig["glossary"];
  fiscalYearStartMonth?: number;
  autoTimePeriods?: boolean;
  llmRefinement?: boolean;
  globalInstructions?: string;
  businessContext?: BusinessContext | null;
  conversationSummary?: string;
  generateBenchmarks?: boolean;
  generateMetricViews?: boolean;
  generateTrustedAssets?: boolean;
}

export interface AdHocEngineInput {
  tables: string[];
  config?: AdHocGenieConfig;
  signal?: AbortSignal;
  onProgress?: (message: string, percent: number) => void;
}

export interface AdHocEngineResult {
  recommendation: GenieSpaceRecommendation;
  passOutputs: GenieEnginePassOutputs;
  metadata: MetadataSnapshot;
}

function buildEngineConfig(adhoc?: AdHocGenieConfig): GenieEngineConfig {
  const base = defaultGenieEngineConfig();
  if (!adhoc) return base;
  if (adhoc.glossary) base.glossary = adhoc.glossary;
  if (adhoc.fiscalYearStartMonth !== undefined) base.fiscalYearStartMonth = adhoc.fiscalYearStartMonth;
  if (adhoc.autoTimePeriods !== undefined) base.autoTimePeriods = adhoc.autoTimePeriods;
  if (adhoc.llmRefinement !== undefined) base.llmRefinement = adhoc.llmRefinement;
  if (adhoc.globalInstructions) base.globalInstructions = adhoc.globalInstructions;
  if (adhoc.generateBenchmarks !== undefined) base.generateBenchmarks = adhoc.generateBenchmarks;
  if (adhoc.generateMetricViews !== undefined) base.generateMetricViews = adhoc.generateMetricViews;
  if (adhoc.generateTrustedAssets !== undefined) base.generateTrustedAssets = adhoc.generateTrustedAssets;
  return base;
}

/**
 * Synthesize a minimal BusinessContext from the conversation summary
 * when no explicit context is provided. Gives the semantic expressions
 * and instruction generation passes something to ground on.
 */
function resolveBusinessContext(adhoc?: AdHocGenieConfig): BusinessContext | null {
  if (adhoc?.businessContext) return adhoc.businessContext;
  if (adhoc?.conversationSummary) {
    return {
      industries: "",
      strategicGoals: adhoc.conversationSummary,
      businessPriorities: "",
      strategicInitiative: "",
      valueChain: "",
      revenueModel: "",
      additionalContext: "",
    };
  }
  return null;
}

/**
 * Run the ad-hoc Genie Engine with full pass coverage: scrape metadata
 * for the given tables, then run all 7 engine passes (column intelligence,
 * semantic expressions, join inference, trusted assets, instructions,
 * benchmarks, metric views) to produce a production-grade SerializedSpace.
 */
export async function runAdHocGenieEngine(input: AdHocEngineInput): Promise<AdHocEngineResult> {
  const { tables, config: adhocConfig, signal, onProgress } = input;

  if (tables.length === 0) {
    throw new Error("At least one table is required");
  }

  const engineConfig = buildEngineConfig(adhocConfig);
  const premiumEndpoint = getServingEndpoint();
  const fastEndpoint = getFastServingEndpoint();
  const domain = adhocConfig?.domain || inferDomain(tables);
  const businessContext = resolveBusinessContext(adhocConfig);

  logger.info("Ad-hoc Genie Engine starting", {
    tableCount: tables.length,
    domain,
    llmRefinement: engineConfig.llmRefinement,
    generateTrustedAssets: engineConfig.generateTrustedAssets,
    generateBenchmarks: engineConfig.generateBenchmarks,
    generateMetricViews: engineConfig.generateMetricViews,
    hasBusinessContext: !!businessContext,
  });

  // Step 1: Scrape metadata for the selected tables
  onProgress?.("Fetching table metadata...", 5);
  const [tableInfos, columns, foreignKeys] = await Promise.all([
    fetchTableInfoBatch(tables),
    fetchColumnsBatch(tables),
    fetchForeignKeysBatch(tables),
  ]);

  if (tableInfos.length === 0) {
    throw new Error("No tables found. Verify the table names and your access permissions.");
  }

  const metadata: MetadataSnapshot = {
    cacheKey: `adhoc-${Date.now()}`,
    ucPath: tables.map((t) => t.split(".").slice(0, 2).join(".")).filter((v, i, a) => a.indexOf(v) === i).join(", "),
    tables: tableInfos,
    columns,
    foreignKeys,
    metricViews: [],
    schemaMarkdown: buildSchemaMarkdown(tableInfos, columns),
    tableCount: tableInfos.length,
    columnCount: columns.length,
    cachedAt: new Date().toISOString(),
    lineageDiscoveredFqns: [],
  };

  const validTableFqns = tableInfos.map((t) => t.fqn);
  const allowlist = buildSchemaAllowlist(metadata);

  // Pass 1 (fast) + Pass 2 (premium) in parallel -- no shared dependencies
  onProgress?.("Analyzing columns & generating SQL expressions...", 10);
  const [columnResult, exprResult] = await Promise.all([
    runColumnIntelligence({
      tableFqns: validTableFqns,
      metadata,
      allowlist,
      config: engineConfig,
      sampleData: null,
      endpoint: fastEndpoint,
      signal,
    }),
    runSemanticExpressions({
      tableFqns: validTableFqns,
      metadata,
      allowlist,
      useCases: [],
      businessContext,
      config: engineConfig,
      endpoint: premiumEndpoint,
      signal,
    }),
  ]);

  // Build join specs from foreign keys + LLM inference
  onProgress?.("Inferring table relationships...", 35);
  const tableSet = new Set(validTableFqns.map((t) => t.toLowerCase()));
  const fkJoins = foreignKeys
    .filter((fk) =>
      tableSet.has(fk.tableFqn.toLowerCase()) &&
      tableSet.has(fk.referencedTableFqn.toLowerCase())
    )
    .map((fk) => ({
      leftTable: fk.tableFqn,
      rightTable: fk.referencedTableFqn,
      sql: `${fk.tableFqn}.${fk.columnName} = ${fk.referencedTableFqn}.${fk.referencedColumnName}`,
      relationshipType: "many_to_one" as const,
    }));

  const existingJoinKeys = new Set(
    fkJoins.map((j) => `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`)
  );

  let llmJoins: typeof fkJoins = [];
  if (engineConfig.llmRefinement && fkJoins.length < 3) {
    try {
      const llmResult = await runJoinInference({
        tableFqns: validTableFqns,
        metadata,
        allowlist,
        existingJoinKeys,
        endpoint: fastEndpoint,
        signal,
      });
      llmJoins = llmResult.joins;
    } catch (err) {
      logger.warn("Ad-hoc LLM join inference failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allJoins = [...fkJoins, ...llmJoins];

  logger.info("Ad-hoc join specs assembled", {
    domain,
    fkJoins: fkJoins.length,
    llmInferred: llmJoins.length,
    total: allJoins.length,
  });

  // Passes 3-6 in parallel (mirrors processDomain structure)
  onProgress?.("Creating trusted assets, instructions, benchmarks & metric views...", 50);
  const [trustedResult, instructionResult, benchmarkResult, metricViewResult] = await Promise.all([
    // Pass 3: Trusted Asset Authoring (premium)
    engineConfig.generateTrustedAssets
      ? runTrustedAssetAuthoring({
          tableFqns: validTableFqns,
          metadata,
          allowlist,
          useCases: [],
          entityCandidates: columnResult.entityCandidates,
          joinSpecs: allJoins,
          endpoint: premiumEndpoint,
          signal,
        })
      : Promise.resolve({ queries: [], functions: [] }),

    // Pass 4: Instruction Generation (fast)
    runInstructionGeneration({
      domain,
      subdomains: [],
      businessName: adhocConfig?.title || domain,
      businessContext,
      config: engineConfig,
      entityCandidates: columnResult.entityCandidates,
      joinSpecs: allJoins,
      endpoint: fastEndpoint,
      signal,
    }),

    // Pass 5: Benchmark Generation (premium)
    engineConfig.generateBenchmarks
      ? runBenchmarkGeneration({
          tableFqns: validTableFqns,
          metadata,
          allowlist,
          useCases: [],
          entityCandidates: columnResult.entityCandidates,
          customerBenchmarks: engineConfig.benchmarkQuestions,
          joinSpecs: allJoins,
          endpoint: premiumEndpoint,
          signal,
        })
      : Promise.resolve({ benchmarks: [...engineConfig.benchmarkQuestions] }),

    // Pass 6: Metric View Proposals (premium)
    engineConfig.generateMetricViews
      ? runMetricViewProposals({
          domain,
          tableFqns: validTableFqns,
          metadata,
          allowlist,
          useCases: [],
          measures: exprResult.measures,
          dimensions: exprResult.dimensions,
          joinSpecs: allJoins,
          columnEnrichments: columnResult.enrichments,
          endpoint: premiumEndpoint,
          signal,
        })
      : Promise.resolve({ proposals: [] }),
  ]);

  onProgress?.("Assembling Genie Space...", 90);

  // Sample questions: prefer trusted query questions (column-grounded)
  // with entity-based fallback -- mirrors the full engine logic
  const trustedQuestionTexts = trustedResult.queries
    .filter((tq) => tq.question.trim().length > 0)
    .map((tq) => tq.question);
  const entityFallbackQuestions = columnResult.entityCandidates
    .slice(0, 5)
    .map((ec) => `What are the top ${ec.columnName.replace(/_/g, " ")}s?`);
  const sampleQuestions = [
    ...trustedQuestionTexts.slice(0, 5),
    ...entityFallbackQuestions,
  ]
    .filter((q, i, arr) => arr.indexOf(q) === i)
    .slice(0, 5);

  const passOutputs: GenieEnginePassOutputs = {
    domain,
    subdomains: [],
    tables: validTableFqns,
    metricViews: [],
    columnEnrichments: columnResult.enrichments,
    entityMatchingCandidates: columnResult.entityCandidates,
    measures: exprResult.measures,
    filters: exprResult.filters,
    dimensions: exprResult.dimensions,
    trustedQueries: trustedResult.queries,
    trustedFunctions: [],
    textInstructions: instructionResult.instructions,
    sampleQuestions,
    benchmarkQuestions: benchmarkResult.benchmarks,
    metricViewProposals: metricViewResult.proposals,
    joinSpecs: allJoins,
  };

  // Build SerializedSpace via the same assembler as the pipeline engine
  const seedId = `adhoc-${Date.now()}`;
  const space = assembleSerializedSpace(passOutputs, {
    runId: seedId,
    businessName: adhocConfig?.title || domain,
    allowlist,
    metadata,
  });

  const recommendation = buildRecommendation(passOutputs, space, adhocConfig?.title || domain);
  if (adhocConfig?.title) recommendation.title = adhocConfig.title;
  if (adhocConfig?.description) recommendation.description = adhocConfig.description;

  onProgress?.("Complete", 100);

  logger.info("Ad-hoc Genie Engine complete", {
    domain,
    tables: validTableFqns.length,
    measures: exprResult.measures.length,
    filters: exprResult.filters.length,
    joins: allJoins.length,
    instructions: instructionResult.instructions.length,
    trustedQueries: trustedResult.queries.length,
    benchmarks: benchmarkResult.benchmarks.length,
    metricViews: metricViewResult.proposals.length,
    sampleQuestions: sampleQuestions.length,
  });

  return { recommendation, passOutputs, metadata };
}

function inferDomain(tables: string[]): string {
  const schemas = tables
    .map((t) => t.split(".")[1])
    .filter(Boolean);
  const counts = new Map<string, number>();
  for (const s of schemas) {
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  let best = "Analytics";
  let bestCount = 0;
  for (const [schema, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      best = schema.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return best;
}

function buildSchemaMarkdown(
  tables: { fqn: string; comment?: string | null }[],
  columns: { tableFqn: string; columnName: string; dataType: string; comment?: string | null }[],
): string {
  const colsByTable = new Map<string, typeof columns>();
  for (const c of columns) {
    const list = colsByTable.get(c.tableFqn) ?? [];
    list.push(c);
    colsByTable.set(c.tableFqn, list);
  }

  const parts: string[] = [];
  for (const t of tables) {
    const cols = colsByTable.get(t.fqn) ?? [];
    const colLines = cols.map((c) => `  - ${c.columnName} (${c.dataType})${c.comment ? ` -- ${c.comment}` : ""}`);
    parts.push(`### ${t.fqn}${t.comment ? `\n${t.comment}` : ""}\n${colLines.join("\n")}`);
  }
  return parts.join("\n\n");
}

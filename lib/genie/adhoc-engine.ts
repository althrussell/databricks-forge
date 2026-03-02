/**
 * Ad-Hoc Genie Engine — two-tier space generator from a table list.
 *
 * **Fast mode** (default): Scrapes metadata from information_schema and
 * generates a usable Genie Space using mostly rule-based passes with
 * focused fast-LLM refinements for title/instructions/example SQL.
 *
 * **Full mode**: Runs all 7 Genie Engine LLM passes (column intelligence,
 * semantic expressions, join inference, trusted assets, instruction
 * generation, benchmarks, metric views). Takes 1–3 minutes but produces
 * production-grade output.
 *
 * Designed for the /genie/new construction flow and Ask Forge integration.
 */

import type { MetadataSnapshot, BusinessContext, ColumnInfo } from "@/lib/domain/types";
import type {
  GenieEngineConfig,
  GenieEnginePassOutputs,
  GenieSpaceRecommendation,
  EnrichedSqlSnippetMeasure,
  EnrichedSqlSnippetFilter,
  EnrichedSqlSnippetDimension,
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
import { runTitleGeneration } from "./passes/title-generation";
import { runExampleQueryGeneration } from "./passes/example-query-generation";
import { inferNormalizedDomainFromTables, normalizeDomainLabel } from "./domain-normalization";
import { tableHasSynonymPair } from "./key-synonyms";
import { evaluateJoinCandidates } from "./join-diagnostics";
import { extractEntityCandidatesFromSchema } from "./entity-extraction";
import { generateTimePeriods } from "./time-periods";
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
  mode?: "fast" | "full";
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
  mode: "fast" | "full";
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const NUMERIC_TYPE_PATTERN = /^(int|bigint|smallint|tinyint|float|double|decimal|numeric|real)/i;

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

function inferDomain(tables: string[]): string {
  return inferNormalizedDomainFromTables(tables, "Analytics");
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

async function scrapeMetadata(tables: string[]): Promise<MetadataSnapshot> {
  const [tableInfos, columns, foreignKeys] = await Promise.all([
    fetchTableInfoBatch(tables),
    fetchColumnsBatch(tables),
    fetchForeignKeysBatch(tables),
  ]);

  if (tableInfos.length === 0) {
    throw new Error("No tables found. Verify the table names and your access permissions.");
  }

  return {
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
}

function buildFkJoins(
  foreignKeys: MetadataSnapshot["foreignKeys"],
  tableSet: Set<string>,
) {
  return foreignKeys
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
}

function humanize(name: string): string {
  return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function inferHeuristicJoins(
  columns: ColumnInfo[],
  tableFqns: string[],
  existingKeys: Set<string>,
): Array<{ leftTable: string; rightTable: string; sql: string; relationshipType: "many_to_one" }> {
  const byTable = new Map<string, Set<string>>();
  for (const c of columns) {
    const key = c.tableFqn.toLowerCase();
    const cols = byTable.get(key) ?? new Set<string>();
    cols.add(c.columnName.toLowerCase());
    byTable.set(key, cols);
  }

  const joins: Array<{ leftTable: string; rightTable: string; sql: string; relationshipType: "many_to_one" }> = [];
  for (let i = 0; i < tableFqns.length; i++) {
    for (let j = i + 1; j < tableFqns.length; j++) {
      const left = tableFqns[i];
      const right = tableFqns[j];
      const pair = `${left.toLowerCase()}|${right.toLowerCase()}`;
      const reverse = `${right.toLowerCase()}|${left.toLowerCase()}`;
      if (existingKeys.has(pair) || existingKeys.has(reverse)) continue;

      const leftCols = byTable.get(left.toLowerCase()) ?? new Set<string>();
      const rightCols = byTable.get(right.toLowerCase()) ?? new Set<string>();
      const synonym = tableHasSynonymPair(leftCols, rightCols);
      if (!synonym) continue;

      joins.push({
        leftTable: left,
        rightTable: right,
        sql: `${left}.${synonym.leftColumn} = ${right}.${synonym.rightColumn}`,
        relationshipType: "many_to_one",
      });
      existingKeys.add(pair);
      existingKeys.add(reverse);
    }
  }
  return joins;
}

function scoreQuality(degradedReasons: string[]): number {
  return Math.max(40, 100 - degradedReasons.length * 12);
}

// ---------------------------------------------------------------------------
// Fast mode — mostly rule-based with lightweight LLM
// ---------------------------------------------------------------------------

/**
 * Generate numeric measures from column metadata (SUM, AVG, COUNT for each
 * numeric column). This is the fast-mode substitute for LLM semantic
 * expressions.
 */
function generateNumericMeasures(
  columns: ColumnInfo[],
  tableFqns: string[],
): EnrichedSqlSnippetMeasure[] {
  const tableSet = new Set(tableFqns.map((f) => f.toLowerCase()));
  const measures: EnrichedSqlSnippetMeasure[] = [];

  for (const col of columns) {
    if (!tableSet.has(col.tableFqn.toLowerCase())) continue;
    if (!NUMERIC_TYPE_PATTERN.test(col.dataType)) continue;
    // Skip likely ID/key columns
    const lower = col.columnName.toLowerCase();
    if (lower.endsWith("_id") || lower === "id" || lower.endsWith("_key")) continue;

    const label = humanize(col.columnName);
    const ref = `${col.tableFqn}.${col.columnName}`;

    measures.push({
      name: `Total ${label}`,
      sql: `SUM(${ref})`,
      synonyms: [`sum of ${label.toLowerCase()}`, `total ${label.toLowerCase()}`],
      instructions: `Sum of ${col.columnName} from ${col.tableFqn.split(".").pop()}`,
    });

    measures.push({
      name: `Average ${label}`,
      sql: `AVG(${ref})`,
      synonyms: [`avg ${label.toLowerCase()}`, `mean ${label.toLowerCase()}`],
      instructions: `Average of ${col.columnName} from ${col.tableFqn.split(".").pop()}`,
    });
  }

  return measures;
}

/**
 * Generate basic string-column filters (IS NOT NULL, IS NULL) and
 * add a row-count measure for each table.
 */
function generateBasicFilters(
  columns: ColumnInfo[],
  tableFqns: string[],
): EnrichedSqlSnippetFilter[] {
  const tableSet = new Set(tableFqns.map((f) => f.toLowerCase()));
  const filters: EnrichedSqlSnippetFilter[] = [];
  const seenTables = new Set<string>();

  for (const col of columns) {
    if (!tableSet.has(col.tableFqn.toLowerCase())) continue;

    // Add one "has data" filter per table
    if (!seenTables.has(col.tableFqn.toLowerCase())) {
      seenTables.add(col.tableFqn.toLowerCase());
      const tableName = col.tableFqn.split(".").pop() ?? col.tableFqn;
      if (col.isNullable) {
        filters.push({
          name: `${humanize(tableName)} has ${humanize(col.columnName)}`,
          sql: `${col.tableFqn}.${col.columnName} IS NOT NULL`,
          synonyms: [],
          instructions: `Filter to rows where ${col.columnName} is present`,
          isTimePeriod: false,
        });
      }
    }
  }

  return filters;
}

/**
 * Build simple instructions from table/column comments (no LLM).
 */
function buildRuleBasedInstructions(
  metadata: MetadataSnapshot,
  tableFqns: string[],
  domain: string,
  conversationSummary?: string,
): string[] {
  const instructions: string[] = [];

  if (conversationSummary) {
    instructions.push(`User intent: ${conversationSummary}`);
  }

  instructions.push(
    `This space covers the ${domain} domain with ${tableFqns.length} table${tableFqns.length !== 1 ? "s" : ""}.`
  );

  for (const t of metadata.tables) {
    if (!tableFqns.some((fqn) => fqn.toLowerCase() === t.fqn.toLowerCase())) continue;
    if (t.comment) {
      const shortName = t.fqn.split(".").pop();
      instructions.push(`${shortName}: ${t.comment}`);
    }
  }

  return instructions;
}

/**
 * Run the fast Genie Engine: scrape metadata, then build a space using
 * mostly rule-based passes plus fast-LLM title/instruction/query generation.
 * Typically completes in seconds. The result is a usable space that can be enhanced later with
 * the full engine.
 */
export async function runFastGenieEngine(input: AdHocEngineInput): Promise<AdHocEngineResult> {
  const { tables, config: adhocConfig } = input;

  if (tables.length === 0) {
    throw new Error("At least one table is required");
  }

  const domain = normalizeDomainLabel(adhocConfig?.domain || inferDomain(tables));
  const fiscalYearStartMonth = adhocConfig?.fiscalYearStartMonth ?? 1;

  const fastEndpoint = getFastServingEndpoint();
  const premiumEndpoint = getServingEndpoint();
  logger.info("Fast Genie Engine starting", { tableCount: tables.length, domain });

  // Step 1: Scrape metadata (SQL queries only, no LLM)
  const metadata = await scrapeMetadata(tables);
  const validTableFqns = metadata.tables.map((t) => t.fqn);
  const allowlist = buildSchemaAllowlist(metadata);

  // Step 2: Rule-based joins from foreign keys
  const tableSet = new Set(validTableFqns.map((t) => t.toLowerCase()));
  const fkJoins = buildFkJoins(metadata.foreignKeys, tableSet);
  const existingJoinKeys = new Set(
    fkJoins.flatMap((j) => [
      `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`,
      `${j.rightTable.toLowerCase()}|${j.leftTable.toLowerCase()}`,
    ])
  );
  const heuristicJoins = fkJoins.length === 0 && validTableFqns.length > 1
    ? inferHeuristicJoins(metadata.columns, validTableFqns, existingJoinKeys)
    : [];
  const { accepted: acceptedJoinCandidates, diagnostics: joinDiagnostics } = evaluateJoinCandidates(
    allowlist,
    [
      ...fkJoins.map((j) => ({ ...j, source: "fk" as const, confidence: "high" as const })),
      ...heuristicJoins.map((j) => ({ ...j, source: "heuristic" as const, confidence: "low" as const })),
    ],
    "adhoc_fast_join",
  );
  const allJoins = acceptedJoinCandidates;

  // Step 3: Rule-based entity extraction from schema
  const entityCandidates = extractEntityCandidatesFromSchema(
    metadata.columns.map((c) => ({
      tableFqn: c.tableFqn,
      columnName: c.columnName,
      dataType: c.dataType,
    })),
    validTableFqns,
  );

  // Step 4: Rule-based measures from numeric columns
  const measures = generateNumericMeasures(metadata.columns, validTableFqns);

  // Step 5: Rule-based time periods from date columns
  const autoTimePeriods = adhocConfig?.autoTimePeriods ?? true;
  let timePeriodFilters: EnrichedSqlSnippetFilter[] = [];
  let timePeriodDimensions: EnrichedSqlSnippetDimension[] = [];

  if (autoTimePeriods) {
    const tpResult = generateTimePeriods(
      metadata.columns,
      validTableFqns,
      { fiscalYearStartMonth },
    );
    timePeriodFilters = tpResult.filters;
    timePeriodDimensions = tpResult.dimensions;
  }

  // Step 6: Basic filters
  const basicFilters = generateBasicFilters(metadata.columns, validTableFqns);

  // Step 7: Rule-based instructions from comments
  const instructionResult = await runInstructionGeneration({
    domain,
    subdomains: [],
    businessName: adhocConfig?.title || domain,
    businessContext: resolveBusinessContext(adhocConfig),
    config: buildEngineConfig(adhocConfig),
    entityCandidates,
    joinSpecs: allJoins,
    endpoint: fastEndpoint,
    fallbackEndpoint: premiumEndpoint,
    metadata,
    tableFqns: validTableFqns,
    conversationSummary: adhocConfig?.conversationSummary,
  });
  const instructions = instructionResult.instructions.length > 0
    ? instructionResult.instructions
    : buildRuleBasedInstructions(metadata, validTableFqns, domain, adhocConfig?.conversationSummary);

  const exampleQueryResult = await runExampleQueryGeneration({
    domain,
    tableFqns: validTableFqns,
    metadata,
    allowlist,
    joinSpecs: allJoins,
    endpoint: fastEndpoint,
    fallbackEndpoint: premiumEndpoint,
  });

  // Step 8: Sample questions from entity candidates
  const sampleQuestions = entityCandidates
    .slice(0, 5)
    .map((ec) => `What are the top ${ec.columnName.replace(/_/g, " ")}s?`);

  const passOutputs: GenieEnginePassOutputs = {
    domain,
    subdomains: [],
    tables: validTableFqns,
    metricViews: [],
    columnEnrichments: [],
    entityMatchingCandidates: entityCandidates,
    measures,
    filters: [...basicFilters, ...timePeriodFilters],
    dimensions: timePeriodDimensions,
    trustedQueries: exampleQueryResult.queries,
    trustedFunctions: [],
    textInstructions: instructions,
    sampleQuestions,
    benchmarkQuestions: [],
    metricViewProposals: [],
    joinSpecs: allJoins,
    joinDiagnostics,
  };

  // Step 9: Assemble via same pipeline as full engine
  const seedId = `fast-${Date.now()}`;
  const titleInputBusinessName = adhocConfig?.title || domain;
  const titleResult = adhocConfig?.title
    ? { title: adhocConfig.title, source: "fallback" as const }
    : await runTitleGeneration({
        businessName: titleInputBusinessName,
        domain,
        subdomains: [],
        tableFqns: validTableFqns,
        conversationSummary: adhocConfig?.conversationSummary,
        endpoint: fastEndpoint,
        fallbackEndpoint: premiumEndpoint,
      });
  const degradedReasons: string[] = [];
  if (validTableFqns.length > 1 && allJoins.length === 0) degradedReasons.push("no_validated_joins");
  if (allJoins.length > 0 && exampleQueryResult.queries.length < 2) degradedReasons.push("insufficient_sample_sql");
  if (titleResult.source === "fallback") degradedReasons.push("title_fallback_used");

  const space = assembleSerializedSpace(passOutputs, {
    runId: seedId,
    businessName: titleInputBusinessName,
    allowlist,
    metadata,
  });

  const recommendation = buildRecommendation(passOutputs, space, titleInputBusinessName, {
    titleOverride: titleResult.title,
    titleSource: titleResult.source,
    degradedReasons,
    qualityScore: scoreQuality(degradedReasons),
    joinDiagnostics,
    promptVersion: "genie-v2-phase2",
  });
  if (adhocConfig?.title) recommendation.title = adhocConfig.title;
  if (adhocConfig?.description) recommendation.description = adhocConfig.description;

  logger.info("Fast Genie Engine complete", {
    domain,
    tables: validTableFqns.length,
    measures: measures.length,
    filters: basicFilters.length + timePeriodFilters.length,
    joins: allJoins.length,
    heuristicJoins: heuristicJoins.length,
    entities: entityCandidates.length,
    timePeriodDimensions: timePeriodDimensions.length,
    sampleSqlQueries: exampleQueryResult.queries.length,
  });

  return { recommendation, passOutputs, metadata, mode: "fast" };
}

// ---------------------------------------------------------------------------
// Full mode — all 7 LLM passes
// ---------------------------------------------------------------------------

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
  const domain = normalizeDomainLabel(adhocConfig?.domain || inferDomain(tables));
  const businessContext = resolveBusinessContext(adhocConfig);

  logger.info("Full ad-hoc Genie Engine starting", {
    tableCount: tables.length,
    domain,
    llmRefinement: engineConfig.llmRefinement,
    generateTrustedAssets: engineConfig.generateTrustedAssets,
    generateBenchmarks: engineConfig.generateBenchmarks,
    generateMetricViews: engineConfig.generateMetricViews,
    hasBusinessContext: !!businessContext,
  });

  onProgress?.("Fetching table metadata...", 5);
  const metadata = await scrapeMetadata(tables);
  const validTableFqns = metadata.tables.map((t) => t.fqn);
  const allowlist = buildSchemaAllowlist(metadata);

  // Pass 1 (fast) + Pass 2 (premium) in parallel
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
  const fkJoins = buildFkJoins(metadata.foreignKeys, tableSet);

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

  const existingAllJoinKeys = new Set(
    [...fkJoins, ...llmJoins].flatMap((j) => [
      `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`,
      `${j.rightTable.toLowerCase()}|${j.leftTable.toLowerCase()}`,
    ])
  );
  const heuristicJoins =
    validTableFqns.length > 1 && fkJoins.length + llmJoins.length === 0
      ? inferHeuristicJoins(metadata.columns, validTableFqns, existingAllJoinKeys)
      : [];
  const { accepted: acceptedJoinCandidates, diagnostics: joinDiagnostics } = evaluateJoinCandidates(
    allowlist,
    [
      ...fkJoins.map((j) => ({ ...j, source: "fk" as const, confidence: "high" as const })),
      ...llmJoins.map((j) => ({ ...j, source: "llm" as const, confidence: "medium" as const })),
      ...heuristicJoins.map((j) => ({ ...j, source: "heuristic" as const, confidence: "low" as const })),
    ],
    "adhoc_full_join",
  );
  const allJoins = acceptedJoinCandidates;

  logger.info("Ad-hoc join specs assembled", {
    domain,
    fkJoins: fkJoins.length,
    llmInferred: llmJoins.length,
    total: allJoins.length,
  });

  // Passes 3-6 in parallel (mirrors processDomain structure)
  onProgress?.("Creating trusted assets, instructions, benchmarks & metric views...", 50);
  const [trustedResult, instructionResult, benchmarkResult, metricViewResult] = await Promise.all([
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

    runInstructionGeneration({
      domain,
      subdomains: [],
      businessName: adhocConfig?.title || domain,
      businessContext,
      config: engineConfig,
      entityCandidates: columnResult.entityCandidates,
      joinSpecs: allJoins,
      endpoint: fastEndpoint,
      fallbackEndpoint: premiumEndpoint,
      metadata,
      tableFqns: validTableFqns,
      conversationSummary: adhocConfig?.conversationSummary,
      signal,
    }),

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

  let trustedQueries = trustedResult.queries;
  if (trustedQueries.length === 0) {
    const exampleResult = await runExampleQueryGeneration({
      domain,
      tableFqns: validTableFqns,
      metadata,
      allowlist,
      joinSpecs: allJoins,
      endpoint: fastEndpoint,
      fallbackEndpoint: premiumEndpoint,
      signal,
    });
    trustedQueries = exampleResult.queries;
  }

  const trustedQuestionTexts = trustedQueries
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
    trustedQueries,
    trustedFunctions: [],
    textInstructions: instructionResult.instructions,
    sampleQuestions,
    benchmarkQuestions: benchmarkResult.benchmarks,
    metricViewProposals: metricViewResult.proposals,
    joinSpecs: allJoins,
    joinDiagnostics,
  };

  const seedId = `adhoc-${Date.now()}`;
  const titleInputBusinessName = adhocConfig?.title || domain;
  const titleResult = adhocConfig?.title
    ? { title: adhocConfig.title, source: "fallback" as const }
    : await runTitleGeneration({
        businessName: titleInputBusinessName,
        domain,
        subdomains: [],
        tableFqns: validTableFqns,
        conversationSummary: adhocConfig?.conversationSummary,
        endpoint: fastEndpoint,
        fallbackEndpoint: premiumEndpoint,
        signal,
      });
  const degradedReasons: string[] = [];
  if (validTableFqns.length > 1 && allJoins.length === 0) degradedReasons.push("no_validated_joins");
  if (allJoins.length > 0 && trustedQueries.length < 2) degradedReasons.push("insufficient_sample_sql");
  if (titleResult.source === "fallback") degradedReasons.push("title_fallback_used");

  const space = assembleSerializedSpace(passOutputs, {
    runId: seedId,
    businessName: titleInputBusinessName,
    allowlist,
    metadata,
  });

  const recommendation = buildRecommendation(passOutputs, space, titleInputBusinessName, {
    titleOverride: titleResult.title,
    titleSource: titleResult.source,
    degradedReasons,
    qualityScore: scoreQuality(degradedReasons),
    joinDiagnostics,
    promptVersion: "genie-v2-phase2",
  });
  if (adhocConfig?.title) recommendation.title = adhocConfig.title;
  if (adhocConfig?.description) recommendation.description = adhocConfig.description;

  onProgress?.("Complete", 100);

  logger.info("Full ad-hoc Genie Engine complete", {
    domain,
    tables: validTableFqns.length,
    measures: exprResult.measures.length,
    filters: exprResult.filters.length,
    joins: allJoins.length,
    instructions: instructionResult.instructions.length,
    trustedQueries: trustedQueries.length,
    benchmarks: benchmarkResult.benchmarks.length,
    metricViews: metricViewResult.proposals.length,
    sampleQuestions: sampleQuestions.length,
  });

  return { recommendation, passOutputs, metadata, mode: "full" };
}

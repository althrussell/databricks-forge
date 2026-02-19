/**
 * Genie Engine — multi-pass, LLM-powered, configurable space generator.
 *
 * Orchestrates 7 passes (0-6) to produce production-grade Genie Space
 * recommendations with full knowledge stores, benchmarks, metric view
 * proposals, and trusted assets. All LLM output is grounded to the
 * physical schema via the SchemaAllowlist.
 */

import type {
  PipelineRun,
  UseCase,
  MetadataSnapshot,
  BusinessContext,
  SensitivityClassification,
} from "@/lib/domain/types";
import type {
  GenieEngineConfig,
  GenieSpaceRecommendation,
  GenieEnginePassOutputs,
  SampleDataCache,
} from "./types";
import { defaultGenieEngineConfig } from "./types";
import { buildSchemaAllowlist } from "./schema-allowlist";
import { runTableSelection, type DomainGroup } from "./passes/table-selection";
import { runColumnIntelligence } from "./passes/column-intelligence";
import { runSemanticExpressions } from "./passes/semantic-expressions";
import { runTrustedAssetAuthoring } from "./passes/trusted-assets";
import { runInstructionGeneration } from "./passes/instruction-generation";
import { runBenchmarkGeneration } from "./passes/benchmark-generation";
import { runMetricViewProposals } from "./passes/metric-view-proposals";
import { assembleSerializedSpace, buildRecommendation } from "./assembler";
import { logger } from "@/lib/logger";

export interface GenieEngineInput {
  run: PipelineRun;
  useCases: UseCase[];
  metadata: MetadataSnapshot;
  config?: GenieEngineConfig;
  sampleData?: SampleDataCache | null;
  piiClassifications?: SensitivityClassification[];
  onProgress?: (message: string, percent: number) => void;
}

export interface GenieEngineResult {
  recommendations: GenieSpaceRecommendation[];
  passOutputs: GenieEnginePassOutputs[];
}

/**
 * Run the full Genie Engine pipeline.
 *
 * Produces one recommendation per domain with:
 * - Column enrichments + entity matching candidates
 * - Semantic SQL expressions (auto time periods + LLM business expressions)
 * - Trusted assets (parameterized queries + UDF definitions)
 * - Text instructions (business context, clarification rules, entity guidance)
 * - Benchmark questions with expected SQL
 * - Metric view proposals (YAML + DDL)
 */
export async function runGenieEngine(input: GenieEngineInput): Promise<GenieEngineResult> {
  const {
    run, useCases, metadata,
    config = defaultGenieEngineConfig(),
    sampleData = null,
    piiClassifications,
    onProgress,
  } = input;

  const endpoint = run.config.aiModel;
  const allowlist = buildSchemaAllowlist(metadata);

  logger.info("Genie Engine starting", {
    runId: run.runId,
    useCaseCount: useCases.length,
    tableCount: metadata.tableCount,
    llmRefinement: config.llmRefinement,
    sampleDataAvailable: sampleData ? sampleData.size : 0,
  });

  // Pass 0: Table Selection + Grouping
  onProgress?.("Grouping tables into domains...", 5);
  const domainGroups = runTableSelection(useCases, metadata, config);

  if (domainGroups.length === 0) {
    logger.warn("No domain groups produced", { runId: run.runId });
    return { recommendations: [], passOutputs: [] };
  }

  logger.info("Pass 0 complete: table selection", {
    domainCount: domainGroups.length,
    domains: domainGroups.map((g) => `${g.domain} (${g.tables.length} tables)`),
  });

  // Process each domain
  const recommendations: GenieSpaceRecommendation[] = [];
  const allPassOutputs: GenieEnginePassOutputs[] = [];

  for (let di = 0; di < domainGroups.length; di++) {
    const group = domainGroups[di];
    const domainPct = Math.round(10 + (di / domainGroups.length) * 85);

    if (group.tables.length === 0) {
      logger.info("Skipping domain with no tables", { domain: group.domain });
      continue;
    }

    try {
      const outputs = await processDomain(
        group, run, metadata, allowlist, config,
        sampleData, piiClassifications, endpoint,
        (msg) => onProgress?.(`[${group.domain}] ${msg}`, domainPct)
      );

      allPassOutputs.push(outputs);

      // Assemble the SerializedSpace
      const space = assembleSerializedSpace(outputs, {
        runId: run.runId,
        businessName: run.config.businessName,
        allowlist,
        metadata,
      });

      const rec = buildRecommendation(outputs, space, run.config.businessName);
      rec.useCaseCount = group.useCases.length;
      recommendations.push(rec);

      logger.info("Domain processed", {
        domain: group.domain,
        tables: outputs.tables.length,
        measures: outputs.measures.length,
        filters: outputs.filters.length,
        dimensions: outputs.dimensions.length,
        benchmarks: outputs.benchmarkQuestions.length,
        metricViews: outputs.metricViewProposals.length,
      });
    } catch (err) {
      logger.error("Failed to process domain", {
        domain: group.domain,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onProgress?.("Genie Engine complete", 100);

  recommendations.sort((a, b) => b.useCaseCount - a.useCaseCount);

  logger.info("Genie Engine complete", {
    runId: run.runId,
    recommendationCount: recommendations.length,
  });

  return { recommendations, passOutputs: allPassOutputs };
}

async function processDomain(
  group: DomainGroup,
  run: PipelineRun,
  metadata: MetadataSnapshot,
  allowlist: ReturnType<typeof buildSchemaAllowlist>,
  config: GenieEngineConfig,
  sampleData: SampleDataCache | null,
  piiClassifications: SensitivityClassification[] | undefined,
  endpoint: string,
  onProgress: (msg: string) => void
): Promise<GenieEnginePassOutputs> {
  const { domain, subdomains, tables, metricViews, useCases } = group;

  // Pass 1: Column Intelligence
  onProgress("Analyzing columns...");
  const columnResult = await runColumnIntelligence({
    tableFqns: tables,
    metadata,
    allowlist,
    config,
    sampleData,
    piiClassifications,
    endpoint,
  });

  // Pass 2: Semantic SQL Expressions
  onProgress("Generating SQL expressions...");
  const exprResult = await runSemanticExpressions({
    tableFqns: tables,
    metadata,
    allowlist,
    useCases,
    businessContext: run.businessContext,
    config,
    endpoint,
  });

  // Pass 3: Trusted Asset Authoring (parallel with Pass 4)
  onProgress("Creating trusted assets...");
  const [trustedResult, instructionResult] = await Promise.all([
    config.generateTrustedAssets
      ? runTrustedAssetAuthoring({
          tableFqns: tables,
          metadata,
          allowlist,
          useCases,
          entityCandidates: columnResult.entityCandidates,
          endpoint,
        })
      : Promise.resolve({ queries: [], functions: [] }),

    // Pass 4: Instruction Generation (parallel with Pass 3)
    runInstructionGeneration({
      domain,
      subdomains,
      businessName: run.config.businessName,
      businessContext: run.businessContext,
      config,
      entityCandidates: columnResult.entityCandidates,
      endpoint,
    }),
  ]);

  // Build join specs from foreign keys (needed by Pass 6 and final output)
  const tableSet = new Set(tables.map((t) => t.toLowerCase()));
  const fkJoins = metadata.foreignKeys
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

  // Apply join overrides
  const joinOverrides = config.joinOverrides.filter(
    (j) => tableSet.has(j.leftTable.toLowerCase()) && tableSet.has(j.rightTable.toLowerCase())
  );
  const overrideKeys = new Set(
    joinOverrides.map((j) => `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`)
  );

  const allJoins = [
    ...fkJoins.filter((j) =>
      !overrideKeys.has(`${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`)
    ),
    ...joinOverrides
      .filter((j) => j.enabled)
      .map((j) => ({
        leftTable: j.leftTable,
        rightTable: j.rightTable,
        sql: j.joinSql,
        relationshipType: j.relationshipType,
      })),
  ];

  // Pass 5: Benchmark Generation (parallel with Pass 6)
  onProgress("Generating benchmarks & metric views...");
  const [benchmarkResult, metricViewResult] = await Promise.all([
    config.generateBenchmarks
      ? runBenchmarkGeneration({
          tableFqns: tables,
          metadata,
          allowlist,
          useCases,
          entityCandidates: columnResult.entityCandidates,
          customerBenchmarks: config.benchmarkQuestions,
          endpoint,
        })
      : Promise.resolve({ benchmarks: [...config.benchmarkQuestions] }),

    // Pass 6: Metric View Proposals (parallel with Pass 5)
    config.generateMetricViews
      ? runMetricViewProposals({
          domain,
          tableFqns: tables,
          metadata,
          allowlist,
          useCases,
          measures: exprResult.measures,
          dimensions: exprResult.dimensions,
          joinSpecs: allJoins,
          columnEnrichments: columnResult.enrichments,
          endpoint,
        })
      : Promise.resolve({ proposals: [] }),
  ]);

  // Sample questions: prefer trusted query questions (column-grounded)
  // over abstract use case statements for better Genie vocabulary learning
  const trustedQuestionTexts = trustedResult.queries
    .filter((tq) => tq.question.trim().length > 0)
    .map((tq) => tq.question);
  const fallbackQuestions = useCases
    .slice(0, 5)
    .map((uc) => statementToQuestion(uc.statement));
  const sampleQuestions = [
    ...trustedQuestionTexts.slice(0, 5),
    ...fallbackQuestions,
  ]
    .filter((q, i, arr) => arr.indexOf(q) === i)
    .slice(0, 5);

  return {
    domain,
    subdomains,
    tables,
    metricViews: metricViews.map((mv) => mv.fqn),
    columnEnrichments: columnResult.enrichments,
    entityMatchingCandidates: columnResult.entityCandidates,
    measures: exprResult.measures,
    filters: exprResult.filters,
    dimensions: exprResult.dimensions,
    trustedQueries: trustedResult.queries,
    trustedFunctions: trustedResult.functions,
    textInstructions: instructionResult.instructions,
    sampleQuestions,
    benchmarkQuestions: benchmarkResult.benchmarks,
    metricViewProposals: metricViewResult.proposals,
    joinSpecs: allJoins,
  };
}

function statementToQuestion(statement: string): string {
  const s = statement.trim();
  if (s.endsWith("?")) return s;
  if (/^(identify|detect|find|discover|determine)/i.test(s)) {
    return `How can we ${s.charAt(0).toLowerCase() + s.slice(1)}?`;
  }
  if (/^(analyse|analyze|assess|evaluate|measure)/i.test(s)) {
    return `${s}?`;
  }
  return `What insights can we gain from: ${s}?`;
}

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
import { runJoinInference } from "./passes/join-inference";
import { assembleSerializedSpace, buildRecommendation } from "./assembler";
import { isValidTable } from "./schema-allowlist";
import { logger } from "@/lib/logger";

export interface GenieEngineInput {
  run: PipelineRun;
  useCases: UseCase[];
  metadata: MetadataSnapshot;
  config?: GenieEngineConfig;
  sampleData?: SampleDataCache | null;
  piiClassifications?: SensitivityClassification[];
  /** When set, only regenerate the listed domains (partial run). */
  domainFilter?: string[];
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
    domainFilter,
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
  const allDomainGroups = runTableSelection(useCases, metadata, config);

  // Apply domain filter for partial regeneration
  const domainGroups = domainFilter?.length
    ? allDomainGroups.filter((g) => domainFilter.includes(g.domain))
    : allDomainGroups;

  if (domainGroups.length === 0) {
    logger.warn("No domain groups produced", { runId: run.runId, domainFilter });
    return { recommendations: [], passOutputs: [] };
  }

  logger.info("Pass 0 complete: table selection", {
    domainCount: domainGroups.length,
    totalDomains: allDomainGroups.length,
    filtered: !!domainFilter?.length,
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

  // Build join specs from foreign keys, use case SQL, and LLM inference.
  // Computed before Passes 3-5 so all downstream passes have join context.
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

  const joinOverrides = config.joinOverrides.filter(
    (j) => tableSet.has(j.leftTable.toLowerCase()) && tableSet.has(j.rightTable.toLowerCase())
  );
  const overrideKeys = new Set(
    joinOverrides.map((j) => `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`)
  );

  const fkAndOverrideJoins = [
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

  const existingJoinKeys = new Set(
    fkAndOverrideJoins.map((j) => `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`)
  );
  const sqlInferredJoins = inferJoinsFromUseCaseSql(useCases, tableSet, existingJoinKeys, allowlist);

  let llmInferredJoins: typeof sqlInferredJoins = [];
  if (config.llmRefinement && (fkAndOverrideJoins.length + sqlInferredJoins.length) < 3) {
    try {
      onProgress("Inferring table relationships...");
      const allExistingKeys = new Set([
        ...existingJoinKeys,
        ...sqlInferredJoins.map((j) => `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`),
      ]);
      const llmResult = await runJoinInference({
        tableFqns: tables,
        metadata,
        allowlist,
        existingJoinKeys: allExistingKeys,
        endpoint,
      });
      llmInferredJoins = llmResult.joins;
    } catch (err) {
      logger.warn("LLM join inference failed, continuing with FK + SQL-inferred joins", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allJoins = [...fkAndOverrideJoins, ...sqlInferredJoins, ...llmInferredJoins];

  logger.info("Join specs assembled", {
    domain,
    fkJoins: fkAndOverrideJoins.length,
    sqlInferred: sqlInferredJoins.length,
    llmInferred: llmInferredJoins.length,
    total: allJoins.length,
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
          joinSpecs: allJoins,
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
      joinSpecs: allJoins,
      endpoint,
    }),
  ]);

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
          joinSpecs: allJoins,
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

/**
 * Extract JOIN relationships from use case SQL that already passed EXPLAIN
 * validation. Parses FROM and JOIN clauses to discover table pairs and their
 * join conditions, deduplicating against already-known joins.
 */
function inferJoinsFromUseCaseSql(
  useCases: UseCase[],
  tableSet: Set<string>,
  existingJoinKeys: Set<string>,
  allowlist: ReturnType<typeof buildSchemaAllowlist>
): Array<{ leftTable: string; rightTable: string; sql: string; relationshipType: "many_to_one" }> {
  const discovered = new Map<string, { leftTable: string; rightTable: string; sql: string }>();

  // Match: JOIN `catalog.schema.table` alias ON condition
  // Handles optional backticks/quotes and multi-word aliases
  const joinRegex = /JOIN\s+[`"]?([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)[`"]?\s+(?:AS\s+)?(\w+)\s+ON\s+([^\n;]+)/gi;
  const fromRegex = /FROM\s+[`"]?([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)[`"]?/gi;

  for (const uc of useCases) {
    if (!uc.sqlCode) continue;
    const sql = uc.sqlCode;

    // Collect FROM tables to pair with JOINed tables
    const fromTables: string[] = [];
    let fromMatch: RegExpExecArray | null;
    while ((fromMatch = fromRegex.exec(sql)) !== null) {
      fromTables.push(fromMatch[1]);
    }
    fromRegex.lastIndex = 0;

    let joinMatch: RegExpExecArray | null;
    while ((joinMatch = joinRegex.exec(sql)) !== null) {
      const rightTable = joinMatch[1];
      const onCondition = joinMatch[3].trim();

      // Find the most likely left table from FROM clauses
      const leftTable = fromTables.find((ft) =>
        onCondition.toLowerCase().includes(ft.split(".").pop()!.toLowerCase())
      ) ?? fromTables[0];

      if (!leftTable) continue;

      // Both tables must be in the domain's table set and schema allowlist
      if (
        !tableSet.has(leftTable.toLowerCase()) ||
        !tableSet.has(rightTable.toLowerCase()) ||
        !isValidTable(allowlist, leftTable) ||
        !isValidTable(allowlist, rightTable)
      ) continue;

      const pairKey = `${leftTable.toLowerCase()}|${rightTable.toLowerCase()}`;
      const reversePairKey = `${rightTable.toLowerCase()}|${leftTable.toLowerCase()}`;

      if (existingJoinKeys.has(pairKey) || existingJoinKeys.has(reversePairKey)) continue;
      if (discovered.has(pairKey) || discovered.has(reversePairKey)) continue;

      // Normalize the ON condition to use FQNs where possible
      const joinSql = `${leftTable}.${onCondition.split("=")[0].trim().split(".").pop()} = ${rightTable}.${onCondition.split("=")[1]?.trim().split(".").pop() ?? ""}`.trim();

      discovered.set(pairKey, { leftTable, rightTable, sql: joinSql });
    }
    joinRegex.lastIndex = 0;
  }

  const results = [...discovered.values()].map((j) => ({
    ...j,
    relationshipType: "many_to_one" as const,
  }));

  if (results.length > 0) {
    logger.info("Inferred joins from use case SQL", {
      count: results.length,
      pairs: results.map((j) => `${j.leftTable} -> ${j.rightTable}`),
    });
  }

  return results;
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

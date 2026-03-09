/**
 * Pipeline Step 7: SQL Generation
 *
 * Generates bespoke, runnable SQL for each use case by calling Model Serving
 * (streaming) with full business context, use case details, and actual table schemas.
 *
 * Processing order: domains sorted by size (smallest first), with controlled
 * concurrency within each domain. Matches the reference notebook approach.
 */

import { executeAIQuery, executeAIQueryStream } from "@/lib/ai/agent";
import { executeSQL } from "@/lib/dbx/sql";
import { fetchSampleData } from "@/lib/pipeline/sample-data";
import {
  generateAIFunctionsSummary,
  generateStatisticalFunctionsSummary,
  generateGeospatialFunctionsSummary,
  generateWindowFunctionsSummary,
  generateLambdaFunctionsSummary,
} from "@/lib/ai/functions";
import { buildSchemaMarkdown, buildForeignKeyMarkdown } from "@/lib/queries/metadata";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";
import { groupByDomain } from "@/lib/domain/scoring";
import type {
  PipelineContext,
  UseCase,
  ColumnInfo,
  ForeignKey,
  TableInfo,
} from "@/lib/domain/types";
import { validateColumnReferences } from "@/lib/validation/sql-columns";
import { reviewAndFixSql } from "@/lib/ai/sql-reviewer";
import { isReviewEnabled } from "@/lib/dbx/client";
import "@/lib/skills/content";
import { resolveForPipelineStep, formatContextSections } from "@/lib/skills/resolver";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SQL = Math.max(
  1,
  parseInt(process.env.SQL_GEN_MAX_CONCURRENT ?? "3", 10) || 3,
);

const WAVE_DELAY_MS = Math.max(0, parseInt(process.env.SQL_GEN_WAVE_DELAY_MS ?? "2000", 10) || 0);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runSqlGeneration(ctx: PipelineContext, runId?: string): Promise<UseCase[]> {
  const { run, metadata } = ctx;
  if (!metadata) throw new Error("Metadata not available");
  if (!run.businessContext) throw new Error("Business context not available");

  const bc = run.businessContext;
  const useCases = ctx.useCases;

  if (useCases.length === 0) return useCases;

  // Build a lookup index: table FQN -> columns
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const col of metadata.columns) {
    const existing = columnsByTable.get(col.tableFqn) ?? [];
    existing.push(col);
    columnsByTable.set(col.tableFqn, existing);
  }

  // Build a lookup index: table FQN -> TableInfo
  const tableByFqn = new Map<string, TableInfo>();
  for (const t of metadata.tables) {
    tableByFqn.set(t.fqn, t);
  }

  // Group use cases by domain, smallest domains first
  const grouped = groupByDomain(useCases);
  const sortedDomains = Object.entries(grouped).sort(([, a], [, b]) => a.length - b.length);

  const totalUseCases = useCases.length;
  let completed = 0;
  let failed = 0;

  // Diagnostic accumulators for summary logging
  const outcomes: { id: string; name: string; domain: string; status: string; qualityScore?: number }[] = [];
  let hallucinationAttempts = 0;
  let hallucinationFixed = 0;
  let executionFixAttempts = 0;
  let executionFixed = 0;
  let truncatedCount = 0;
  let reviewFixApplied = 0;
  let reviewFixRejected = 0;

  // Shared prompt variables (business context -- same for all use cases)
  const businessVars: Record<string, string> = {
    business_name: run.config.businessName,
    business_context: JSON.stringify(bc),
    strategic_goals: bc.strategicGoals,
    business_priorities: bc.businessPriorities,
    strategic_initiative: bc.strategicInitiative,
    value_chain: bc.valueChain,
    revenue_model: bc.revenueModel,
    sql_model_serving: run.config.aiModel,
  };

  // Function reference docs (computed once)
  const aiFunctionsSummary = generateAIFunctionsSummary();
  const statisticalFunctionsSummary = generateStatisticalFunctionsSummary();
  const geospatialFunctionsSummary = generateGeospatialFunctionsSummary();
  const windowFunctionsSummary = generateWindowFunctionsSummary();
  const lambdaFunctionsSummary = generateLambdaFunctionsSummary();

  // Skill context (computed once, injected into every prompt)
  const sqlSkillCtx = resolveForPipelineStep("sql-generation", { contextBudget: 3000 });
  businessVars.skill_reference = formatContextSections(sqlSkillCtx.contextSections);

  const sampleRows = run.config.sampleRowsPerTable ?? 0;

  // Progress interpolation: SQL generation spans 67% → 95% of overall pipeline
  const PROGRESS_START = 67;
  const PROGRESS_END = 95;
  const progressPerUseCase =
    totalUseCases > 0 ? (PROGRESS_END - PROGRESS_START) / totalUseCases : 0;

  function currentProgress(): number {
    return Math.round(PROGRESS_START + completed * progressPerUseCase);
  }

  logger.info("SQL generation starting", {
    useCaseCount: totalUseCases,
    domainCount: sortedDomains.length,
    sampleRows,
  });

  for (const [domain, domainCases] of sortedDomains) {
    if (runId) {
      await updateRunMessage(
        runId,
        `Generating SQL for domain "${domain}" (${domainCases.length} use cases, ${completed}/${totalUseCases} done)...`,
        currentProgress(),
      );
    }

    // Process use cases within this domain in waves of MAX_CONCURRENT_SQL
    for (let i = 0; i < domainCases.length; i += MAX_CONCURRENT_SQL) {
      const wave = domainCases.slice(i, i + MAX_CONCURRENT_SQL);

      const results = await Promise.allSettled(
        wave.map((uc) =>
          generateSqlForUseCase(
            uc,
            businessVars,
            aiFunctionsSummary,
            statisticalFunctionsSummary,
            geospatialFunctionsSummary,
            windowFunctionsSummary,
            lambdaFunctionsSummary,
            columnsByTable,
            tableByFqn,
            metadata.foreignKeys,
            run.config.aiModel,
            sampleRows,
            runId,
            run.createdBy,
          ),
        ),
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const uc = wave[j];

        if (result.status === "fulfilled" && result.value.sql) {
          const { sql: genSql, diag } = result.value;
          uc.sqlCode = genSql;
          uc.sqlStatus = "generated";

          if (diag.hadHallucination) hallucinationAttempts++;
          if (diag.hallucinationFixed) hallucinationFixed++;
          if (diag.hadExecutionError) executionFixAttempts++;
          if (diag.executionFixed) executionFixed++;
          if (diag.wasTruncated) truncatedCount++;
          if (diag.reviewApplied) reviewFixApplied++;
          if (diag.reviewRejected) reviewFixRejected++;

          outcomes.push({
            id: uc.id,
            name: uc.name,
            domain,
            status: "generated",
            qualityScore: diag.qualityScore,
          });
        } else {
          const reason =
            result.status === "rejected"
              ? result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
              : result.status === "fulfilled"
                ? "empty/null SQL"
                : "empty response";

          // Still accumulate diagnostics from fulfilled-but-null results
          if (result.status === "fulfilled") {
            const { diag } = result.value;
            if (diag.hadHallucination) hallucinationAttempts++;
            if (diag.wasTruncated) truncatedCount++;
          }

          logger.warn("SQL generation failed for use case", {
            useCaseId: uc.id,
            name: uc.name,
            reason,
          });
          uc.sqlCode = null;
          uc.sqlStatus = "failed";
          failed++;
          outcomes.push({ id: uc.id, name: uc.name, domain, status: `failed: ${reason.substring(0, 100)}` });
        }
        completed++;
      }

      if (runId) {
        await updateRunMessage(
          runId,
          `SQL generation: ${completed}/${totalUseCases} complete (${failed} failed)`,
          currentProgress(),
        );
      }

      // Cooldown between waves to spread output tokens across the rate-limit window
      if (WAVE_DELAY_MS > 0 && completed < totalUseCases) {
        await new Promise((resolve) => setTimeout(resolve, WAVE_DELAY_MS));
      }
    }
  }

  logger.info("SQL generation complete", {
    generated: completed - failed,
    failed,
    hallucinationAttempts,
    hallucinationFixed,
    executionFixAttempts,
    executionFixed,
    truncatedCount,
    reviewFixApplied,
    reviewFixRejected,
    outcomes: outcomes.map((o) => `${o.domain}/${o.name}: ${o.status}`),
  });

  return useCases;
}

// ---------------------------------------------------------------------------
// Per-use-case SQL generation
// ---------------------------------------------------------------------------

interface SqlGenDiagnostics {
  hadHallucination: boolean;
  hallucinationFixed: boolean;
  hadExecutionError: boolean;
  executionFixed: boolean;
  wasTruncated: boolean;
  reviewApplied: boolean;
  reviewRejected: boolean;
  qualityScore?: number;
}

interface SqlGenResult {
  sql: string | null;
  diag: SqlGenDiagnostics;
}

function emptyDiag(): SqlGenDiagnostics {
  return {
    hadHallucination: false,
    hallucinationFixed: false,
    hadExecutionError: false,
    executionFixed: false,
    wasTruncated: false,
    reviewApplied: false,
    reviewRejected: false,
  };
}

async function generateSqlForUseCase(
  uc: UseCase,
  businessVars: Record<string, string>,
  aiFunctionsSummary: string,
  statisticalFunctionsSummary: string,
  geospatialFunctionsSummary: string,
  windowFunctionsSummary: string,
  lambdaFunctionsSummary: string,
  columnsByTable: Map<string, ColumnInfo[]>,
  tableByFqn: Map<string, TableInfo>,
  allForeignKeys: ForeignKey[],
  aiModel: string,
  sampleRowsPerTable: number,
  runId?: string,
  userEmail?: string | null,
): Promise<SqlGenResult> {
  const diag = emptyDiag();
  // Resolve table schemas for this use case's involved tables
  const involvedTables: TableInfo[] = [];
  const involvedColumns: ColumnInfo[] = [];

  const resolvedFqns: string[] = [];
  const unresolvedFqns: string[] = [];

  for (const fqn of uc.tablesInvolved) {
    // Try exact match, then try with backtick-stripped version
    const cleanFqn = fqn.replace(/`/g, "");
    const tableInfo = tableByFqn.get(fqn) ?? tableByFqn.get(cleanFqn);
    if (tableInfo) involvedTables.push(tableInfo);

    const cols = columnsByTable.get(fqn) ?? columnsByTable.get(cleanFqn) ?? [];
    involvedColumns.push(...cols);

    if (cols.length > 0) {
      resolvedFqns.push(`${cleanFqn}(${cols.length} cols)`);
    } else {
      unresolvedFqns.push(cleanFqn);
    }
  }

  if (unresolvedFqns.length > 0) {
    logger.warn("Some tables in use case have no column metadata", {
      useCaseId: uc.id,
      unresolvedTables: unresolvedFqns,
      resolvedTables: resolvedFqns,
    });
  }

  if (involvedColumns.length === 0) {
    logger.warn("No column metadata for use case", { useCaseId: uc.id, tables: uc.tablesInvolved });
  }

  // Build schema markdown scoped to this use case's tables
  const schemaMarkdown =
    involvedTables.length > 0
      ? buildSchemaMarkdown(involvedTables, involvedColumns)
      : uc.tablesInvolved.map((t) => `### ${t}\n  (schema not available)`).join("\n\n");

  // Filter foreign keys to only those involving this use case's tables
  const involvedFqns = new Set(uc.tablesInvolved.map((t) => t.replace(/`/g, "")));
  const relevantFKs = allForeignKeys.filter(
    (fk) =>
      involvedFqns.has(fk.tableFqn.replace(/`/g, "")) ||
      involvedFqns.has(fk.referencedTableFqn.replace(/`/g, "")),
  );
  const fkMarkdown = buildForeignKeyMarkdown(relevantFKs);

  // Fetch sample data if enabled
  let sampleDataSection = "";
  if (sampleRowsPerTable > 0 && uc.tablesInvolved.length > 0) {
    const sampleResult = await fetchSampleData(uc.tablesInvolved, sampleRowsPerTable, {
      runId,
      userEmail,
      step: "sql-generation",
    });
    sampleDataSection = sampleResult.markdown;
  }

  // Build the per-use-case prompt variables
  const variables: Record<string, string> = {
    ...businessVars,
    use_case_id: uc.id,
    use_case_name: uc.name,
    business_domain: uc.domain,
    use_case_type: uc.type,
    analytics_technique: uc.analyticsTechnique,
    statement: uc.statement,
    solution: uc.solution,
    tables_involved: uc.tablesInvolved.join(", "),
    directly_involved_schema: schemaMarkdown,
    foreign_key_relationships: fkMarkdown,
    sample_data_section: sampleDataSection,
    ai_functions_summary: uc.type === "AI" ? aiFunctionsSummary : "",
    statistical_functions_detailed: uc.type === "Statistical" ? statisticalFunctionsSummary : "",
    geospatial_functions_summary: uc.type === "Geospatial" ? geospatialFunctionsSummary : "",
    window_functions_summary: isWindowRelevant(uc.type, uc.analyticsTechnique)
      ? windowFunctionsSummary
      : "",
    lambda_functions_summary: isLambdaRelevant(uc.type, uc.analyticsTechnique, involvedColumns)
      ? lambdaFunctionsSummary
      : "",
  };

  // Use streaming for SQL generation -- it's the longest-running LLM call
  // and streaming reduces perceived latency by allowing early truncation detection
  const result = await executeAIQueryStream({
    promptKey: "USE_CASE_SQL_GEN_PROMPT",
    variables,
    modelEndpoint: aiModel,
    runId,
    step: "sql-generation",
  });

  const sql = cleanSqlResponse(result.rawResponse);

  if (!sql || sql.length < 20) {
    return { sql: null, diag };
  }

  // Detect truncated SQL (LLM ran out of tokens mid-query)
  if (isTruncatedSql(sql)) {
    diag.wasTruncated = true;
    logger.warn("SQL appears truncated (output token limit hit), attempting fix", {
      useCaseId: uc.id,
      sqlPreview: sql.substring(Math.max(0, sql.length - 120)),
    });
    const fixedSql = await attemptSqlFix(
      uc,
      sql,
      "SQL query is truncated / incomplete — syntax error at end of input. The original query was too long. Simplify the query: reduce to 3-5 CTEs, remove redundant calculations, keep under 120 lines total.",
      schemaMarkdown,
      fkMarkdown,
      aiModel,
      runId,
    );
    if (fixedSql) return { sql: fixedSql, diag };
    return { sql: null, diag };
  }

  // Strict column validation -- hallucinated columns trigger a fix cycle
  let currentSql = sql;
  const validation = validateSqlOutput(currentSql, uc.tablesInvolved, involvedColumns);
  if (!validation.valid) {
    logger.warn("SQL validation failed", {
      useCaseId: uc.id,
      warnings: validation.warnings,
      sqlPreview: currentSql.substring(0, 200),
    });
  }

  if (validation.unknownColumns.length > 0) {
    diag.hadHallucination = true;
    logger.info("Hallucinated columns detected, attempting fix", {
      useCaseId: uc.id,
      unknownColumns: validation.unknownColumns,
      knownColumnCount: involvedColumns.length,
      tablesResolved: involvedTables.length,
      tablesRequested: uc.tablesInvolved.length,
      sqlPreview: currentSql.substring(0, 200),
    });

    const columnErrorMsg = buildColumnViolationMessage(
      validation.unknownColumns,
      involvedColumns,
      uc.tablesInvolved,
    );

    const fixedSql = await attemptSqlFix(
      uc,
      currentSql,
      columnErrorMsg,
      schemaMarkdown,
      fkMarkdown,
      aiModel,
      runId,
      sampleDataSection,
    );

    if (!fixedSql) {
      logger.warn("Column fix failed, rejecting SQL", { useCaseId: uc.id });
      return { sql: null, diag };
    }

    const revalidation = validateSqlOutput(fixedSql, uc.tablesInvolved, involvedColumns);
    if (revalidation.unknownColumns.length > 0) {
      logger.warn("Fixed SQL still contains hallucinated columns, rejecting", {
        useCaseId: uc.id,
        unknownColumns: revalidation.unknownColumns,
        knownColumnCount: involvedColumns.length,
        tablesResolved: involvedTables.length,
        tablesRequested: uc.tablesInvolved.length,
      });
      return { sql: null, diag };
    }

    diag.hallucinationFixed = true;
    currentSql = fixedSql;
  }

  // Attempt to execute the SQL to catch runtime errors; if it fails, try fix prompt
  const executionError = await trySqlExecution(currentSql);
  if (executionError) {
    diag.hadExecutionError = true;
    logger.info("SQL execution failed, attempting fix", {
      useCaseId: uc.id,
      error: executionError,
      sqlPreview: currentSql.substring(0, 200),
    });
    const fixedSql = await attemptSqlFix(
      uc,
      currentSql,
      executionError,
      schemaMarkdown,
      fkMarkdown,
      aiModel,
      runId,
      sampleDataSection,
    );
    if (fixedSql) {
      diag.executionFixed = true;
      currentSql = fixedSql;
    } else {
      logger.warn("SQL fix failed, returning original SQL", { useCaseId: uc.id });
    }
  }

  // LLM review gate: if the review endpoint is configured, run a quality
  // review that catches issues EXPLAIN cannot (suboptimal joins, missing
  // filters, non-idiomatic Databricks SQL, readability).
  if (isReviewEnabled("pipeline-sql")) {
    const review = await reviewAndFixSql(currentSql, {
      schemaContext: schemaMarkdown,
      surface: "pipeline-sql",
    });
    diag.qualityScore = review.qualityScore;
    if (review.fixedSql) {
      const fixError = await trySqlExecution(review.fixedSql);
      if (!fixError) {
        const reviewColCheck = validateSqlOutput(
          review.fixedSql,
          uc.tablesInvolved,
          involvedColumns,
        );
        if (reviewColCheck.unknownColumns.length > 0) {
          diag.reviewRejected = true;
          logger.warn("Review fix introduced hallucinated columns, keeping original", {
            useCaseId: uc.id,
            unknownColumns: reviewColCheck.unknownColumns,
          });
        } else {
          diag.reviewApplied = true;
          logger.info("SQL review applied fix", {
            useCaseId: uc.id,
            qualityScore: review.qualityScore,
            issueCount: review.issues.length,
          });
          currentSql = review.fixedSql;
        }
      } else {
        diag.reviewRejected = true;
        logger.warn("Review fix failed EXPLAIN, keeping original", {
          useCaseId: uc.id,
          explainError: fixError.substring(0, 200),
        });
      }
    } else if (review.verdict === "fail") {
      logger.warn("SQL review verdict: fail (no fix available)", {
        useCaseId: uc.id,
        qualityScore: review.qualityScore,
        issues: review.issues.map((i) => `[${i.category}] ${i.message}`),
      });
    }
  }

  return { sql: currentSql, diag };
}

/**
 * Try executing the generated SQL with EXPLAIN to check for syntax/semantic
 * errors without actually running the full query.
 * Returns the error message on failure, or null on success.
 */
async function trySqlExecution(sql: string): Promise<string | null> {
  // Pipe syntax (|>) is valid Databricks SQL but not supported by EXPLAIN
  if (/\|>/.test(sql)) {
    logger.info("Skipping EXPLAIN validation for pipe-syntax query");
    return null;
  }
  try {
    await executeSQL(`EXPLAIN ${sql}`);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Send the failing SQL through the USE_CASE_SQL_FIX_PROMPT to attempt a fix.
 */
async function attemptSqlFix(
  uc: UseCase,
  originalSql: string,
  errorMessage: string,
  schemaMarkdown: string,
  fkMarkdown: string,
  aiModel: string,
  runId?: string,
  sampleDataSection?: string,
): Promise<string | null> {
  try {
    const result = await executeAIQuery({
      promptKey: "USE_CASE_SQL_FIX_PROMPT",
      variables: {
        use_case_id: uc.id,
        use_case_name: uc.name,
        directly_involved_schema: schemaMarkdown,
        foreign_key_relationships: fkMarkdown,
        sample_data_section: sampleDataSection ?? "",
        original_sql: originalSql,
        error_message: errorMessage,
      },
      modelEndpoint: aiModel,
      temperature: 0.1,
      retries: 0,
      runId,
      step: "sql-generation",
    });

    const fixedSql = cleanSqlResponse(result.rawResponse);
    if (!fixedSql || fixedSql.length < 20) {
      return null;
    }

    // Verify the fix actually works
    const fixError = await trySqlExecution(fixedSql);
    if (fixError) {
      logger.warn("Fixed SQL still fails EXPLAIN", { useCaseId: uc.id, error: fixError });
      return null;
    }

    logger.info("SQL fix successful", { useCaseId: uc.id });
    return fixedSql;
  } catch (error) {
    logger.warn("SQL fix prompt failed", {
      useCaseId: uc.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Use-case-type relevance checks for function summaries
// ---------------------------------------------------------------------------

const WINDOW_RELEVANT_TYPES = new Set([
  "Statistical",
  "Descriptive",
  "Predictive",
  "Diagnostic",
  "Comparative",
]);

const WINDOW_RELEVANT_TECHNIQUES =
  /\b(time.?series|trend|ranking|segmentat|cohort|cumulative|running|moving.?average|period.?over|month.?over|year.?over|churn|retention|growth|lag|lead|percentile|distribution)/i;

function isWindowRelevant(ucType: string, technique: string): boolean {
  if (WINDOW_RELEVANT_TYPES.has(ucType)) return true;
  return WINDOW_RELEVANT_TECHNIQUES.test(technique);
}

function isLambdaRelevant(ucType: string, technique: string, columns: ColumnInfo[]): boolean {
  const hasArrayOrMapCol = columns.some(
    (c) =>
      /^(ARRAY|MAP|STRUCT)/i.test(c.dataType) ||
      c.dataType.toLowerCase().includes("array") ||
      c.dataType.toLowerCase().includes("map"),
  );
  if (hasArrayOrMapCol) return true;
  return /\b(array|transform|tag|categor|multi.?value|complex.?type|nested|json|parse)/i.test(
    technique,
  );
}

// ---------------------------------------------------------------------------
// Column violation error message builder
// ---------------------------------------------------------------------------

function buildColumnViolationMessage(
  unknownColumns: string[],
  knownColumns: ColumnInfo[],
  tablesInvolved: string[],
): string {
  const columnsByTable = new Map<string, string[]>();
  for (const col of knownColumns) {
    const existing = columnsByTable.get(col.tableFqn) ?? [];
    existing.push(col.columnName);
    columnsByTable.set(col.tableFqn, existing);
  }

  const validColLines = tablesInvolved
    .map((fqn) => {
      const cleanFqn = fqn.replace(/`/g, "");
      const cols = columnsByTable.get(fqn) ?? columnsByTable.get(cleanFqn) ?? [];
      return `  ${cleanFqn}: ${cols.join(", ")}`;
    })
    .join("\n");

  const allKnownNames = knownColumns.map((c) => c.columnName);
  const bareNames = unknownColumns.map((c) => (c.includes(".") ? c.split(".").pop()! : c));

  const suggestions = bareNames
    .map((bare) => {
      const closest = findClosestColumn(bare, allKnownNames);
      return closest ? `  - "${bare}" -> did you mean "${closest}"?` : null;
    })
    .filter((s): s is string => s !== null);

  const lines = [
    `SCHEMA VIOLATION: SQL references columns that do not exist in the schema: ${bareNames.join(", ")}.`,
    `These columns are hallucinated -- they do NOT exist in any of the involved tables.`,
    ``,
    `The ONLY valid columns are:`,
    validColLines,
  ];

  if (suggestions.length > 0) {
    lines.push(``, `Possible matches (use ONLY if semantically correct):`, ...suggestions);
  }

  // Detect from_json() alias pattern (parsed.field, parsed_result.field, etc.)
  const parsedPrefixes = unknownColumns
    .filter((c) => c.includes("."))
    .map((c) => c.split(".")[0].toLowerCase());
  const hasParsedAliasIssue = parsedPrefixes.some(
    (p) => p === "parsed" || p === "parsed_result" || p === "ai_result" || p === "result",
  );

  lines.push(
    ``,
    `Remove ALL references to the non-existent columns listed above. Use ONLY columns`,
    `from the valid list. Do NOT substitute or guess alternative names -- if no suitable`,
    `column exists, simplify the query to remove that logic entirely.`,
  );

  if (hasParsedAliasIssue) {
    lines.push(
      ``,
      `NOTE: Some flagged columns appear to be from_json() struct fields (e.g. parsed.field).`,
      `If using ai_query() with failOnError => false and from_json(), use EXACTLY these alias names:`,
      `  - ai_query(...) AS ai_result`,
      `  - from_json(ai_result.result, 'STRUCT<...>') AS parsed_result`,
      `  - Access fields as: parsed_result.field_name`,
      `NEVER use "parsed" or other abbreviations as the from_json alias.`,
    );
  }

  return lines.join("\n");
}

/**
 * Find the closest column name by Levenshtein distance.
 * Returns the closest match if the edit distance is within 60% of the
 * query length, otherwise null.
 */
function findClosestColumn(query: string, candidates: string[]): string | null {
  if (candidates.length === 0) return null;

  const q = query.toLowerCase();
  const maxDist = Math.max(3, Math.floor(q.length * 0.6));
  let bestDist = maxDist + 1;
  let bestMatch: string | null = null;

  for (const candidate of candidates) {
    const dist = levenshtein(q, candidate.toLowerCase());
    if (dist < bestDist) {
      bestDist = dist;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[n];
}

// ---------------------------------------------------------------------------
// SQL output validation
// ---------------------------------------------------------------------------

interface SqlValidationResult {
  valid: boolean;
  warnings: string[];
  unknownColumns: string[];
}

/**
 * Lightweight structural validation of generated SQL.
 * Checks that the SQL starts with a recognized keyword, references at least
 * one of the expected tables, and doesn't reference columns that don't exist
 * in the schema.
 */
function validateSqlOutput(
  sql: string,
  tablesInvolved: string[],
  columns: ColumnInfo[],
): SqlValidationResult {
  const warnings: string[] = [];
  const upperSql = sql.toUpperCase();
  const normalizedSql = sql.replace(/`/g, "");

  // Check 1: SQL starts with a recognized keyword (FROM supports pipe syntax)
  const startsValid = /^(--|WITH\b|SELECT\b|CREATE\b|FROM\b)/i.test(sql.trim());
  if (!startsValid) {
    warnings.push("SQL does not start with --, WITH, SELECT, CREATE, or FROM");
  }

  // Check 2: At least one expected table is referenced
  if (tablesInvolved.length > 0) {
    const hasTableRef = tablesInvolved.some((fqn) => {
      const cleanFqn = fqn.replace(/`/g, "");
      const parts = cleanFqn.split(".");
      const tableName = parts[parts.length - 1];
      return normalizedSql.includes(cleanFqn) || upperSql.includes(tableName.toUpperCase());
    });
    if (!hasTableRef) {
      warnings.push(`SQL does not reference any expected table: ${tablesInvolved.join(", ")}`);
    }
  }

  // Check 3: Validate column references against known schema using the
  // shared validation module (handles both plain and backtick-quoted columns).
  if (columns.length > 0) {
    const knownColumns = new Set(columns.map((c) => c.columnName.toLowerCase()));

    const colResult = validateColumnReferences(sql, knownColumns, {
      tablesInvolved,
      allowAiFunctionFields: true,
    });

    warnings.push(...colResult.warnings);

    return {
      valid: warnings.length === 0,
      warnings,
      unknownColumns: colResult.unknownColumns,
    };
  }

  return {
    valid: warnings.length === 0,
    warnings,
    unknownColumns: [],
  };
}

// ---------------------------------------------------------------------------
// Response cleaning
// ---------------------------------------------------------------------------

/**
 * Detect if the SQL output was truncated due to hitting the LLM's output
 * token limit. Truncated SQL typically ends mid-expression without a
 * complete final statement.
 */
function isTruncatedSql(sql: string): boolean {
  const trimmed = sql.trimEnd();

  // If the SQL ends with the expected end marker, it's complete
  if (trimmed.endsWith("--END OF GENERATED SQL")) return false;

  // If it ends with a semicolon (optionally followed by a comment), it's complete
  if (/;\s*(--[^\n]*)?$/.test(trimmed)) return false;

  // If it ends with LIMIT N, it's likely complete (just missing semicolon)
  if (/LIMIT\s+\d+\s*$/i.test(trimmed)) return false;

  // If it ends mid-expression (after a comma, operator, or incomplete keyword),
  // it's likely truncated
  if (/[,(+\-*/=<>]\s*$/.test(trimmed)) return true;
  if (
    /\b(AND|OR|ON|FROM|JOIN|WHERE|SELECT|GROUP|ORDER|HAVING|BY|AS|CASE|WHEN|THEN)\s*$/i.test(
      trimmed,
    )
  )
    return true;

  // If the query is very long (200+ lines) and doesn't end cleanly, likely truncated
  const lineCount = trimmed.split("\n").length;
  if (lineCount > 150 && !/\)\s*$/.test(trimmed)) return true;

  return false;
}

/**
 * Strip markdown fences, preamble text, and JSON wrappers that the LLM
 * may have included despite instructions.
 */
function cleanSqlResponse(raw: string): string {
  let sql = raw.trim();

  // Strip markdown code fences
  if (sql.startsWith("```")) {
    const firstNewline = sql.indexOf("\n");
    sql = sql.substring(firstNewline + 1);
  }
  if (sql.endsWith("```")) {
    sql = sql.substring(0, sql.lastIndexOf("```"));
  }

  // Strip any leading text before the first SQL comment or keyword (FROM supports pipe syntax)
  const sqlStart = sql.search(/^(--|WITH\b|SELECT\b|CREATE\b|FROM\b)/im);
  if (sqlStart > 0) {
    sql = sql.substring(sqlStart);
  }

  return sql.trim();
}

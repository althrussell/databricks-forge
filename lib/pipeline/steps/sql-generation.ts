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
} from "@/lib/ai/functions";
import {
  buildSchemaMarkdown,
  buildForeignKeyMarkdown,
} from "@/lib/queries/metadata";
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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SQL = Math.max(
  1,
  parseInt(process.env.SQL_GEN_MAX_CONCURRENT ?? "3", 10) || 3,
);

const WAVE_DELAY_MS = Math.max(
  0,
  parseInt(process.env.SQL_GEN_WAVE_DELAY_MS ?? "2000", 10) || 0,
);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runSqlGeneration(
  ctx: PipelineContext,
  runId?: string
): Promise<UseCase[]> {
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
  const sortedDomains = Object.entries(grouped).sort(
    ([, a], [, b]) => a.length - b.length
  );

  const totalUseCases = useCases.length;
  let completed = 0;
  let failed = 0;

  // Shared prompt variables (business context -- same for all use cases)
  const businessVars = {
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

  const sampleRows = run.config.sampleRowsPerTable ?? 0;

  // Progress interpolation: SQL generation spans 67% → 95% of overall pipeline
  const PROGRESS_START = 67;
  const PROGRESS_END = 95;
  const progressPerUseCase = totalUseCases > 0
    ? (PROGRESS_END - PROGRESS_START) / totalUseCases
    : 0;

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
        currentProgress()
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
            columnsByTable,
            tableByFqn,
            metadata.foreignKeys,
            run.config.aiModel,
            sampleRows,
            runId
          )
        )
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const uc = wave[j];

        if (result.status === "fulfilled" && result.value) {
          uc.sqlCode = result.value;
          uc.sqlStatus = "generated";
        } else {
          const reason =
            result.status === "rejected"
              ? result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
              : "empty response";
          logger.warn("SQL generation failed for use case", { useCaseId: uc.id, name: uc.name, reason });
          uc.sqlCode = null;
          uc.sqlStatus = "failed";
          failed++;
        }
        completed++;
      }

      if (runId) {
        await updateRunMessage(
          runId,
          `SQL generation: ${completed}/${totalUseCases} complete (${failed} failed)`,
          currentProgress()
        );
      }

      // Cooldown between waves to spread output tokens across the rate-limit window
      if (WAVE_DELAY_MS > 0 && completed < totalUseCases) {
        await new Promise((resolve) => setTimeout(resolve, WAVE_DELAY_MS));
      }
    }
  }

  logger.info("SQL generation complete", { generated: completed - failed, failed });

  return useCases;
}

// ---------------------------------------------------------------------------
// Per-use-case SQL generation
// ---------------------------------------------------------------------------

async function generateSqlForUseCase(
  uc: UseCase,
  businessVars: Record<string, string>,
  aiFunctionsSummary: string,
  statisticalFunctionsSummary: string,
  geospatialFunctionsSummary: string,
  columnsByTable: Map<string, ColumnInfo[]>,
  tableByFqn: Map<string, TableInfo>,
  allForeignKeys: ForeignKey[],
  aiModel: string,
  sampleRowsPerTable: number,
  runId?: string
): Promise<string | null> {
  // Resolve table schemas for this use case's involved tables
  const involvedTables: TableInfo[] = [];
  const involvedColumns: ColumnInfo[] = [];

  for (const fqn of uc.tablesInvolved) {
    // Try exact match, then try with backtick-stripped version
    const cleanFqn = fqn.replace(/`/g, "");
    const tableInfo = tableByFqn.get(fqn) ?? tableByFqn.get(cleanFqn);
    if (tableInfo) involvedTables.push(tableInfo);

    const cols = columnsByTable.get(fqn) ?? columnsByTable.get(cleanFqn) ?? [];
    involvedColumns.push(...cols);
  }

  // If we have no schema info at all, we can still try (the LLM may use table
  // names alone), but log a warning
  if (involvedColumns.length === 0) {
    logger.warn("No column metadata for use case", { useCaseId: uc.id, tables: uc.tablesInvolved });
  }

  // Build schema markdown scoped to this use case's tables
  const schemaMarkdown =
    involvedTables.length > 0
      ? buildSchemaMarkdown(involvedTables, involvedColumns)
      : uc.tablesInvolved.map((t) => `### ${t}\n  (schema not available)`).join("\n\n");

  // Filter foreign keys to only those involving this use case's tables
  const involvedFqns = new Set(
    uc.tablesInvolved.map((t) => t.replace(/`/g, ""))
  );
  const relevantFKs = allForeignKeys.filter(
    (fk) =>
      involvedFqns.has(fk.tableFqn.replace(/`/g, "")) ||
      involvedFqns.has(fk.referencedTableFqn.replace(/`/g, ""))
  );
  const fkMarkdown = buildForeignKeyMarkdown(relevantFKs);

  // Fetch sample data if enabled
  let sampleDataSection = "";
  if (sampleRowsPerTable > 0 && uc.tablesInvolved.length > 0) {
    const sampleResult = await fetchSampleData(uc.tablesInvolved, sampleRowsPerTable);
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
    ai_functions_summary:
      uc.type === "AI" ? aiFunctionsSummary : "",
    statistical_functions_detailed:
      uc.type === "Statistical" ? statisticalFunctionsSummary : "",
    geospatial_functions_summary:
      uc.type === "Geospatial" ? geospatialFunctionsSummary : "",
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
    return null;
  }

  // Detect truncated SQL (LLM ran out of tokens mid-query)
  if (isTruncatedSql(sql)) {
    logger.warn("SQL appears truncated (output token limit hit), attempting fix", { useCaseId: uc.id });
    const fixedSql = await attemptSqlFix(
      uc,
      sql,
      "SQL query is truncated / incomplete — syntax error at end of input. The original query was too long. Simplify the query: reduce to 3-5 CTEs, remove redundant calculations, keep under 120 lines total.",
      schemaMarkdown,
      fkMarkdown,
      aiModel,
      runId
    );
    if (fixedSql) return fixedSql;
    return null;
  }

  // Lightweight structure validation
  const validation = validateSqlOutput(sql, uc.tablesInvolved, involvedColumns);
  if (!validation.valid) {
    logger.warn("SQL validation warning", { useCaseId: uc.id, warnings: validation.warnings });
  }

  // Attempt to execute the SQL to catch runtime errors; if it fails, try fix prompt
  const executionError = await trySqlExecution(sql);
  if (executionError) {
    logger.info("SQL execution failed, attempting fix", { useCaseId: uc.id, error: executionError });
    const fixedSql = await attemptSqlFix(
      uc,
      sql,
      executionError,
      schemaMarkdown,
      fkMarkdown,
      aiModel,
      runId
    );
    if (fixedSql) {
      return fixedSql;
    }
    // Return the original SQL even if fix failed -- it may still be useful
    logger.warn("SQL fix failed, returning original SQL", { useCaseId: uc.id });
  }

  return sql;
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
  runId?: string
): Promise<string | null> {
  try {
    const result = await executeAIQuery({
      promptKey: "USE_CASE_SQL_FIX_PROMPT",
      variables: {
        use_case_id: uc.id,
        use_case_name: uc.name,
        directly_involved_schema: schemaMarkdown,
        foreign_key_relationships: fkMarkdown,
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
// SQL output validation
// ---------------------------------------------------------------------------

interface SqlValidationResult {
  valid: boolean;
  warnings: string[];
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
  columns: ColumnInfo[]
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
      return (
        normalizedSql.includes(cleanFqn) ||
        upperSql.includes(tableName.toUpperCase())
      );
    });
    if (!hasTableRef) {
      warnings.push(
        `SQL does not reference any expected table: ${tablesInvolved.join(", ")}`
      );
    }
  }

  // Check 3: Look for obviously invented columns (column names in SQL
  // that don't match any known column from the schema). Only check if
  // we have schema info.
  if (columns.length > 0) {
    const knownColumns = new Set(
      columns.map((c) => c.columnName.toLowerCase())
    );

    // Exclude catalog, schema, and table name parts from FQNs so
    // `catalog.schema.table` references don't count as unknown columns.
    const fqnParts = new Set<string>();
    for (const fqn of tablesInvolved) {
      for (const part of fqn.replace(/`/g, "").split(".")) {
        fqnParts.add(part.toLowerCase());
      }
    }

    // Detect table aliases: "FROM/JOIN <fqn> [AS] <alias>" patterns
    const aliasSet = new Set<string>();
    const tableAliasPattern = /(?:FROM|JOIN)\s+[`\w.]+\s+(?:AS\s+)?([a-z_]\w*)/gi;
    let aliasMatch;
    while ((aliasMatch = tableAliasPattern.exec(normalizedSql)) !== null) {
      aliasSet.add(aliasMatch[1].toLowerCase());
    }

    // Detect column aliases: "AS <alias>" (computed columns, aggregations)
    const colAliasPattern = /\bAS\s+([a-z_]\w*)/gi;
    while ((aliasMatch = colAliasPattern.exec(normalizedSql)) !== null) {
      aliasSet.add(aliasMatch[1].toLowerCase());
    }

    const sqlKeywords = new Set([
      "select", "from", "where", "and", "or", "not", "in", "is", "null",
      "as", "on", "join", "left", "right", "inner", "outer", "full", "cross",
      "group", "by", "order", "having", "limit", "offset", "union", "all",
      "with", "case", "when", "then", "else", "end", "between", "like",
      "exists", "distinct", "count", "sum", "avg", "min", "max", "over",
      "partition", "row_number", "rank", "dense_rank", "ntile", "lead", "lag",
      "first_value", "last_value", "coalesce", "cast", "concat", "substring",
      "trim", "upper", "lower", "date", "timestamp", "int", "string", "float",
      "double", "boolean", "decimal", "bigint", "array", "map", "struct",
      "true", "false", "asc", "desc", "insert", "into", "values", "update",
      "set", "delete", "create", "table", "view", "temp", "temporary",
      "if", "replace", "drop", "alter", "add", "column", "named_struct",
      "ai_query", "ai_gen", "ai_classify", "ai_forecast", "ai_summarize",
      "ai_analyze_sentiment", "ai_extract", "ai_similarity", "ai_mask",
      "ai_fix_grammar", "ai_translate", "ai_parse_document",
      "temperature", "max_tokens", "modelparameters", "responseformat",
      "failonerror", "response", "result", "qualify",
      "h3_longlatash3", "h3_polyfillash3", "h3_toparent", "h3_kring",
      "h3_distance", "h3_ischildof", "st_point", "st_distance",
      "st_contains", "st_intersects", "st_within", "st_dwithin",
      "st_buffer", "st_area", "st_length", "st_union", "st_makeline",
      "http_request", "remote_query", "read_files", "vector_search",
      "recursive", "depth",
    ]);

    // Extract identifiers after dots (likely column references): table.column
    const dotColPattern = /\.([a-z_][a-z0-9_]*)/gi;
    let match;
    const unknownCols: string[] = [];
    while ((match = dotColPattern.exec(normalizedSql)) !== null) {
      const colName = match[1].toLowerCase();
      if (
        !knownColumns.has(colName) &&
        !sqlKeywords.has(colName) &&
        !fqnParts.has(colName) &&
        !aliasSet.has(colName)
      ) {
        unknownCols.push(match[1]);
      }
    }
    // Only warn if there are multiple unknown columns (single mismatches may be aliases)
    if (unknownCols.length > 3) {
      warnings.push(
        `SQL may reference unknown columns: ${[...new Set(unknownCols)].slice(0, 5).join(", ")}`
      );
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
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
  if (/\b(AND|OR|ON|FROM|JOIN|WHERE|SELECT|GROUP|ORDER|HAVING|BY|AS|CASE|WHEN|THEN)\s*$/i.test(trimmed)) return true;

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

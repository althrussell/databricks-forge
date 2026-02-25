/**
 * Schema Allowlist — builds validation sets from a MetadataSnapshot.
 *
 * Every Genie Engine LLM pass uses this to ground its output: only table FQNs
 * and column names that physically exist in the scraped metadata are accepted.
 * The assembler uses it as a final gate before building the SerializedSpace.
 */

import type { MetadataSnapshot, ColumnInfo } from "@/lib/domain/types";
import { logger } from "@/lib/logger";

export interface SchemaAllowlist {
  /** Set of valid `catalog.schema.table` FQNs (lowercased). */
  tables: Set<string>;
  /** Map of `tableFqn` -> Set of column names (lowercased). */
  columns: Map<string, Set<string>>;
  /** Map of `tableFqn.columnName` -> data type (lowercased). */
  columnTypes: Map<string, string>;
  /** Set of valid metric view FQNs (lowercased). */
  metricViews: Set<string>;
}

export function buildSchemaAllowlist(metadata: MetadataSnapshot): SchemaAllowlist {
  const tables = new Set<string>();
  const columns = new Map<string, Set<string>>();
  const columnTypes = new Map<string, string>();
  const metricViews = new Set<string>();

  for (const t of metadata.tables) {
    const fqn = t.fqn.toLowerCase();
    tables.add(fqn);
    if (!columns.has(fqn)) columns.set(fqn, new Set());
  }

  for (const c of metadata.columns) {
    const fqn = c.tableFqn.toLowerCase();
    const col = c.columnName.toLowerCase();
    if (!columns.has(fqn)) columns.set(fqn, new Set());
    columns.get(fqn)!.add(col);
    columnTypes.set(`${fqn}.${col}`, c.dataType.toLowerCase());
  }

  for (const mv of metadata.metricViews) {
    metricViews.add(mv.fqn.toLowerCase());
  }

  return { tables, columns, columnTypes, metricViews };
}

export function isValidTable(allowlist: SchemaAllowlist, fqn: string): boolean {
  return allowlist.tables.has(fqn.toLowerCase());
}

export function isValidColumn(allowlist: SchemaAllowlist, tableFqn: string, columnName: string): boolean {
  const cols = allowlist.columns.get(tableFqn.toLowerCase());
  return cols ? cols.has(columnName.toLowerCase()) : false;
}

export function getColumnType(allowlist: SchemaAllowlist, tableFqn: string, columnName: string): string | null {
  return allowlist.columnTypes.get(`${tableFqn.toLowerCase()}.${columnName.toLowerCase()}`) ?? null;
}

// ---------------------------------------------------------------------------
// Shared SQL keywords — used by both findInvalidIdentifiers (strict mode)
// and pipeline SQL validation to avoid false-positiving on SQL syntax.
// ---------------------------------------------------------------------------

export const SQL_KEYWORDS = new Set([
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
  "recursive", "depth", "filter", "measure", "percentile_approx",
  "date_trunc", "year", "month", "day", "hour", "minute", "second",
  "current_date", "current_timestamp", "datediff", "dateadd",
  "to_date", "to_timestamp", "format_number", "round", "abs", "ceil",
  "floor", "power", "sqrt", "log", "exp", "mod", "greatest", "least",
  "nullif", "ifnull", "nvl", "nvl2", "try_cast", "typeof",
  "collect_list", "collect_set", "explode", "flatten", "size",
  "element_at", "transform", "aggregate", "reduce",
  "regexp_extract", "regexp_replace", "split", "length", "reverse",
  "lpad", "rpad", "ltrim", "rtrim", "initcap", "translate",
  "rows", "range", "unbounded", "preceding", "following", "current", "row",
  "interval", "lateral", "tablesample", "pivot", "unpivot",
  "rollup", "cube", "grouping", "sets",
  "source", "version", "catalog", "schema", "language", "yaml",
]);

/**
 * Extract table and column references from a SQL string and validate each
 * against the allowlist. Returns identifiers that are NOT in the allowlist.
 *
 * Checks:
 * - 3-part FQNs (`catalog.schema.table`) for invalid table references
 * - 4-part FQNs (`catalog.schema.table.column`) for invalid column references
 * - (strict mode) 2-part `alias.column` for hallucinated column names
 *
 * Excludes FQNs that are the target of CREATE statements (VIEW, TABLE)
 * since those are being defined, not referenced.
 *
 * @param strictColumnCheck When true, validates that the column part of
 *   any `alias.column` reference exists in at least one table in the
 *   allowlist. Catches completely hallucinated columns like
 *   `supplier.ingredient` where `ingredient` doesn't exist anywhere.
 */
export function findInvalidIdentifiers(
  allowlist: SchemaAllowlist,
  sql: string,
  strictColumnCheck = false,
): string[] {
  const invalid: string[] = [];

  // Collect FQNs that are targets of CREATE statements (these are being defined, not referenced)
  const createTargets = new Set<string>();
  const createRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:VIEW|TABLE)\s+(?:`[^`]+`|[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/gi;
  let createMatch: RegExpExecArray | null;
  while ((createMatch = createRegex.exec(sql)) !== null) {
    const fqnMatch = createMatch[0].match(/(?:`([^`]+)`|([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*))$/);
    if (fqnMatch) {
      const fqn = (fqnMatch[1] ?? fqnMatch[2]).replace(/`/g, "");
      createTargets.add(fqn.toLowerCase());
    }
  }

  // Match four-part FQN column refs: catalog.schema.table.column
  // Only flag when the table IS valid but the column is NOT.
  const colFqnRegex = /\b([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = colFqnRegex.exec(sql)) !== null) {
    const tableFqn = match[1];
    const column = match[2];
    if (
      !createTargets.has(tableFqn.toLowerCase()) &&
      isValidTable(allowlist, tableFqn) &&
      !isValidColumn(allowlist, tableFqn, column)
    ) {
      invalid.push(`${tableFqn}.${column}`);
    }
  }

  // Track positions already covered by 3/4-part FQNs to avoid double-flagging
  const coveredPositions = new Set<number>();

  // Match three-part FQNs: catalog.schema.table
  const fqnRegex = /\b([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)\b/g;
  while ((match = fqnRegex.exec(sql)) !== null) {
    const fqn = match[1];
    // Mark the dot-separated positions as covered
    const startPos = match.index;
    const endPos = startPos + match[0].length;
    for (let p = startPos; p < endPos; p++) coveredPositions.add(p);

    if (
      !isValidTable(allowlist, fqn) &&
      !allowlist.metricViews.has(fqn.toLowerCase()) &&
      !createTargets.has(fqn.toLowerCase())
    ) {
      invalid.push(fqn);
    }
  }

  // Strict mode: validate 2-part alias.column references.
  // Any column after a dot that doesn't exist in ANY table is flagged.
  if (strictColumnCheck) {
    const allColumns = new Set<string>();
    for (const cols of allowlist.columns.values()) {
      for (const c of cols) allColumns.add(c);
    }

    // Also collect table aliases from FROM/JOIN ... AS alias patterns
    const aliasSet = new Set<string>();
    const normalizedSql = sql.replace(/`/g, "");
    const tableAliasPattern = /(?:FROM|JOIN)\s+[\w.]+\s+(?:AS\s+)?([a-z_]\w*)/gi;
    let aliasMatch: RegExpExecArray | null;
    while ((aliasMatch = tableAliasPattern.exec(normalizedSql)) !== null) {
      aliasSet.add(aliasMatch[1].toLowerCase());
    }
    // Column aliases: "AS <alias>"
    const colAliasPattern = /\bAS\s+([a-z_]\w*)/gi;
    while ((aliasMatch = colAliasPattern.exec(normalizedSql)) !== null) {
      aliasSet.add(aliasMatch[1].toLowerCase());
    }

    const aliasColRegex = /\b([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\b/g;
    while ((match = aliasColRegex.exec(sql)) !== null) {
      // Skip if this position is already covered by a 3/4-part FQN match
      if (coveredPositions.has(match.index)) continue;

      const prefix = match[1].toLowerCase();
      const col = match[2].toLowerCase();

      // Skip SQL keywords, known aliases, and FQN parts as prefix
      if (SQL_KEYWORDS.has(prefix) || SQL_KEYWORDS.has(col)) continue;
      if (aliasSet.has(col)) continue;

      // Only flag if the column doesn't exist in any table
      if (!allColumns.has(col)) {
        invalid.push(`${match[1]}.${match[2]}`);
      }
    }
  }

  return [...new Set(invalid)];
}

/**
 * Validate a SQL expression and log warnings for any invalid identifiers.
 * Returns true if all identifiers are valid.
 *
 * @param strictColumnCheck When true, also checks 2-part `alias.column`
 *   references against the allowlist (catches hallucinated columns).
 */
export function validateSqlExpression(
  allowlist: SchemaAllowlist,
  sql: string,
  context: string,
  strictColumnCheck = false,
): boolean {
  const invalid = findInvalidIdentifiers(allowlist, sql, strictColumnCheck);
  if (invalid.length > 0) {
    logger.warn("SQL expression references unknown identifiers", {
      context,
      invalidIdentifiers: invalid,
      sql: sql.substring(0, 200),
    });
    return false;
  }
  return true;
}

/**
 * Build a compact one-line-per-table column listing for LLM grounding.
 * E.g. "catalog.schema.table: col1, col2, col3"
 */
export function buildCompactColumnsBlock(
  metadata: MetadataSnapshot,
  tableFqns?: string[]
): string {
  const targetTables = tableFqns
    ? new Set(tableFqns.map((f) => f.toLowerCase()))
    : null;

  const columnsByTable = new Map<string, string[]>();
  for (const c of metadata.columns) {
    const key = c.tableFqn.toLowerCase();
    if (targetTables && !targetTables.has(key)) continue;
    if (!columnsByTable.has(key)) columnsByTable.set(key, []);
    columnsByTable.get(key)!.push(c.columnName);
  }

  const lines: string[] = [
    "## AVAILABLE COLUMNS (these are the ONLY valid column names — do NOT invent others)\n",
  ];

  for (const t of metadata.tables) {
    const key = t.fqn.toLowerCase();
    if (targetTables && !targetTables.has(key)) continue;
    const cols = columnsByTable.get(key) ?? [];
    if (cols.length > 0) {
      lines.push(`${t.fqn}: ${cols.join(", ")}`);
    }
  }

  return lines.join("\n");
}

/**
 * Build a markdown schema context block for LLM prompts.
 * Lists every table with its columns and types.
 */
export function buildSchemaContextBlock(
  metadata: MetadataSnapshot,
  tableFqns?: string[]
): string {
  const targetTables = tableFqns
    ? new Set(tableFqns.map((f) => f.toLowerCase()))
    : null;

  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const c of metadata.columns) {
    const key = c.tableFqn.toLowerCase();
    if (targetTables && !targetTables.has(key)) continue;
    if (!columnsByTable.has(key)) columnsByTable.set(key, []);
    columnsByTable.get(key)!.push(c);
  }

  const lines: string[] = ["### SCHEMA CONTEXT (you MUST only reference these tables and columns)\n"];

  for (const t of metadata.tables) {
    const key = t.fqn.toLowerCase();
    if (targetTables && !targetTables.has(key)) continue;
    const cols = columnsByTable.get(key) ?? [];
    cols.sort((a, b) => a.ordinalPosition - b.ordinalPosition);

    lines.push(`**${t.fqn}**${t.comment ? ` — ${t.comment}` : ""}`);
    for (const c of cols) {
      const desc = c.comment ? ` — ${c.comment}` : "";
      lines.push(`  - ${c.columnName} (${c.dataType})${desc}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

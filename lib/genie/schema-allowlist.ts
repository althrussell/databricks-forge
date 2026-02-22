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

/**
 * Extract table.column references from a SQL string and validate each against
 * the allowlist. Returns identifiers that are NOT in the allowlist.
 *
 * Excludes FQNs that are the target of CREATE statements (FUNCTION, VIEW, TABLE)
 * since those are being defined, not referenced.
 */
export function findInvalidIdentifiers(allowlist: SchemaAllowlist, sql: string): string[] {
  const invalid: string[] = [];

  // Collect FQNs that are targets of CREATE statements (these are being defined, not referenced)
  const createTargets = new Set<string>();
  const createRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|VIEW|TABLE)\s+(?:`[^`]+`|[a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)/gi;
  let createMatch: RegExpExecArray | null;
  while ((createMatch = createRegex.exec(sql)) !== null) {
    const fqnMatch = createMatch[0].match(/(?:`([^`]+)`|([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*))$/);
    if (fqnMatch) {
      const fqn = (fqnMatch[1] ?? fqnMatch[2]).replace(/`/g, "");
      createTargets.add(fqn.toLowerCase());
    }
  }

  // Match three-part FQNs: catalog.schema.table
  const fqnRegex = /\b([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)\b/g;
  let match: RegExpExecArray | null;
  while ((match = fqnRegex.exec(sql)) !== null) {
    const fqn = match[1];
    if (
      !isValidTable(allowlist, fqn) &&
      !allowlist.metricViews.has(fqn.toLowerCase()) &&
      !createTargets.has(fqn.toLowerCase())
    ) {
      invalid.push(fqn);
    }
  }

  return [...new Set(invalid)];
}

/**
 * Validate a SQL expression and log warnings for any invalid identifiers.
 * Returns true if all identifiers are valid.
 */
export function validateSqlExpression(allowlist: SchemaAllowlist, sql: string, context: string): boolean {
  const invalid = findInvalidIdentifiers(allowlist, sql);
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
    const fqn = c.tableFqn.toLowerCase();
    if (targetTables && !targetTables.has(fqn)) continue;
    if (!columnsByTable.has(c.tableFqn)) columnsByTable.set(c.tableFqn, []);
    columnsByTable.get(c.tableFqn)!.push(c);
  }

  const lines: string[] = ["### SCHEMA CONTEXT (you MUST only reference these tables and columns)\n"];

  for (const t of metadata.tables) {
    if (targetTables && !targetTables.has(t.fqn.toLowerCase())) continue;
    const cols = columnsByTable.get(t.fqn) ?? [];
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

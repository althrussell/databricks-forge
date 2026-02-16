/**
 * SQL queries for Unity Catalog metadata extraction.
 *
 * All raw SQL lives here -- components and pipeline steps import
 * these functions rather than writing SQL inline.
 */

import { executeSQLMapped, executeSQL, type SqlColumn } from "@/lib/dbx/sql";
import { validateIdentifier } from "@/lib/validation";
import type { TableInfo, ColumnInfo, ForeignKey } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Row Mappers
// ---------------------------------------------------------------------------

function rowToTable(row: string[], columns: SqlColumn[]): TableInfo {
  const col = (name: string) => {
    const idx = columns.findIndex((c) => c.name === name);
    return idx >= 0 ? row[idx] : null;
  };
  const catalog = col("table_catalog") ?? "";
  const schema = col("table_schema") ?? "";
  const tableName = col("table_name") ?? "";
  return {
    catalog,
    schema,
    tableName,
    fqn: `${catalog}.${schema}.${tableName}`,
    tableType: col("table_type") ?? "MANAGED",
    comment: col("comment") ?? null,
  };
}

function rowToColumn(row: string[], columns: SqlColumn[]): ColumnInfo {
  const col = (name: string) => {
    const idx = columns.findIndex((c) => c.name === name);
    return idx >= 0 ? row[idx] : null;
  };
  const catalog = col("table_catalog") ?? "";
  const schema = col("table_schema") ?? "";
  const tableName = col("table_name") ?? "";
  return {
    tableFqn: `${catalog}.${schema}.${tableName}`,
    columnName: col("column_name") ?? "",
    dataType: col("data_type") ?? col("full_data_type") ?? "STRING",
    ordinalPosition: parseInt(col("ordinal_position") ?? "0", 10),
    isNullable: col("is_nullable") === "YES",
    comment: col("comment") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List catalogs the current user can actually query.
 *
 * Two-phase approach:
 *   1. Build a candidate list (from `system.information_schema.catalogs` if
 *      accessible, otherwise `SHOW CATALOGS`).
 *   2. **Always** probe each candidate with a lightweight query to confirm
 *      the user truly has USE CATALOG. The candidate list may include
 *      catalogs the user can see (BROWSE) but not query.
 */
export async function listCatalogs(): Promise<string[]> {
  let candidates: string[];

  // Phase 1: build candidate list
  try {
    const result = await executeSQL(`
      SELECT catalog_name
      FROM system.information_schema.catalogs
      WHERE catalog_name NOT IN ('system', '__databricks_internal')
      ORDER BY catalog_name
    `);
    candidates = result.rows.map((r) => r[0]);
  } catch {
    // system catalog not accessible — fall back to SHOW CATALOGS
    const result = await executeSQL("SHOW CATALOGS");
    candidates = result.rows
      .map((r) => r[0])
      .filter((c) => c !== "system" && c !== "__databricks_internal");
  }

  if (candidates.length === 0) return [];

  // Phase 2: probe each candidate to verify USE CATALOG permission
  const probes = await Promise.allSettled(
    candidates.map(async (catalog) => {
      await executeSQL(
        `SELECT 1 FROM \`${catalog}\`.information_schema.schemata LIMIT 1`
      );
      return catalog;
    })
  );

  return probes
    .filter(
      (r): r is PromiseFulfilledResult<string> => r.status === "fulfilled"
    )
    .map((r) => r.value);
}

/**
 * List schemas in a catalog. Returns an empty array if the user lacks
 * USE CATALOG permission (instead of throwing).
 */
export async function listSchemas(catalog: string): Promise<string[]> {
  const safeCatalog = validateIdentifier(catalog, "catalog");
  const sql = `
    SELECT schema_name
    FROM \`${safeCatalog}\`.information_schema.schemata
    WHERE schema_name NOT IN ('information_schema', 'default')
    ORDER BY schema_name
  `;
  try {
    const result = await executeSQL(sql);
    return result.rows.map((r) => r[0]);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("INSUFFICIENT_PERMISSIONS") || msg.includes("USE CATALOG")) {
      console.warn(`[metadata] No permission on catalog ${catalog}, returning empty`);
      return [];
    }
    throw error;
  }
}

/**
 * List tables in a catalog.schema scope.
 */
export async function listTables(
  catalog: string,
  schema?: string
): Promise<TableInfo[]> {
  const safeCatalog = validateIdentifier(catalog, "catalog");
  let sql = `
    SELECT table_catalog, table_schema, table_name, table_type, comment
    FROM \`${safeCatalog}\`.information_schema.tables
    WHERE table_schema NOT IN ('information_schema', 'default')
  `;
  if (schema) {
    const safeSchema = validateIdentifier(schema, "schema");
    sql += ` AND table_schema = '${safeSchema}'`;
  }
  sql += ` ORDER BY table_schema, table_name`;
  return executeSQLMapped(sql, rowToTable);
}

/**
 * List columns for tables in a catalog.schema scope.
 */
export async function listColumns(
  catalog: string,
  schema?: string
): Promise<ColumnInfo[]> {
  const safeCatalog = validateIdentifier(catalog, "catalog");
  let sql = `
    SELECT table_catalog, table_schema, table_name,
           column_name, data_type, ordinal_position, is_nullable, comment
    FROM \`${safeCatalog}\`.information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'default')
  `;
  if (schema) {
    const safeSchema = validateIdentifier(schema, "schema");
    sql += ` AND table_schema = '${safeSchema}'`;
  }
  sql += ` ORDER BY table_schema, table_name, ordinal_position`;
  return executeSQLMapped(sql, rowToColumn);
}

/**
 * Attempt to get foreign key relationships. Falls back to empty array
 * if the information_schema view is not available.
 */
export async function listForeignKeys(
  catalog: string,
  schema?: string
): Promise<ForeignKey[]> {
  try {
    const safeCatalog = validateIdentifier(catalog, "catalog");
    let sql = `
      SELECT
        tc.constraint_name,
        kcu.table_catalog || '.' || kcu.table_schema || '.' || kcu.table_name AS table_fqn,
        kcu.column_name,
        ccu.table_catalog || '.' || ccu.table_schema || '.' || ccu.table_name AS referenced_table_fqn,
        ccu.column_name AS referenced_column_name
      FROM \`${safeCatalog}\`.information_schema.table_constraints tc
      JOIN \`${safeCatalog}\`.information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN \`${safeCatalog}\`.information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `;
    if (schema) {
      const safeSchema = validateIdentifier(schema, "schema");
      sql += ` AND kcu.table_schema = '${safeSchema}'`;
    }

    const result = await executeSQL(sql);
    return result.rows.map((row) => ({
      constraintName: row[0] ?? "",
      tableFqn: row[1] ?? "",
      columnName: row[2] ?? "",
      referencedTableFqn: row[3] ?? "",
      referencedColumnName: row[4] ?? "",
    }));
  } catch {
    // FK information_schema views may not be available
    console.warn("Foreign key query failed, returning empty array");
    return [];
  }
}

/**
 * Build a schema markdown string for prompt injection.
 * Groups columns by table and formats as markdown.
 */
export function buildSchemaMarkdown(
  tables: TableInfo[],
  columns: ColumnInfo[]
): string {
  const columnsByTable: Record<string, ColumnInfo[]> = {};
  for (const col of columns) {
    if (!columnsByTable[col.tableFqn]) columnsByTable[col.tableFqn] = [];
    columnsByTable[col.tableFqn].push(col);
  }

  const sections = tables.map((table) => {
    const cols = columnsByTable[table.fqn] ?? [];
    const colLines = cols
      .map(
        (c) =>
          `  - ${c.columnName} (${c.dataType})${c.comment ? ` -- ${c.comment}` : ""}`
      )
      .join("\n");
    const comment = table.comment ? ` -- ${table.comment}` : "";
    return `### ${table.fqn}${comment}\n${colLines || "  (no columns)"}`;
  });

  return sections.join("\n\n");
}

/**
 * Build a foreign key relationships summary for prompt injection.
 */
export function buildForeignKeyMarkdown(fks: ForeignKey[]): string {
  if (fks.length === 0) return "No foreign key relationships found.";

  const lines = fks.map(
    (fk) =>
      `- ${fk.tableFqn}.${fk.columnName} -> ${fk.referencedTableFqn}.${fk.referencedColumnName}`
  );
  return lines.join("\n");
}

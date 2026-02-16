/**
 * SQL queries for Unity Catalog metadata extraction.
 *
 * All raw SQL lives here -- components and pipeline steps import
 * these functions rather than writing SQL inline.
 */

import { executeSQLMapped, executeSQL, type SqlColumn } from "@/lib/dbx/sql";
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
 * List catalogs the current user can actually query (has USE CATALOG).
 *
 * SHOW CATALOGS returns catalogs the user has *any* privilege on (including
 * BROWSE), but querying information_schema requires USE CATALOG.  We probe
 * each catalog in parallel with a lightweight query and keep only the ones
 * that succeed.
 */
export async function listCatalogs(): Promise<string[]> {
  const result = await executeSQL("SHOW CATALOGS");
  const allCatalogs = result.rows.map((r) => r[0]);

  const probes = await Promise.allSettled(
    allCatalogs.map(async (catalog) => {
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
 * List schemas in a catalog.
 */
export async function listSchemas(catalog: string): Promise<string[]> {
  const sql = `
    SELECT schema_name
    FROM ${catalog}.information_schema.schemata
    WHERE schema_name NOT IN ('information_schema', 'default')
    ORDER BY schema_name
  `;
  const result = await executeSQL(sql);
  return result.rows.map((r) => r[0]);
}

/**
 * List tables in a catalog.schema scope.
 */
export async function listTables(
  catalog: string,
  schema?: string
): Promise<TableInfo[]> {
  let sql = `
    SELECT table_catalog, table_schema, table_name, table_type, comment
    FROM ${catalog}.information_schema.tables
    WHERE table_schema NOT IN ('information_schema', 'default')
  `;
  if (schema) {
    sql += ` AND table_schema = '${schema.replace(/'/g, "''")}'`;
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
  let sql = `
    SELECT table_catalog, table_schema, table_name,
           column_name, data_type, ordinal_position, is_nullable, comment
    FROM ${catalog}.information_schema.columns
    WHERE table_schema NOT IN ('information_schema', 'default')
  `;
  if (schema) {
    sql += ` AND table_schema = '${schema.replace(/'/g, "''")}'`;
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
    let sql = `
      SELECT
        tc.constraint_name,
        kcu.table_catalog || '.' || kcu.table_schema || '.' || kcu.table_name AS table_fqn,
        kcu.column_name,
        ccu.table_catalog || '.' || ccu.table_schema || '.' || ccu.table_name AS referenced_table_fqn,
        ccu.column_name AS referenced_column_name
      FROM ${catalog}.information_schema.table_constraints tc
      JOIN ${catalog}.information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      JOIN ${catalog}.information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY'
    `;
    if (schema) {
      sql += ` AND kcu.table_schema = '${schema.replace(/'/g, "''")}'`;
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

/**
 * SQL queries for Unity Catalog metadata extraction.
 *
 * All raw SQL lives here -- components and pipeline steps import
 * these functions rather than writing SQL inline.
 */

import { executeSQLMapped, executeSQL, type SqlColumn } from "@/lib/dbx/sql";
import { validateIdentifier } from "@/lib/validation";
import { withRetry } from "@/lib/dbx/retry";
import type { TableInfo, ColumnInfo, ForeignKey, MetricViewInfo } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Error codes for structured error reporting
// ---------------------------------------------------------------------------

export type MetadataErrorCode =
  | "WAREHOUSE_UNAVAILABLE"
  | "INSUFFICIENT_PERMISSIONS"
  | "NO_DATA";

export class MetadataError extends Error {
  constructor(
    message: string,
    public readonly code: MetadataErrorCode
  ) {
    super(message);
    this.name = "MetadataError";
  }
}

// ---------------------------------------------------------------------------
// Warehouse readiness
// ---------------------------------------------------------------------------

export interface WarehouseStatus {
  ready: boolean;
  latencyMs: number;
  error?: string;
}

/**
 * Wake the SQL warehouse and verify it can execute queries.
 *
 * Uses `waitTimeout: "0s"` so the server returns immediately with a
 * statement_id, and we poll -- this allows the warehouse up to 5 minutes
 * to cold-start without hitting client-side fetch timeouts.
 *
 * Retries 3 times with backoff to handle transient failures.
 */
export async function ensureWarehouseReady(): Promise<WarehouseStatus> {
  const start = Date.now();
  try {
    await withRetry(
      () =>
        executeSQL("SELECT 1", undefined, undefined, {
          waitTimeout: "0s",
          submitTimeoutMs: 30_000,
        }),
      {
        maxRetries: 3,
        initialBackoffMs: 5_000,
        maxBackoffMs: 20_000,
        label: "ensureWarehouseReady",
      }
    );
    return { ready: true, latencyMs: Date.now() - start };
  } catch (error) {
    return {
      ready: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Warehouse unreachable",
    };
  }
}

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
 * Preferred approach: a single query against `system.information_schema.schemata`
 * returns only catalogs where the user has USE CATALOG (schemas are not visible
 * without it), avoiding the old N+1 per-catalog probe pattern.
 *
 * Fallback: `SHOW CATALOGS` + per-catalog probes with short timeouts and
 * limited concurrency.
 *
 * Wrapped in retry logic to survive warehouse cold starts. Throws
 * `MetadataError` with a descriptive code when unrecoverable.
 */
export async function listCatalogs(): Promise<string[]> {
  return withRetry(() => listCatalogsOnce(), {
    maxRetries: 2,
    initialBackoffMs: 3_000,
    maxBackoffMs: 10_000,
    label: "listCatalogs",
  });
}

async function listCatalogsOnce(): Promise<string[]> {
  // ── Fast path: single query via system.information_schema ──────────
  // Returns catalogs the user can see. Permission to USE each catalog
  // is verified lazily when the user expands it (listSchemas throws
  // MetadataError with INSUFFICIENT_PERMISSIONS if access is denied).
  try {
    const result = await executeSQL(`
      SELECT DISTINCT catalog_name
      FROM system.information_schema.schemata
      WHERE catalog_name NOT IN ('system', '__databricks_internal')
      ORDER BY catalog_name
    `);
    return result.rows.map((r) => r[0]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      !msg.includes("INSUFFICIENT_PERMISSIONS") &&
      !msg.includes("USE CATALOG") &&
      !msg.includes("does not exist")
    ) {
      console.warn(
        "[listCatalogs] Fast path failed (non-permission error), trying fallback:",
        msg
      );
    }
  }

  // ── Fallback: SHOW CATALOGS ───────────────────────────────────────
  try {
    const result = await executeSQL("SHOW CATALOGS");
    return result.rows
      .map((r) => r[0])
      .filter((c) => c !== "system" && c !== "__databricks_internal");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("INSUFFICIENT_PERMISSIONS") ||
      msg.includes("USE CATALOG")
    ) {
      throw new MetadataError(
        "You don't have permission to list catalogs. Contact your workspace admin.",
        "INSUFFICIENT_PERMISSIONS"
      );
    }
    throw err;
  }
}

/**
 * List schemas in a catalog. Throws `MetadataError` with
 * `INSUFFICIENT_PERMISSIONS` if the user lacks USE CATALOG permission.
 *
 * Wrapped in retry logic to survive transient warehouse errors.
 */
export async function listSchemas(catalog: string): Promise<string[]> {
  return withRetry(() => listSchemasOnce(catalog), {
    maxRetries: 1,
    initialBackoffMs: 2_000,
    maxBackoffMs: 5_000,
    label: "listSchemas",
  });
}

async function listSchemasOnce(catalog: string): Promise<string[]> {
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
      throw new MetadataError(
        `Insufficient permissions on catalog "${catalog}". Grant USE CATALOG to access schemas.`,
        "INSUFFICIENT_PERMISSIONS"
      );
    }
    throw error;
  }
}

/**
 * List tables in a catalog.schema scope.
 *
 * Wrapped in retry logic to survive transient warehouse errors.
 */
export async function listTables(
  catalog: string,
  schema?: string
): Promise<TableInfo[]> {
  return withRetry(() => listTablesOnce(catalog, schema), {
    maxRetries: 1,
    initialBackoffMs: 2_000,
    maxBackoffMs: 5_000,
    label: "listTables",
  });
}

async function listTablesOnce(
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
 * Attempt to discover Unity Catalog metric views in a catalog.
 * Falls back to empty array if the table_type is not recognised or the query fails.
 */
export async function listMetricViews(
  catalog: string,
  schema?: string
): Promise<MetricViewInfo[]> {
  try {
    const safeCatalog = validateIdentifier(catalog, "catalog");
    let sql = `
      SELECT table_catalog, table_schema, table_name, comment
      FROM \`${safeCatalog}\`.information_schema.tables
      WHERE table_type = 'METRIC_VIEW'
        AND table_schema NOT IN ('information_schema', 'default')
    `;
    if (schema) {
      const safeSchema = validateIdentifier(schema, "schema");
      sql += ` AND table_schema = '${safeSchema}'`;
    }
    sql += ` ORDER BY table_schema, table_name`;

    const result = await executeSQL(sql);
    return result.rows.map((row) => {
      const cat = row[0] ?? "";
      const sch = row[1] ?? "";
      const name = row[2] ?? "";
      return {
        catalog: cat,
        schema: sch,
        name,
        fqn: `${cat}.${sch}.${name}`,
        comment: row[3] ?? null,
      };
    });
  } catch {
    // Metric views may not be available in this workspace
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

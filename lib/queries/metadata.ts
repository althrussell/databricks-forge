/**
 * SQL queries for Unity Catalog metadata extraction.
 *
 * All raw SQL lives here -- components and pipeline steps import
 * these functions rather than writing SQL inline.
 */

import { executeSQLMapped, executeSQL, type SqlColumn } from "@/lib/dbx/sql";
import { validateIdentifier } from "@/lib/validation";
import { withRetry } from "@/lib/dbx/retry";
import { logger } from "@/lib/logger";
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
 * List catalogs visible to the current user via `SHOW CATALOGS`.
 *
 * Returns everything the user has BROWSE or higher on. Permission to
 * actually query schemas/tables is verified lazily when the user drills
 * in -- `listSchemas` will surface a clear error if access is denied.
 *
 * Wrapped in retry logic to survive warehouse cold starts.
 */
export async function listCatalogs(): Promise<string[]> {
  return withRetry(
    async () => {
      const result = await executeSQL("SHOW CATALOGS");
      return result.rows
        .map((r) => r[0])
        .filter((c) => c !== "system" && c !== "__databricks_internal");
    },
    {
      maxRetries: 2,
      initialBackoffMs: 3_000,
      maxBackoffMs: 10_000,
      label: "listCatalogs",
    }
  );
}

/**
 * List schemas in a catalog via `SHOW SCHEMAS IN catalog`.
 *
 * Uses explicit `IN` syntax so the catalog target is in the SQL itself
 * rather than relying on Statement Execution API context params.
 *
 * Filters out `information_schema` and `default`.
 * Wrapped in retry logic to survive transient warehouse errors.
 */
export async function listSchemas(catalog: string): Promise<string[]> {
  const safeCatalog = validateIdentifier(catalog, "catalog");
  return withRetry(
    async () => {
      const result = await executeSQL(
        `SHOW SCHEMAS IN \`${safeCatalog}\``
      );
      logger.info("[metadata] SHOW SCHEMAS", { catalog: safeCatalog, rowCount: result.rows.length });
      return result.rows
        .map((r) => r[0])
        .filter((s) => s !== "information_schema" && s !== "default");
    },
    {
      maxRetries: 1,
      initialBackoffMs: 2_000,
      maxBackoffMs: 5_000,
      label: "listSchemas",
    }
  );
}

/**
 * List tables in a catalog.schema scope via `SHOW TABLES`.
 *
 * When `schema` is provided, runs a single `SHOW TABLES IN catalog.schema`.
 * When omitted (pipeline bulk mode), lists schemas first then shows tables
 * for each one.
 *
 * Wrapped in retry logic to survive transient warehouse errors.
 */
export async function listTables(
  catalog: string,
  schema?: string
): Promise<TableInfo[]> {
  const safeCatalog = validateIdentifier(catalog, "catalog");

  if (schema) {
    const safeSchema = validateIdentifier(schema, "schema");
    return withRetry(
      () => showTablesInSchema(safeCatalog, safeSchema),
      {
        maxRetries: 1,
        initialBackoffMs: 2_000,
        maxBackoffMs: 5_000,
        label: "listTables",
      }
    );
  }

  // No schema specified -- list all schemas and show tables for each
  const schemas = await listSchemas(catalog);
  const allTables: TableInfo[] = [];
  for (const sch of schemas) {
    try {
      const tables = await showTablesInSchema(safeCatalog, sch);
      allTables.push(...tables);
    } catch {
      // Skip schemas we can't list tables for (permission, etc.)
    }
  }
  return allTables;
}

/**
 * Run `SHOW TABLES IN catalog.schema` and map to TableInfo[].
 *
 * Uses explicit `IN` syntax so the full catalog.schema target is baked
 * into the SQL rather than relying on Statement Execution API context
 * params (which may not apply to SHOW commands in all environments).
 */
async function showTablesInSchema(
  catalog: string,
  schema: string
): Promise<TableInfo[]> {
  const sql = `SHOW TABLES IN \`${catalog}\`.\`${schema}\``;
  const result = await executeSQL(sql);

  // Log column layout for diagnostics
  const colNames = result.columns.map((c) => c.name);
  logger.info("[metadata] SHOW TABLES", {
    catalog,
    schema,
    sql,
    colNames,
    rowCount: result.rows.length,
    firstRow: result.rows[0] ?? null,
  });

  // Find column positions by name (SHOW TABLES returns: database, tableName, isTemporary)
  const nameIdx = result.columns.findIndex(
    (c) =>
      c.name.toLowerCase() === "tablename" ||
      c.name.toLowerCase() === "table_name"
  );

  // Fall back to positional index 1 if column name not found
  const effectiveNameIdx = nameIdx >= 0 ? nameIdx : 1;

  if (nameIdx < 0) {
    logger.warn(
      "[metadata] Could not find tableName column by name, falling back to positional index 1",
      { colNames }
    );
  }

  return result.rows.map((row) => {
    const tableName = row[effectiveNameIdx] ?? "";
    return {
      catalog,
      schema,
      tableName,
      fqn: `${catalog}.${schema}.${tableName}`,
      tableType: "TABLE",
      comment: null,
    };
  });
}

/**
 * Fetch table comments (descriptions) from information_schema.tables.
 *
 * Returns a Map of FQN -> comment for all tables that have a non-null comment.
 * Gracefully returns an empty map on permission or query errors.
 */
export async function fetchTableComments(
  catalog: string,
  schema?: string
): Promise<Map<string, string>> {
  const comments = new Map<string, string>();
  try {
    const safeCatalog = validateIdentifier(catalog, "catalog");
    let sql = `
      SELECT table_catalog, table_schema, table_name, comment
      FROM \`${safeCatalog}\`.information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'default')
        AND comment IS NOT NULL
        AND comment != ''
    `;
    if (schema) {
      const safeSchema = validateIdentifier(schema, "schema");
      sql += ` AND table_schema = '${safeSchema}'`;
    }

    const result = await executeSQL(sql);
    for (const row of result.rows) {
      const cat = row[0] ?? "";
      const sch = row[1] ?? "";
      const tbl = row[2] ?? "";
      const cmt = row[3] ?? "";
      if (cmt) {
        comments.set(`${cat}.${sch}.${tbl}`, cmt);
      }
    }

    logger.info("[metadata] Fetched table comments", {
      catalog,
      schema: schema ?? "(all)",
      tablesWithComments: comments.size,
    });
  } catch (error) {
    logger.warn("[metadata] Failed to fetch table comments, continuing without", {
      catalog,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return comments;
}

/**
 * Merge table comments into a list of TableInfo objects in-place.
 */
export function mergeTableComments(
  tables: TableInfo[],
  comments: Map<string, string>
): void {
  for (const table of tables) {
    const comment = comments.get(table.fqn);
    if (comment) {
      table.comment = comment;
    }
  }
}

/**
 * Fetch table types and data source formats from information_schema.tables.
 *
 * Returns { types, formats } maps keyed by FQN.
 * - types: FQN -> table_type (TABLE, VIEW, MATERIALIZED_VIEW, etc.)
 * - formats: FQN -> data_source_format (DELTA, PARQUET, CSV, JSON, etc.)
 */
export async function fetchTableTypes(
  catalog: string,
  schema?: string
): Promise<{ types: Map<string, string>; formats: Map<string, string> }> {
  const types = new Map<string, string>();
  const formats = new Map<string, string>();
  try {
    const safeCatalog = validateIdentifier(catalog, "catalog");
    let sql = `
      SELECT table_catalog, table_schema, table_name, table_type, data_source_format
      FROM \`${safeCatalog}\`.information_schema.tables
      WHERE table_schema NOT IN ('information_schema', 'default')
    `;
    if (schema) {
      const safeSchema = validateIdentifier(schema, "schema");
      sql += ` AND table_schema = '${safeSchema}'`;
    }

    const result = await executeSQL(sql);
    for (const row of result.rows) {
      const cat = row[0] ?? "";
      const sch = row[1] ?? "";
      const tbl = row[2] ?? "";
      const typ = row[3] ?? "TABLE";
      const fmt = row[4] ?? null;
      const fqn = `${cat}.${sch}.${tbl}`;
      types.set(fqn, typ);
      if (fmt) formats.set(fqn, fmt);
    }

    logger.info("[metadata] Fetched table types", {
      catalog,
      schema: schema ?? "(all)",
      total: types.size,
      views: Array.from(types.values()).filter((t) => t === "VIEW").length,
      deltaCount: Array.from(formats.values()).filter((f) => f.toUpperCase() === "DELTA").length,
    });
  } catch (error) {
    logger.warn("[metadata] Failed to fetch table types, continuing without", {
      catalog,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { types, formats };
}

/**
 * Merge table types and formats into a list of TableInfo objects in-place.
 * Updates the `tableType` and `dataSourceFormat` fields.
 */
export function mergeTableTypes(
  tables: TableInfo[],
  typesOrResult: Map<string, string> | { types: Map<string, string>; formats: Map<string, string> }
): void {
  const types = typesOrResult instanceof Map ? typesOrResult : typesOrResult.types;
  const formats = typesOrResult instanceof Map ? null : typesOrResult.formats;
  for (const table of tables) {
    const type = types.get(table.fqn);
    if (type) {
      table.tableType = type;
    }
    if (formats) {
      const format = formats.get(table.fqn);
      if (format) {
        table.dataSourceFormat = format;
      }
    }
  }
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

// ---------------------------------------------------------------------------
// Batch lookups by FQN (for lineage-discovered tables)
// ---------------------------------------------------------------------------

function parseFqn(fqn: string): { catalog: string; schema: string; tableName: string } | null {
  const parts = fqn.split(".");
  if (parts.length !== 3) return null;
  return { catalog: parts[0], schema: parts[1], tableName: parts[2] };
}

function buildFqnWhereClause(fqns: string[]): string {
  const conditions = fqns
    .map((fqn) => parseFqn(fqn))
    .filter((p): p is NonNullable<typeof p> => p !== null)
    .map((p) => {
      const safeCatalog = validateIdentifier(p.catalog, "catalog");
      const safeSchema = validateIdentifier(p.schema, "schema");
      const safeTable = validateIdentifier(p.tableName, "table");
      return `(table_catalog = '${safeCatalog}' AND table_schema = '${safeSchema}' AND table_name = '${safeTable}')`;
    });
  return conditions.join(" OR ");
}

/**
 * Fetch TableInfo for a list of specific FQNs (e.g. lineage-discovered tables).
 * Queries information_schema.tables by exact FQN match.
 */
export async function fetchTableInfoBatch(fqns: string[]): Promise<TableInfo[]> {
  if (fqns.length === 0) return [];

  const catalogs = [...new Set(fqns.map((f) => f.split(".")[0]).filter(Boolean))];
  const results: TableInfo[] = [];

  for (const catalog of catalogs) {
    const catalogFqns = fqns.filter((f) => f.startsWith(`${catalog}.`));
    const whereClause = buildFqnWhereClause(catalogFqns);
    if (!whereClause) continue;

    try {
      const safeCatalog = validateIdentifier(catalog, "catalog");
      const sql = `
        SELECT table_catalog, table_schema, table_name, table_type, comment
        FROM \`${safeCatalog}\`.information_schema.tables
        WHERE (${whereClause})
      `;
      const result = await executeSQL(sql);
      for (const row of result.rows) {
        const cat = row[0] ?? "";
        const sch = row[1] ?? "";
        const tbl = row[2] ?? "";
        results.push({
          catalog: cat,
          schema: sch,
          tableName: tbl,
          fqn: `${cat}.${sch}.${tbl}`,
          tableType: row[3] ?? "TABLE",
          comment: row[4] ?? null,
        });
      }
    } catch (error) {
      logger.warn("[metadata] fetchTableInfoBatch failed for catalog", {
        catalog,
        count: catalogFqns.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Fetch ColumnInfo for a list of specific FQNs (e.g. lineage-discovered tables).
 * Queries information_schema.columns by exact FQN match.
 */
export async function fetchColumnsBatch(fqns: string[]): Promise<ColumnInfo[]> {
  if (fqns.length === 0) return [];

  const catalogs = [...new Set(fqns.map((f) => f.split(".")[0]).filter(Boolean))];
  const results: ColumnInfo[] = [];

  for (const catalog of catalogs) {
    const catalogFqns = fqns.filter((f) => f.startsWith(`${catalog}.`));
    const whereClause = buildFqnWhereClause(catalogFqns);
    if (!whereClause) continue;

    try {
      const safeCatalog = validateIdentifier(catalog, "catalog");
      const sql = `
        SELECT table_catalog, table_schema, table_name,
               column_name, data_type, ordinal_position, is_nullable, comment
        FROM \`${safeCatalog}\`.information_schema.columns
        WHERE (${whereClause})
        ORDER BY table_schema, table_name, ordinal_position
      `;
      const mapped = await executeSQLMapped(sql, rowToColumn);
      results.push(...mapped);
    } catch (error) {
      logger.warn("[metadata] fetchColumnsBatch failed for catalog", {
        catalog,
        count: catalogFqns.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Fetch ForeignKey relationships for a list of specific FQNs.
 * Queries information_schema constraint tables by exact FQN match.
 */
export async function fetchForeignKeysBatch(fqns: string[]): Promise<ForeignKey[]> {
  if (fqns.length === 0) return [];

  const catalogs = [...new Set(fqns.map((f) => f.split(".")[0]).filter(Boolean))];
  const results: ForeignKey[] = [];

  for (const catalog of catalogs) {
    const catalogFqns = fqns.filter((f) => f.startsWith(`${catalog}.`));
    const whereClause = buildFqnWhereClause(catalogFqns);
    if (!whereClause) continue;

    try {
      const safeCatalog = validateIdentifier(catalog, "catalog");
      const sql = `
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
          AND (${whereClause.replace(/table_catalog/g, "kcu.table_catalog").replace(/table_schema/g, "kcu.table_schema").replace(/table_name/g, "kcu.table_name")})
      `;
      const result = await executeSQL(sql);
      for (const row of result.rows) {
        results.push({
          constraintName: row[0] ?? "",
          tableFqn: row[1] ?? "",
          columnName: row[2] ?? "",
          referencedTableFqn: row[3] ?? "",
          referencedColumnName: row[4] ?? "",
        });
      }
    } catch {
      // FK views may not be available
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Markdown builders
// ---------------------------------------------------------------------------

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

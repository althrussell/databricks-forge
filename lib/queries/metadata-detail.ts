/**
 * Enrichment queries for deep metadata extraction.
 *
 * DESCRIBE DETAIL, DESCRIBE HISTORY, SHOW TBLPROPERTIES, tags, and
 * system table queries. All queries use the SQL Statement Execution API
 * and include graceful fallback on permission errors.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { validateIdentifier } from "@/lib/validation";
import { logger } from "@/lib/logger";
import type {
  TableDetail,
  TableHistorySummary,
  TableTag,
  ColumnTag,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// DESCRIBE DETAIL
// ---------------------------------------------------------------------------

/**
 * Run DESCRIBE DETAIL on a table and map to TableDetail.
 * Returns null on permission errors or if the table doesn't exist.
 */
export async function describeDetail(
  tableFqn: string,
  discoveredVia: "selected" | "lineage" = "selected"
): Promise<TableDetail | null> {
  const [catalog, schema, table] = splitFqn(tableFqn);
  const safeCat = validateIdentifier(catalog, "catalog");
  const safeSch = validateIdentifier(schema, "schema");
  const safeTbl = validateIdentifier(table, "table");
  const sql = `DESCRIBE DETAIL \`${safeCat}\`.\`${safeSch}\`.\`${safeTbl}\``;

  try {
    const result = await executeSQL(sql);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const col = (name: string): string | null => {
      const idx = result.columns.findIndex(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      );
      return idx >= 0 ? row[idx] ?? null : null;
    };

    const location = col("location");
    const partitionCols = col("partitionColumns") ?? col("partition_columns");
    const clusteringCols = col("clusteringColumns") ?? col("clustering_columns");

    return {
      catalog,
      schema,
      tableName: table,
      fqn: tableFqn,
      tableType: col("format") ?? "UNKNOWN",
      comment: null, // filled later from information_schema
      sizeInBytes: parseIntSafe(col("sizeInBytes") ?? col("size_in_bytes")),
      numFiles: parseIntSafe(col("numFiles") ?? col("num_files")),
      numRows: null, // populated later from TBLPROPERTIES (spark.sql.statistics.numRows)
      format: col("format"),
      partitionColumns: parseStringArray(partitionCols),
      clusteringColumns: parseStringArray(clusteringCols),
      location,
      owner: col("owner"),
      provider: col("provider"),
      isManaged: location ? !location.startsWith("s3://") && !location.startsWith("gs://") && !location.startsWith("abfss://") : true,
      deltaMinReaderVersion: parseIntSafe(col("minReaderVersion") ?? col("min_reader_version")),
      deltaMinWriterVersion: parseIntSafe(col("minWriterVersion") ?? col("min_writer_version")),
      createdAt: col("createdAt") ?? col("created_at"),
      lastModified: col("lastModified") ?? col("last_modified"),
      tableProperties: {},
      discoveredVia,
      dataDomain: null,
      dataSubdomain: null,
      dataTier: null,
      generatedDescription: null,
      sensitivityLevel: null,
      governancePriority: null,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("EXPECT_TABLE_NOT_VIEW") || msg.includes("is a view")) {
      logger.debug("[metadata-detail] Skipping DESCRIBE DETAIL for view", { tableFqn });
      return null;
    }
    if (msg.includes("INSUFFICIENT_PERMISSIONS") || msg.includes("does not exist") || msg.includes("(403)") || msg.includes("(404)")) {
      logger.warn("[metadata-detail] Permission denied for DESCRIBE DETAIL", { tableFqn });
      return null;
    }
    logger.error("[metadata-detail] DESCRIBE DETAIL failed", { tableFqn, error: msg });
    return null;
  }
}

/**
 * Create a minimal TableDetail for a table/view where DESCRIBE DETAIL returned null.
 * Ensures views and inaccessible tables still appear in the estate.
 */
export function createFallbackDetail(
  fqn: string,
  discoveredVia: "selected" | "lineage",
  tableType = "VIEW"
): TableDetail {
  const [catalog, schema, tableName] = splitFqn(fqn);
  return {
    catalog,
    schema,
    tableName,
    fqn,
    tableType,
    comment: null,
    sizeInBytes: null,
    numFiles: null,
    numRows: null,
    format: null,
    partitionColumns: [],
    clusteringColumns: [],
    location: null,
    owner: null,
    provider: null,
    isManaged: true,
    deltaMinReaderVersion: null,
    deltaMinWriterVersion: null,
    createdAt: null,
    lastModified: null,
    tableProperties: {},
    discoveredVia,
    dataDomain: null,
    dataSubdomain: null,
    dataTier: null,
    generatedDescription: null,
    sensitivityLevel: null,
    governancePriority: null,
  };
}

// ---------------------------------------------------------------------------
// DESCRIBE HISTORY
// ---------------------------------------------------------------------------

/**
 * Run DESCRIBE HISTORY and aggregate into TableHistorySummary.
 * Returns null on permission errors or for views (which don't support history).
 */
export async function describeHistory(
  tableFqn: string,
  limit = 100
): Promise<TableHistorySummary | null> {
  const [catalog, schema, table] = splitFqn(tableFqn);
  const safeCat = validateIdentifier(catalog, "catalog");
  const safeSch = validateIdentifier(schema, "schema");
  const safeTbl = validateIdentifier(table, "table");
  const sql = `DESCRIBE HISTORY \`${safeCat}\`.\`${safeSch}\`.\`${safeTbl}\` LIMIT ${limit}`;

  try {
    const result = await executeSQL(sql);
    if (result.rows.length === 0) {
      return emptyHistory(tableFqn);
    }

    const colIdx = (name: string) =>
      result.columns.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());

    const timestampIdx = colIdx("timestamp");
    const operationIdx = colIdx("operation");
    const operationParamsIdx = colIdx("operationParameters") >= 0
      ? colIdx("operationParameters")
      : colIdx("operation_parameters");
    const operationMetricsIdx = colIdx("operationMetrics") >= 0
      ? colIdx("operationMetrics")
      : colIdx("operation_metrics");

    const opCounts: Record<string, number> = {};
    let lastWriteTimestamp: string | null = null;
    let lastWriteOperation: string | null = null;
    let lastWriteRows: number | null = null;
    let lastWriteBytes: number | null = null;
    let lastOptimize: string | null = null;
    let lastVacuum: string | null = null;
    let totalWrite = 0;
    let totalStreaming = 0;
    let totalOptimize = 0;
    let totalVacuum = 0;
    let totalMerge = 0;
    let earliestTimestamp: string | null = null;
    let latestTimestamp: string | null = null;

    for (const row of result.rows) {
      const ts = timestampIdx >= 0 ? row[timestampIdx] : null;
      const op = operationIdx >= 0 ? row[operationIdx] ?? "" : "";
      const opParams = operationParamsIdx >= 0 ? row[operationParamsIdx] ?? "" : "";
      const opMetrics = operationMetricsIdx >= 0 ? row[operationMetricsIdx] ?? "" : "";

      opCounts[op] = (opCounts[op] ?? 0) + 1;

      if (ts) {
        if (!latestTimestamp || ts > latestTimestamp) latestTimestamp = ts;
        if (!earliestTimestamp || ts < earliestTimestamp) earliestTimestamp = ts;
      }

      const isWrite = ["WRITE", "APPEND", "OVERWRITE", "DELETE", "UPDATE", "MERGE", "CREATE TABLE", "REPLACE TABLE", "STREAMING UPDATE"].includes(op);
      const isStreaming = op === "STREAMING UPDATE" || opParams.includes('"outputMode"');

      if (isWrite) {
        totalWrite++;
        if (!lastWriteTimestamp || (ts && ts > lastWriteTimestamp)) {
          lastWriteTimestamp = ts;
          lastWriteOperation = op;
          // Parse operationMetrics for row/byte counts
          if (opMetrics) {
            try {
              const metrics = typeof opMetrics === "string" ? JSON.parse(opMetrics) : opMetrics;
              lastWriteRows = parseIntSafe(metrics.numOutputRows ?? metrics.numTargetRowsInserted ?? null);
              lastWriteBytes = parseIntSafe(metrics.numOutputBytes ?? metrics.numAddedBytes ?? null);
            } catch { /* skip malformed metrics */ }
          }
        }
      }

      if (isStreaming) totalStreaming++;
      if (op === "OPTIMIZE") {
        totalOptimize++;
        if (!lastOptimize || (ts && ts > lastOptimize)) lastOptimize = ts;
      }
      if (op === "VACUUM END" || op === "VACUUM START") {
        totalVacuum++;
        if (!lastVacuum || (ts && ts > lastVacuum)) lastVacuum = ts;
      }
      if (op === "MERGE") totalMerge++;
    }

    const historyDays = earliestTimestamp && latestTimestamp
      ? Math.max(1, Math.round((new Date(latestTimestamp).getTime() - new Date(earliestTimestamp).getTime()) / 86_400_000))
      : 0;

    return {
      tableFqn,
      lastWriteTimestamp,
      lastWriteOperation,
      lastWriteRows,
      lastWriteBytes,
      totalWriteOps: totalWrite,
      totalStreamingOps: totalStreaming,
      totalOptimizeOps: totalOptimize,
      totalVacuumOps: totalVacuum,
      totalMergeOps: totalMerge,
      lastOptimizeTimestamp: lastOptimize,
      lastVacuumTimestamp: lastVacuum,
      hasStreamingWrites: totalStreaming > 0,
      historyDays,
      topOperations: opCounts,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("EXPECT_TABLE_NOT_VIEW") || msg.includes("is a view")) {
      logger.debug("[metadata-detail] Skipping DESCRIBE HISTORY for view", { tableFqn });
      return null;
    }
    if (msg.includes("INSUFFICIENT_PERMISSIONS") || msg.includes("(403)")) {
      logger.warn("[metadata-detail] Permission denied for DESCRIBE HISTORY", { tableFqn });
      return null;
    }
    logger.error("[metadata-detail] DESCRIBE HISTORY failed", { tableFqn, error: msg });
    return null;
  }
}

// ---------------------------------------------------------------------------
// SHOW TBLPROPERTIES
// ---------------------------------------------------------------------------

/**
 * Run SHOW TBLPROPERTIES and return a key-value map.
 */
export async function getTableProperties(
  tableFqn: string
): Promise<Record<string, string>> {
  const [catalog, schema, table] = splitFqn(tableFqn);
  const safeCat = validateIdentifier(catalog, "catalog");
  const safeSch = validateIdentifier(schema, "schema");
  const safeTbl = validateIdentifier(table, "table");
  const sql = `SHOW TBLPROPERTIES \`${safeCat}\`.\`${safeSch}\`.\`${safeTbl}\``;

  try {
    const result = await executeSQL(sql);
    const props: Record<string, string> = {};
    for (const row of result.rows) {
      const key = row[0]?.trim();
      const value = row[1]?.trim();
      if (key) props[key] = value ?? "";
    }
    return props;
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/**
 * Query table tags from information_schema.table_tags.
 * Graceful fallback to empty array.
 */
export async function getTableTags(
  catalog: string,
  schema?: string
): Promise<TableTag[]> {
  const safeCat = validateIdentifier(catalog, "catalog");
  try {
    let sql = `
      SELECT table_catalog || '.' || table_schema || '.' || table_name AS table_fqn,
             tag_name, tag_value
      FROM \`${safeCat}\`.information_schema.table_tags
      WHERE table_schema NOT IN ('information_schema', 'default')
    `;
    if (schema) {
      const safeSch = validateIdentifier(schema, "schema");
      sql += ` AND table_schema = '${safeSch}'`;
    }

    const result = await executeSQL(sql);
    return result.rows.map((row) => ({
      tableFqn: row[0] ?? "",
      tagName: row[1] ?? "",
      tagValue: row[2] ?? "",
    }));
  } catch {
    return [];
  }
}

/**
 * Query column tags from information_schema.column_tags.
 * Graceful fallback to empty array.
 */
export async function getColumnTags(
  catalog: string,
  schema?: string
): Promise<ColumnTag[]> {
  const safeCat = validateIdentifier(catalog, "catalog");
  try {
    let sql = `
      SELECT table_catalog || '.' || table_schema || '.' || table_name AS table_fqn,
             column_name, tag_name, tag_value
      FROM \`${safeCat}\`.information_schema.column_tags
      WHERE table_schema NOT IN ('information_schema', 'default')
    `;
    if (schema) {
      const safeSch = validateIdentifier(schema, "schema");
      sql += ` AND table_schema = '${safeSch}'`;
    }

    const result = await executeSQL(sql);
    return result.rows.map((row) => ({
      tableFqn: row[0] ?? "",
      columnName: row[1] ?? "",
      tagName: row[2] ?? "",
      tagValue: row[3] ?? "",
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// System tables
// ---------------------------------------------------------------------------

/**
 * Query recent query history touching tables in the given scope.
 * Graceful fallback to empty array.
 */
export async function getQueryHistory(
  catalog: string,
  _schema?: string // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<Array<{ statementText: string; executedBy: string; startTime: string }>> {
  try {
    const sql = `
      SELECT statement_text, executed_by, start_time
      FROM system.query.history
      WHERE statement_text LIKE '%${validateIdentifier(catalog, "catalog")}%'
        AND start_time > DATEADD(DAY, -30, CURRENT_TIMESTAMP())
      ORDER BY start_time DESC
      LIMIT 100
    `;
    const result = await executeSQL(sql);
    return result.rows.map((row) => ({
      statementText: row[0] ?? "",
      executedBy: row[1] ?? "",
      startTime: row[2] ?? "",
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Batch enrichment orchestrator
// ---------------------------------------------------------------------------

export interface EnrichmentResult {
  detail: TableDetail | null;
  history: TableHistorySummary | null;
  properties: Record<string, string>;
}

/**
 * Enrich tables in parallel batches. Runs DESCRIBE DETAIL, DESCRIBE HISTORY,
 * and SHOW TBLPROPERTIES for each table.
 *
 * When DESCRIBE DETAIL returns null (views, permission denied), a fallback
 * TableDetail is created so the table still appears in the estate.
 *
 * @param tables - array of { fqn, discoveredVia, tableType? }
 * @param concurrency - how many tables to process in parallel (default 5)
 * @param onProgress - optional callback for progress updates
 */
export async function enrichTablesInBatches(
  tables: Array<{ fqn: string; discoveredVia: "selected" | "lineage"; tableType?: string }>,
  concurrency = 5,
  onProgress?: (completed: number, total: number) => void
): Promise<Map<string, EnrichmentResult>> {
  const results = new Map<string, EnrichmentResult>();
  let completed = 0;

  for (let i = 0; i < tables.length; i += concurrency) {
    const batch = tables.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (t) => {
        const [detail, history, properties] = await Promise.all([
          describeDetail(t.fqn, t.discoveredVia),
          describeHistory(t.fqn),
          getTableProperties(t.fqn),
        ]);

        // If DESCRIBE DETAIL returned null (view or inaccessible), create a fallback
        const effectiveDetail = detail ?? createFallbackDetail(
          t.fqn,
          t.discoveredVia,
          t.tableType ?? "VIEW"
        );

        // Merge properties into detail
        if (properties && Object.keys(properties).length > 0) {
          effectiveDetail.tableProperties = properties;
          // Extract row count from computed statistics (available after ANALYZE TABLE)
          const statsNumRows = properties["spark.sql.statistics.numRows"];
          if (statsNumRows && effectiveDetail.numRows == null) {
            effectiveDetail.numRows = parseIntSafe(statsNumRows);
          }
        }

        return { fqn: t.fqn, detail: effectiveDetail, history, properties };
      })
    );

    for (const r of batchResults) {
      if (r.status === "fulfilled") {
        results.set(r.value.fqn, {
          detail: r.value.detail,
          history: r.value.history,
          properties: r.value.properties,
        });
      }
      completed++;
    }

    if (onProgress) onProgress(completed, tables.length);

    logger.info("[metadata-detail] Enrichment progress", {
      completed,
      total: tables.length,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function splitFqn(fqn: string): [string, string, string] {
  const parts = fqn.split(".");
  if (parts.length < 3) {
    throw new Error(`Invalid table FQN: ${fqn} (expected catalog.schema.table)`);
  }
  return [parts[0], parts[1], parts[2]];
}

function parseIntSafe(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? null : parsed;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Try comma-separated fallback
    return value.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function emptyHistory(tableFqn: string): TableHistorySummary {
  return {
    tableFqn,
    lastWriteTimestamp: null,
    lastWriteOperation: null,
    lastWriteRows: null,
    lastWriteBytes: null,
    totalWriteOps: 0,
    totalStreamingOps: 0,
    totalOptimizeOps: 0,
    totalVacuumOps: 0,
    totalMergeOps: 0,
    lastOptimizeTimestamp: null,
    lastVacuumTimestamp: null,
    hasStreamingWrites: false,
    historyDays: 0,
    topOperations: {},
  };
}

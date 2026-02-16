/**
 * Pipeline Step 2: Metadata Extraction
 *
 * Queries Unity Catalog information_schema for catalogs, schemas, tables,
 * columns, and foreign keys. Builds a MetadataSnapshot.
 */

import {
  listTables,
  listColumns,
  listForeignKeys,
  listMetricViews,
  buildSchemaMarkdown,
} from "@/lib/queries/metadata";
import { updateRunMessage } from "@/lib/lakebase/runs";
import type {
  MetadataSnapshot,
  MetricViewInfo,
  PipelineContext,
  TableInfo,
  ColumnInfo,
  ForeignKey,
} from "@/lib/domain/types";
import { v4 as uuidv4 } from "uuid";

/**
 * Parse the uc_metadata input string into catalog/schema pairs.
 * Supports formats:
 *   - "catalog" (whole catalog)
 *   - "catalog.schema" (single schema)
 *   - "catalog1, catalog2" (multiple catalogs)
 *   - "catalog.schema1, catalog.schema2" (multiple schemas)
 */
function parseUCMetadata(
  ucMetadata: string
): Array<{ catalog: string; schema?: string }> {
  const parts = ucMetadata.split(",").map((p) => p.trim());
  return parts.map((part) => {
    const segments = part.split(".");
    if (segments.length >= 2) {
      return { catalog: segments[0], schema: segments[1] };
    }
    return { catalog: segments[0] };
  });
}

export async function runMetadataExtraction(
  ctx: PipelineContext,
  runId?: string
): Promise<MetadataSnapshot> {
  const { config } = ctx.run;
  const scopes = parseUCMetadata(config.ucMetadata);

  const allTables: TableInfo[] = [];
  const allColumns: ColumnInfo[] = [];
  const allFKs: ForeignKey[] = [];
  const allMetricViews: MetricViewInfo[] = [];

  for (let si = 0; si < scopes.length; si++) {
    const scope = scopes[si];
    const scopeLabel = `${scope.catalog}${scope.schema ? "." + scope.schema : ""}`;
    try {
      if (runId) await updateRunMessage(runId, `Scanning catalog ${scopeLabel}... (${si + 1}/${scopes.length})`);
      const tables = await listTables(scope.catalog, scope.schema);
      allTables.push(...tables);

      if (runId) await updateRunMessage(runId, `Extracting columns for ${tables.length} tables in ${scopeLabel}...`);
      const columns = await listColumns(scope.catalog, scope.schema);
      allColumns.push(...columns);

      const fks = await listForeignKeys(scope.catalog, scope.schema);
      allFKs.push(...fks);

      const mvs = await listMetricViews(scope.catalog, scope.schema);
      allMetricViews.push(...mvs);
    } catch (error) {
      console.warn(
        `[metadata-extraction] Failed to extract metadata for ${scopeLabel}:`,
        error
      );
    }
  }

  if (runId && allTables.length > 0) {
    await updateRunMessage(runId, `Found ${allTables.length} tables across ${scopes.length} scope(s), ${allColumns.length} columns`);
  }

  if (allTables.length === 0) {
    throw new Error(
      `No tables found for UC metadata scope: ${config.ucMetadata}. Check permissions and paths.`
    );
  }

  const schemaMarkdown = buildSchemaMarkdown(allTables, allColumns);

  const snapshot: MetadataSnapshot = {
    cacheKey: uuidv4(),
    ucPath: config.ucMetadata,
    tables: allTables,
    columns: allColumns,
    foreignKeys: allFKs,
    metricViews: allMetricViews,
    schemaMarkdown,
    tableCount: allTables.length,
    columnCount: allColumns.length,
    cachedAt: new Date().toISOString(),
  };

  console.log(
    `[metadata-extraction] Extracted ${snapshot.tableCount} tables, ${snapshot.columnCount} columns, ${allMetricViews.length} metric views`
  );

  return snapshot;
}

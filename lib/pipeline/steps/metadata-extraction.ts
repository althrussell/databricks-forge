/**
 * Pipeline Step 2: Metadata Extraction
 *
 * Queries Unity Catalog information_schema for catalogs, schemas, tables,
 * columns, and foreign keys. Builds a MetadataSnapshot.
 *
 * After basic extraction, runs an enrichment pass:
 *   1. Lineage walk (BFS via system.access.table_lineage)
 *   2. DESCRIBE DETAIL + DESCRIBE HISTORY + SHOW TBLPROPERTIES
 *   3. Tags (table + column)
 *   4. Rule-based health scoring
 *   5. LLM intelligence layer (domains, PII, descriptions, etc.)
 *   6. Save to Lakebase as EnvironmentScan
 */

import {
  listTables,
  listColumns,
  listForeignKeys,
  listMetricViews,
  fetchTableComments,
  mergeTableComments,
  buildSchemaMarkdown,
} from "@/lib/queries/metadata";
import {
  enrichTablesInBatches,
  getTableTags,
  getColumnTags,
} from "@/lib/queries/metadata-detail";
import { walkLineage } from "@/lib/queries/lineage";
import {
  runIntelligenceLayer,
  buildTableInputs,
} from "@/lib/ai/environment-intelligence";
import { computeAllTableHealth } from "@/lib/domain/health-score";
import { saveEnvironmentScan, type InsightRecord } from "@/lib/lakebase/environment-scans";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { getServingEndpoint } from "@/lib/dbx/client";
import { logger } from "@/lib/logger";
import type {
  MetadataSnapshot,
  MetricViewInfo,
  PipelineContext,
  TableInfo,
  ColumnInfo,
  ForeignKey,
  EnvironmentScan,
  TableDetail,
  TableHistorySummary,
  TableHealthInsight,
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
  const enrichmentStart = Date.now();

  const allTables: TableInfo[] = [];
  const allColumns: ColumnInfo[] = [];
  const allFKs: ForeignKey[] = [];
  const allMetricViews: MetricViewInfo[] = [];

  // --- Phase 1: Basic metadata extraction (existing logic) ---

  for (let si = 0; si < scopes.length; si++) {
    const scope = scopes[si];
    const scopeLabel = `${scope.catalog}${scope.schema ? "." + scope.schema : ""}`;
    try {
      if (runId) await updateRunMessage(runId, `Scanning catalog ${scopeLabel}... (${si + 1}/${scopes.length})`);
      const tables = await listTables(scope.catalog, scope.schema);
      allTables.push(...tables);

      // Fetch table descriptions from information_schema.tables
      const tableComments = await fetchTableComments(scope.catalog, scope.schema);
      mergeTableComments(tables, tableComments);

      if (runId) await updateRunMessage(runId, `Extracting columns for ${tables.length} tables in ${scopeLabel}...`);
      const columns = await listColumns(scope.catalog, scope.schema);
      allColumns.push(...columns);

      const fks = await listForeignKeys(scope.catalog, scope.schema);
      allFKs.push(...fks);

      const mvs = await listMetricViews(scope.catalog, scope.schema);
      allMetricViews.push(...mvs);
    } catch (error) {
      logger.warn(`[metadata-extraction] Failed to extract metadata for ${scopeLabel}`, {
        error: error instanceof Error ? error.message : String(error),
      });
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

  logger.info(
    `[metadata-extraction] Extracted ${snapshot.tableCount} tables, ${snapshot.columnCount} columns, ${allMetricViews.length} metric views`
  );

  // --- Phase 2: Enrichment pass ---

  try {
    await runEnrichmentPass(
      snapshot,
      allTables,
      allColumns,
      allFKs,
      scopes,
      runId
    );
  } catch (error) {
    logger.error("[metadata-extraction] Enrichment pass failed (non-fatal)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const enrichmentMs = Date.now() - enrichmentStart;
  logger.info("[metadata-extraction] Enrichment pass duration", { durationMs: enrichmentMs });

  return snapshot;
}

// ---------------------------------------------------------------------------
// Enrichment pass
// ---------------------------------------------------------------------------

async function runEnrichmentPass(
  snapshot: MetadataSnapshot,
  allTables: TableInfo[],
  allColumns: ColumnInfo[],
  allFKs: ForeignKey[],
  scopes: Array<{ catalog: string; schema?: string }>,
  runId?: string
): Promise<void> {
  const scanId = uuidv4();
  const startTime = Date.now();

  // Step 1: Lineage walk
  if (runId) await updateRunMessage(runId, "Walking lineage to discover related tables...");
  const seedFqns = allTables.map((t) => t.fqn);
  const lineageGraph = await walkLineage(seedFqns);

  // Merge discovered tables into the working set
  const discoveredFqns = lineageGraph.discoveredTables;
  const expandedTables = [
    ...seedFqns.map((fqn) => ({ fqn, discoveredVia: "selected" as const })),
    ...discoveredFqns.map((fqn) => ({ fqn, discoveredVia: "lineage" as const })),
  ];

  logger.info("[metadata-extraction] Lineage expanded scope", {
    seed: seedFqns.length,
    discovered: discoveredFqns.length,
    total: expandedTables.length,
  });

  // Step 2: Deep metadata enrichment
  if (runId) await updateRunMessage(runId, `Enriching ${expandedTables.length} tables (DESCRIBE DETAIL + HISTORY)...`);
  const enrichmentResults = await enrichTablesInBatches(
    expandedTables,
    5,
    (completed, total) => {
      if (runId && completed % 10 === 0) {
        updateRunMessage(runId, `Enrichment: ${completed}/${total} tables...`).catch(() => {});
      }
    }
  );

  // Step 3: Tags
  if (runId) await updateRunMessage(runId, "Fetching tags...");
  const allTableTags = [];
  const allColumnTags = [];
  for (const scope of scopes) {
    const tTags = await getTableTags(scope.catalog, scope.schema);
    allTableTags.push(...tTags);
    const cTags = await getColumnTags(scope.catalog, scope.schema);
    allColumnTags.push(...cTags);
  }

  // Merge table comments from information_schema into enrichment details
  const commentLookup = new Map<string, string>();
  for (const t of allTables) {
    if (t.comment) commentLookup.set(t.fqn, t.comment);
  }
  for (const [fqn, result] of enrichmentResults) {
    if (result.detail && !result.detail.comment) {
      const comment = commentLookup.get(fqn);
      if (comment) result.detail.comment = comment;
    }
  }

  // Step 4: Health scoring
  if (runId) await updateRunMessage(runId, "Computing health scores...");
  const details: TableDetail[] = [];
  const histories = new Map<string, TableHistorySummary>();

  for (const [fqn, result] of enrichmentResults) {
    if (result.detail) details.push(result.detail);
    if (result.history) histories.set(fqn, result.history);
  }

  const healthScores = computeAllTableHealth(details, histories);

  // Step 5: LLM intelligence layer
  let intelligenceResult;
  try {
    const endpoint = getServingEndpoint();
    if (runId) await updateRunMessage(runId, "Running LLM intelligence analysis...");
    const tableInputs = buildTableInputs(enrichmentResults, allColumns, allTableTags);

    intelligenceResult = await runIntelligenceLayer(
      tableInputs,
      lineageGraph,
      {
        endpoint,
        businessName: undefined,
        onProgress: (pass, pct) => {
          if (runId && pct === 0) {
            updateRunMessage(runId, `Intelligence: ${pass}...`).catch(() => {});
          }
        },
      }
    );

    // Apply LLM results to details
    for (const domain of intelligenceResult.domains) {
      for (const fqn of domain.tables) {
        const detail = details.find((d) => d.fqn === fqn);
        if (detail) {
          detail.dataDomain = domain.domain;
          detail.dataSubdomain = domain.subdomain;
        }
      }
    }

    for (const [fqn, tier] of intelligenceResult.tierAssignments) {
      const detail = details.find((d) => d.fqn === fqn);
      if (detail) detail.dataTier = tier.tier;
    }

    for (const [fqn, desc] of intelligenceResult.generatedDescriptions) {
      const detail = details.find((d) => d.fqn === fqn);
      if (detail) detail.generatedDescription = desc;
    }

    // Apply sensitivity levels
    const piiTables = new Set<string>();
    for (const s of intelligenceResult.sensitivities) {
      piiTables.add(s.tableFqn);
    }
    for (const detail of details) {
      if (piiTables.has(detail.fqn)) {
        detail.sensitivityLevel = "confidential";
      }
    }

    // Apply governance priorities
    for (const gap of intelligenceResult.governanceGaps) {
      const detail = details.find((d) => d.fqn === gap.tableFqn);
      if (detail) {
        if (gap.overallScore < 30) detail.governancePriority = "critical";
        else if (gap.overallScore < 50) detail.governancePriority = "high";
        else if (gap.overallScore < 70) detail.governancePriority = "medium";
        else detail.governancePriority = "low";
      }
    }
  } catch (error) {
    logger.warn("[metadata-extraction] LLM intelligence layer failed (non-fatal)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Step 6: Build scan record and save
  if (runId) await updateRunMessage(runId, "Saving environment scan...");

  const historiesWithHealth: Array<TableHistorySummary & TableHealthInsight> = [];
  for (const [fqn, history] of histories) {
    const health = healthScores.get(fqn) ?? {
      tableFqn: fqn,
      healthScore: 100,
      issues: [],
      recommendations: [],
    };
    historiesWithHealth.push({ ...history, ...health });
  }

  const scan: EnvironmentScan = {
    scanId,
    runId: runId ?? null,
    ucPath: snapshot.ucPath,
    scannedAt: new Date().toISOString(),
    tableCount: expandedTables.length,
    totalSizeBytes: details.reduce((sum, d) => sum + (d.sizeInBytes ?? 0), 0),
    totalFiles: details.reduce((sum, d) => sum + (d.numFiles ?? 0), 0),
    tablesWithStreaming: Array.from(histories.values()).filter((h) => h.hasStreamingWrites).length,
    tablesWithCDF: details.filter((d) => d.tableProperties["delta.enableChangeDataFeed"] === "true").length,
    tablesNeedingOptimize: Array.from(healthScores.values()).filter((h) => h.issues.some((i) => i.includes("OPTIMIZE"))).length,
    tablesNeedingVacuum: Array.from(healthScores.values()).filter((h) => h.issues.some((i) => i.includes("VACUUM"))).length,
    lineageDiscoveredCount: discoveredFqns.length,
    domainCount: intelligenceResult?.domains.length ?? 0,
    piiTablesCount: intelligenceResult?.sensitivities ? new Set(intelligenceResult.sensitivities.map((s) => s.tableFqn)).size : 0,
    redundancyPairsCount: intelligenceResult?.redundancies.length ?? 0,
    dataProductCount: intelligenceResult?.dataProducts.length ?? 0,
    avgGovernanceScore: intelligenceResult?.governanceGaps.length
      ? intelligenceResult.governanceGaps.reduce((s, g) => s + g.overallScore, 0) / intelligenceResult.governanceGaps.length
      : 0,
    scanDurationMs: Date.now() - startTime,
    passResults: intelligenceResult?.passResults ?? {},
  };

  // Build insight records
  const insightRecords: InsightRecord[] = [];

  if (intelligenceResult) {
    for (const s of intelligenceResult.sensitivities) {
      insightRecords.push({
        insightType: "pii_detection",
        tableFqn: s.tableFqn,
        payloadJson: JSON.stringify(s),
        severity: s.classification === "PII" || s.classification === "Health" ? "critical" : "high",
      });
    }

    for (const r of intelligenceResult.redundancies) {
      insightRecords.push({
        insightType: "redundancy",
        tableFqn: r.tableA,
        payloadJson: JSON.stringify(r),
        severity: r.similarityPercent > 90 ? "high" : "medium",
      });
    }

    for (const rel of intelligenceResult.implicitRelationships) {
      insightRecords.push({
        insightType: "implicit_relationship",
        tableFqn: rel.sourceTableFqn,
        payloadJson: JSON.stringify(rel),
        severity: "info",
      });
    }

    for (const dp of intelligenceResult.dataProducts) {
      insightRecords.push({
        insightType: "data_product",
        tableFqn: null,
        payloadJson: JSON.stringify(dp),
        severity: "info",
      });
    }

    for (const gap of intelligenceResult.governanceGaps) {
      insightRecords.push({
        insightType: "governance_gap",
        tableFqn: gap.tableFqn,
        payloadJson: JSON.stringify(gap),
        severity: gap.overallScore < 30 ? "critical" : gap.overallScore < 50 ? "high" : "medium",
      });
    }
  }

  await saveEnvironmentScan(
    scan,
    details,
    historiesWithHealth,
    lineageGraph.edges,
    insightRecords
  );

  logger.info("[metadata-extraction] Environment scan saved", {
    scanId,
    tables: details.length,
    lineageEdges: lineageGraph.edges.length,
    insights: insightRecords.length,
  });
}

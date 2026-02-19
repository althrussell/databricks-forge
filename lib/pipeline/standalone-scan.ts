/**
 * Standalone Environment Scan runner.
 *
 * Runs the same enrichment pipeline as metadata-extraction but
 * without a pipeline run context. Used by the standalone scan API.
 */

import {
  listTables,
  listColumns,
  listForeignKeys,
  fetchTableComments,
  mergeTableComments,
  fetchTableTypes,
  mergeTableTypes,
  fetchColumnsBatch,
} from "@/lib/queries/metadata";
import {
  enrichTablesInBatches,
  getTableTags,
  getColumnTags,
} from "@/lib/queries/metadata-detail";
import { walkLineage } from "@/lib/queries/lineage";
import { runIntelligenceLayer, buildTableInputs } from "@/lib/ai/environment-intelligence";
import { computeAllTableHealth } from "@/lib/domain/health-score";
import { saveEnvironmentScan, type InsightRecord } from "@/lib/lakebase/environment-scans";
import { getServingEndpoint } from "@/lib/dbx/client";
import { initScanProgress, updateScanProgress } from "@/lib/pipeline/scan-progress";
import { logger } from "@/lib/logger";
import type {
  EnvironmentScan,
  TableDetail,
  TableHistorySummary,
  TableHealthInsight,
} from "@/lib/domain/types";

/**
 * Parse the uc_metadata scope string.
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

/**
 * Run a standalone environment scan (no pipeline run context).
 */
export async function runStandaloneEnrichment(
  scanId: string,
  ucMetadata: string
): Promise<void> {
  const startTime = Date.now();
  const scopes = parseUCMetadata(ucMetadata);

  initScanProgress(scanId);
  logger.info("[standalone-scan] Starting", { scanId, ucMetadata, scopes: scopes.length });

  // Phase 1: Basic metadata
  updateScanProgress(scanId, {
    phase: "listing-tables",
    message: `Scanning ${scopes.length} scope${scopes.length !== 1 ? "s" : ""} for tables and columns...`,
  });

  const allTables = [];
  const allColumns = [];
  const allFKs = [];

  for (const scope of scopes) {
    const scopeLabel = `${scope.catalog}${scope.schema ? "." + scope.schema : ""}`;
    try {
      updateScanProgress(scanId, {
        message: `Listing tables in ${scopeLabel}...`,
      });
      const tables = await listTables(scope.catalog, scope.schema);
      const tableComments = await fetchTableComments(scope.catalog, scope.schema);
      mergeTableComments(tables, tableComments);
      const tableTypes = await fetchTableTypes(scope.catalog, scope.schema);
      mergeTableTypes(tables, tableTypes);
      allTables.push(...tables);
      updateScanProgress(scanId, {
        tablesFound: allTables.length,
        message: `Found ${allTables.length} tables. Fetching columns from ${scopeLabel}...`,
      });
      const columns = await listColumns(scope.catalog, scope.schema);
      allColumns.push(...columns);
      updateScanProgress(scanId, { columnsFound: allColumns.length });
      const fks = await listForeignKeys(scope.catalog, scope.schema);
      allFKs.push(...fks);
    } catch (error) {
      logger.warn("[standalone-scan] Scope failed", {
        scope,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (allTables.length === 0) {
    logger.error("[standalone-scan] No tables found", { scanId, ucMetadata });
    updateScanProgress(scanId, {
      phase: "failed",
      message: "No tables found. Check scope and permissions.",
    });
    return;
  }

  updateScanProgress(scanId, {
    phase: "fetching-metadata",
    tablesFound: allTables.length,
    columnsFound: allColumns.length,
    message: `Found ${allTables.length} tables and ${allColumns.length} columns.`,
  });

  // Build a lookup of tableType from the original table list
  const tableTypeLookup = new Map<string, string>();
  for (const t of allTables) {
    tableTypeLookup.set(t.fqn, t.tableType);
  }

  // Phase 2: Lineage walk
  updateScanProgress(scanId, {
    phase: "walking-lineage",
    message: `Walking lineage from ${allTables.length} seed tables...`,
  });
  const seedFqns = allTables.map((t) => t.fqn);
  const lineageGraph = await walkLineage(seedFqns);

  const expandedTables = [
    ...seedFqns.map((fqn) => ({ fqn, discoveredVia: "selected" as const, tableType: tableTypeLookup.get(fqn) ?? "TABLE" })),
    ...lineageGraph.discoveredTables.map((fqn) => ({ fqn, discoveredVia: "lineage" as const, tableType: "TABLE" })),
  ];

  // Fetch columns for lineage-discovered tables so they appear in the ERD
  if (lineageGraph.discoveredTables.length > 0) {
    try {
      const lineageCols = await fetchColumnsBatch(lineageGraph.discoveredTables);
      allColumns.push(...lineageCols);
    } catch (error) {
      logger.warn("[standalone-scan] Failed to fetch lineage-discovered columns (non-fatal)", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  updateScanProgress(scanId, {
    lineageTablesFound: lineageGraph.discoveredTables.length,
    lineageEdgesFound: lineageGraph.edges.length,
    tablesFound: expandedTables.length,
    message: `Lineage walk discovered ${lineageGraph.discoveredTables.length} additional tables and ${lineageGraph.edges.length} edges.`,
  });

  // Phase 3: Enrichment
  updateScanProgress(scanId, {
    phase: "enriching",
    enrichTotal: expandedTables.length,
    enrichedCount: 0,
    message: `Enriching ${expandedTables.length} tables (DESCRIBE DETAIL + HISTORY)...`,
  });
  const enrichmentResults = await enrichTablesInBatches(expandedTables, 5, (completed, total) => {
    updateScanProgress(scanId, {
      enrichedCount: completed,
      enrichTotal: total,
      message: `Enriching tables: ${completed}/${total}...`,
    });
  });

  // Merge table comments into enrichment details
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

  // Phase 4: Tags
  updateScanProgress(scanId, {
    phase: "fetching-tags",
    message: "Fetching Unity Catalog tags...",
  });
  const allTableTags = [];
  const allColumnTags = [];
  for (const scope of scopes) {
    allTableTags.push(...await getTableTags(scope.catalog, scope.schema));
    allColumnTags.push(...await getColumnTags(scope.catalog, scope.schema));
  }

  // Phase 5: Health scoring
  updateScanProgress(scanId, {
    phase: "health-scoring",
    message: "Computing table health scores...",
  });
  const details: TableDetail[] = [];
  const histories = new Map<string, TableHistorySummary>();
  for (const [fqn, result] of enrichmentResults) {
    if (result.detail) details.push(result.detail);
    if (result.history) histories.set(fqn, result.history);
  }
  const healthScores = computeAllTableHealth(details, histories);

  // Phase 6: LLM intelligence
  updateScanProgress(scanId, {
    phase: "llm-intelligence",
    message: "Running LLM intelligence analysis (domains, PII, governance)...",
  });
  let intelligenceResult;
  try {
    const endpoint = getServingEndpoint();
    const tableInputs = buildTableInputs(enrichmentResults, allColumns, allTableTags);
    intelligenceResult = await runIntelligenceLayer(tableInputs, lineageGraph, {
      endpoint,
      onProgress: (pass) => {
        updateScanProgress(scanId, {
          llmPass: pass,
          message: `LLM analysis: ${pass}...`,
        });
      },
    });

    // Apply results to details
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
    const piiTables = new Set(intelligenceResult.sensitivities.map((s) => s.tableFqn));
    for (const detail of details) {
      if (piiTables.has(detail.fqn)) detail.sensitivityLevel = "confidential";
    }
    for (const gap of intelligenceResult.governanceGaps) {
      const detail = details.find((d) => d.fqn === gap.tableFqn);
      if (detail) {
        if (gap.overallScore < 30) detail.governancePriority = "critical";
        else if (gap.overallScore < 50) detail.governancePriority = "high";
        else if (gap.overallScore < 70) detail.governancePriority = "medium";
        else detail.governancePriority = "low";
      }
    }
    // Update progress with LLM results
    updateScanProgress(scanId, {
      domainsFound: intelligenceResult.domains.length,
      piiDetected: new Set(intelligenceResult.sensitivities.map((s) => s.tableFqn)).size,
      message: `LLM analysis complete: ${intelligenceResult.domains.length} domains, ${new Set(intelligenceResult.sensitivities.map((s) => s.tableFqn)).size} PII tables detected.`,
    });
  } catch (error) {
    logger.warn("[standalone-scan] LLM intelligence failed (non-fatal)", {
      error: error instanceof Error ? error.message : String(error),
    });
    updateScanProgress(scanId, {
      message: "LLM analysis skipped (non-fatal error). Saving results...",
    });
  }

  // Phase 7: Save
  updateScanProgress(scanId, {
    phase: "saving",
    message: "Saving scan results to database...",
  });
  const historiesWithHealth: Array<TableHistorySummary & TableHealthInsight> = [];
  for (const [fqn, history] of histories) {
    const health = healthScores.get(fqn) ?? { tableFqn: fqn, healthScore: 100, issues: [], recommendations: [] };
    historiesWithHealth.push({ ...history, ...health });
  }

  const scan: EnvironmentScan = {
    scanId,
    runId: null,
    ucPath: ucMetadata,
    scannedAt: new Date().toISOString(),
    tableCount: expandedTables.length,
    totalSizeBytes: details.reduce((sum, d) => sum + (d.sizeInBytes ?? 0), 0),
    totalFiles: details.reduce((sum, d) => sum + (d.numFiles ?? 0), 0),
    totalRows: details.reduce((sum, d) => sum + (d.numRows ?? 0), 0),
    tablesWithStreaming: Array.from(histories.values()).filter((h) => h.hasStreamingWrites).length,
    tablesWithCDF: details.filter((d) => d.tableProperties["delta.enableChangeDataFeed"] === "true").length,
    tablesNeedingOptimize: Array.from(healthScores.values()).filter((h) => h.issues.some((i) => i.includes("OPTIMIZE"))).length,
    tablesNeedingVacuum: Array.from(healthScores.values()).filter((h) => h.issues.some((i) => i.includes("VACUUM"))).length,
    lineageDiscoveredCount: lineageGraph.discoveredTables.length,
    domainCount: intelligenceResult?.domains.length ?? 0,
    piiTablesCount: intelligenceResult ? new Set(intelligenceResult.sensitivities.map((s) => s.tableFqn)).size : 0,
    redundancyPairsCount: intelligenceResult?.redundancies.length ?? 0,
    dataProductCount: intelligenceResult?.dataProducts.length ?? 0,
    avgGovernanceScore: intelligenceResult?.governanceGaps.length
      ? intelligenceResult.governanceGaps.reduce((s, g) => s + g.overallScore, 0) / intelligenceResult.governanceGaps.length
      : 0,
    scanDurationMs: Date.now() - startTime,
    passResults: intelligenceResult?.passResults ?? {},
  };

  const insightRecords: InsightRecord[] = [];

  // Persist explicit FKs as insights so the ERD viewer can render them
  for (const fk of allFKs) {
    insightRecords.push({
      insightType: "foreign_key",
      tableFqn: fk.tableFqn,
      payloadJson: JSON.stringify(fk),
      severity: "info",
    });
  }

  if (intelligenceResult) {
    for (const s of intelligenceResult.sensitivities) {
      insightRecords.push({ insightType: "pii_detection", tableFqn: s.tableFqn, payloadJson: JSON.stringify(s), severity: s.classification === "PII" || s.classification === "Health" ? "critical" : "high" });
    }
    for (const r of intelligenceResult.redundancies) {
      insightRecords.push({ insightType: "redundancy", tableFqn: r.tableA, payloadJson: JSON.stringify(r), severity: r.similarityPercent > 90 ? "high" : "medium" });
    }
    for (const rel of intelligenceResult.implicitRelationships) {
      insightRecords.push({ insightType: "implicit_relationship", tableFqn: rel.sourceTableFqn, payloadJson: JSON.stringify(rel), severity: "info" });
    }
    for (const dp of intelligenceResult.dataProducts) {
      insightRecords.push({ insightType: "data_product", tableFqn: null, payloadJson: JSON.stringify(dp), severity: "info" });
    }
    for (const gap of intelligenceResult.governanceGaps) {
      insightRecords.push({ insightType: "governance_gap", tableFqn: gap.tableFqn, payloadJson: JSON.stringify(gap), severity: gap.overallScore < 30 ? "critical" : gap.overallScore < 50 ? "high" : "medium" });
    }
  }

  await saveEnvironmentScan(scan, details, historiesWithHealth, lineageGraph.edges, insightRecords, allColumns);

  updateScanProgress(scanId, {
    phase: "complete",
    message: `Scan complete — ${details.length} tables, ${lineageGraph.edges.length} lineage edges, ${intelligenceResult?.domains.length ?? 0} domains.`,
  });
  logger.info("[standalone-scan] Complete", { scanId, tables: details.length, durationMs: Date.now() - startTime });
}

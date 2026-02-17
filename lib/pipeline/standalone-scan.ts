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

  logger.info("[standalone-scan] Starting", { scanId, ucMetadata, scopes: scopes.length });

  // Phase 1: Basic metadata
  const allTables = [];
  const allColumns = [];
  const allFKs = [];

  for (const scope of scopes) {
    try {
      const tables = await listTables(scope.catalog, scope.schema);
      allTables.push(...tables);
      const columns = await listColumns(scope.catalog, scope.schema);
      allColumns.push(...columns);
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
    return;
  }

  // Phase 2: Lineage walk
  const seedFqns = allTables.map((t) => t.fqn);
  const lineageGraph = await walkLineage(seedFqns);

  const expandedTables = [
    ...seedFqns.map((fqn) => ({ fqn, discoveredVia: "selected" as const })),
    ...lineageGraph.discoveredTables.map((fqn) => ({ fqn, discoveredVia: "lineage" as const })),
  ];

  // Phase 3: Enrichment
  const enrichmentResults = await enrichTablesInBatches(expandedTables, 5);

  // Phase 4: Tags
  const allTableTags = [];
  const allColumnTags = [];
  for (const scope of scopes) {
    allTableTags.push(...await getTableTags(scope.catalog, scope.schema));
    allColumnTags.push(...await getColumnTags(scope.catalog, scope.schema));
  }

  // Phase 5: Health scoring
  const details: TableDetail[] = [];
  const histories = new Map<string, TableHistorySummary>();
  for (const [fqn, result] of enrichmentResults) {
    if (result.detail) details.push(result.detail);
    if (result.history) histories.set(fqn, result.history);
  }
  const healthScores = computeAllTableHealth(details, histories);

  // Phase 6: LLM intelligence
  let intelligenceResult;
  try {
    const endpoint = getServingEndpoint();
    const tableInputs = buildTableInputs(enrichmentResults, allColumns, allTableTags);
    intelligenceResult = await runIntelligenceLayer(tableInputs, lineageGraph, { endpoint });

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
  } catch (error) {
    logger.warn("[standalone-scan] LLM intelligence failed (non-fatal)", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Phase 7: Save
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

  await saveEnvironmentScan(scan, details, historiesWithHealth, lineageGraph.edges, insightRecords);
  logger.info("[standalone-scan] Complete", { scanId, tables: details.length, durationMs: Date.now() - startTime });
}

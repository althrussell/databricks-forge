/**
 * CRUD operations for environment scans — backed by Lakebase (Prisma).
 *
 * Stores enriched metadata, lineage edges, and LLM-derived insights
 * from environment scan runs.
 */

import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  EnvironmentScan,
  TableDetail,
  TableHistorySummary,
  LineageEdge,
  TableHealthInsight,
  ColumnInfo,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Types for insight storage
// ---------------------------------------------------------------------------

export interface InsightRecord {
  insightType: string;
  tableFqn: string | null;
  payloadJson: string;
  severity: string;
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Save a complete environment scan with all related data in a single transaction.
 */
export async function saveEnvironmentScan(
  scan: EnvironmentScan,
  details: TableDetail[],
  histories: Array<TableHistorySummary & TableHealthInsight>,
  lineageEdges: LineageEdge[],
  insights: InsightRecord[],
  columns: ColumnInfo[] = []
): Promise<void> {
  // Build a per-table column lookup (lowercase FQN keys for case-insensitive matching)
  const columnsByTable = new Map<string, Array<{ name: string; type: string; nullable: boolean; comment: string | null }>>();
  for (const col of columns) {
    const key = col.tableFqn.toLowerCase();
    if (!columnsByTable.has(key)) columnsByTable.set(key, []);
    columnsByTable.get(key)!.push({
      name: col.columnName,
      type: col.dataType,
      nullable: col.isNullable,
      comment: col.comment,
    });
  }

  const BATCH_SIZE = 500;

  try {
    await withPrisma(async (prisma) => {
      await prisma.$transaction(async (tx) => {
        // 1. Upsert the scan record
        await tx.forgeEnvironmentScan.upsert({
          where: { scanId: scan.scanId },
          create: {
            scanId: scan.scanId,
            runId: scan.runId,
            ucPath: scan.ucPath,
            tableCount: scan.tableCount,
            totalSizeBytes: BigInt(scan.totalSizeBytes),
            totalFiles: scan.totalFiles,
            totalRows: BigInt(scan.totalRows),
            tablesWithStreaming: scan.tablesWithStreaming,
            tablesWithCDF: scan.tablesWithCDF,
            tablesNeedingOptimize: scan.tablesNeedingOptimize,
            tablesNeedingVacuum: scan.tablesNeedingVacuum,
            lineageDiscoveredCount: scan.lineageDiscoveredCount,
            domainCount: scan.domainCount,
            piiTablesCount: scan.piiTablesCount,
            redundancyPairsCount: scan.redundancyPairsCount,
            dataProductCount: scan.dataProductCount,
            avgGovernanceScore: scan.avgGovernanceScore,
            scanDurationMs: scan.scanDurationMs,
            scanSummaryJson: null,
            passResultsJson: JSON.stringify(scan.passResults),
          },
          update: {},
        });

        // Build a lookup for health scores from histories
        const healthScoreMap = new Map<string, number>();
        for (const h of histories) {
          healthScoreMap.set(h.tableFqn, h.healthScore);
        }

        // 2. Insert table details (batched)
        for (let i = 0; i < details.length; i += BATCH_SIZE) {
          await tx.forgeTableDetail.createMany({
            data: details.slice(i, i + BATCH_SIZE).map((d) => ({
              scanId: scan.scanId,
              tableFqn: d.fqn,
              catalog: d.catalog,
              schema: d.schema,
              tableName: d.tableName,
              tableType: d.tableType,
              comment: d.comment,
              generatedDescription: d.generatedDescription,
              format: d.format,
              provider: d.provider,
              location: d.location,
              isManaged: d.isManaged,
              owner: d.owner,
              sizeInBytes: d.sizeInBytes != null ? BigInt(d.sizeInBytes) : null,
              numFiles: d.numFiles,
              numRows: d.numRows != null ? BigInt(d.numRows) : null,
              partitionColumns: JSON.stringify(d.partitionColumns),
              clusteringColumns: JSON.stringify(d.clusteringColumns),
              deltaMinReaderVersion: d.deltaMinReaderVersion,
              deltaMinWriterVersion: d.deltaMinWriterVersion,
              cdfEnabled: d.tableProperties["delta.enableChangeDataFeed"] === "true",
              autoOptimize: d.tableProperties["delta.autoOptimize.optimizeWrite"] === "true",
              tableCreatedAt: d.createdAt,
              lastModified: d.lastModified,
              createdBy: d.createdBy,
              lastAccess: d.lastAccess,
              isManagedLocation: d.isManagedLocation,
              columnsJson: JSON.stringify(columnsByTable.get(d.fqn.toLowerCase()) ?? []),
              propertiesJson: JSON.stringify(d.tableProperties),
              tagsJson: null,
              columnTagsJson: null,
              dataDomain: d.dataDomain,
              dataSubdomain: d.dataSubdomain,
              dataTier: d.dataTier,
              sensitivityLevel: d.sensitivityLevel,
              governancePriority: d.governancePriority,
              governanceScore: healthScoreMap.get(d.fqn) ?? null,
              discoveredVia: d.discoveredVia,
            })),
            skipDuplicates: true,
          });
        }

        // 3. Insert history summaries (batched)
        for (let i = 0; i < histories.length; i += BATCH_SIZE) {
          await tx.forgeTableHistorySummary.createMany({
            data: histories.slice(i, i + BATCH_SIZE).map((h) => ({
              scanId: scan.scanId,
              tableFqn: h.tableFqn,
              lastWriteTimestamp: h.lastWriteTimestamp,
              lastWriteOperation: h.lastWriteOperation,
              lastWriteRows: h.lastWriteRows != null ? BigInt(h.lastWriteRows) : null,
              lastWriteBytes: h.lastWriteBytes != null ? BigInt(h.lastWriteBytes) : null,
              totalWriteOps: h.totalWriteOps,
              totalStreamingOps: h.totalStreamingOps,
              totalOptimizeOps: h.totalOptimizeOps,
              totalVacuumOps: h.totalVacuumOps,
              totalMergeOps: h.totalMergeOps,
              lastOptimizeTimestamp: h.lastOptimizeTimestamp,
              lastVacuumTimestamp: h.lastVacuumTimestamp,
              hasStreamingWrites: h.hasStreamingWrites,
              historyDays: h.historyDays,
              topOperationsJson: JSON.stringify(h.topOperations),
              healthScore: h.healthScore,
              issuesJson: JSON.stringify(h.issues),
              recommendationsJson: JSON.stringify(h.recommendations),
            })),
            skipDuplicates: true,
          });
        }

        // 4. Insert lineage edges (batched)
        for (let i = 0; i < lineageEdges.length; i += BATCH_SIZE) {
          await tx.forgeTableLineage.createMany({
            data: lineageEdges.slice(i, i + BATCH_SIZE).map((e) => ({
              scanId: scan.scanId,
              sourceTableFqn: e.sourceTableFqn,
              targetTableFqn: e.targetTableFqn,
              sourceType: e.sourceType,
              targetType: e.targetType,
              entityType: e.entityType,
              lastEventTime: e.lastEventTime,
              eventCount: e.eventCount,
            })),
            skipDuplicates: true,
          });
        }

        // 5. Insert insights (batched)
        for (let i = 0; i < insights.length; i += BATCH_SIZE) {
          await tx.forgeTableInsight.createMany({
            data: insights.slice(i, i + BATCH_SIZE).map((ins) => ({
              scanId: scan.scanId,
              insightType: ins.insightType,
              tableFqn: ins.tableFqn,
              payloadJson: ins.payloadJson,
              severity: ins.severity,
            })),
            skipDuplicates: true,
          });
        }
      }, {
        maxWait: 10_000,
        timeout: 120_000,
      });
    });

    logger.info("[environment-scans] Saved scan", {
      scanId: scan.scanId,
      tables: details.length,
      histories: histories.length,
      lineageEdges: lineageEdges.length,
      insights: insights.length,
    });
  } catch (error) {
    logger.error("[environment-scans] Failed to save scan", {
      scanId: scan.scanId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Get a full environment scan with all related data.
 */
export async function getEnvironmentScan(scanId: string) {
  return withPrisma(async (prisma) => {
    return prisma.forgeEnvironmentScan.findUnique({
      where: { scanId },
      include: {
        details: true,
        histories: true,
        lineage: true,
        insights: true,
      },
    });
  });
}

/**
 * Get environment scan linked to a pipeline run.
 */
export async function getEnvironmentScanByRunId(runId: string) {
  return withPrisma(async (prisma) => {
    return prisma.forgeEnvironmentScan.findFirst({
      where: { runId },
      include: {
        details: true,
        histories: true,
        lineage: true,
        insights: true,
      },
      orderBy: { createdAt: "desc" },
    });
  });
}

/**
 * Find the best available scan for a run: first by run linkage, then by matching ucPath.
 * Returns just the scanId or null.
 */
export async function getLatestScanIdForRun(
  runId: string,
  ucPath?: string
): Promise<string | null> {
  return withPrisma(async (prisma) => {
    const linked = await prisma.forgeEnvironmentScan.findFirst({
      where: { runId },
      select: { scanId: true },
      orderBy: { createdAt: "desc" },
    });
    if (linked) return linked.scanId;

    if (ucPath) {
      const byPath = await prisma.forgeEnvironmentScan.findFirst({
        where: { ucPath },
        select: { scanId: true },
        orderBy: { createdAt: "desc" },
      });
      if (byPath) return byPath.scanId;
    }

    return null;
  });
}

/**
 * List recent environment scans (summary only, no related data).
 */
export async function listEnvironmentScans(limit = 20, offset = 0) {
  return withPrisma(async (prisma) => {
    return prisma.forgeEnvironmentScan.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
    });
  });
}

// ---------------------------------------------------------------------------
// Aggregate Estate View
// ---------------------------------------------------------------------------

export interface AggregateEstateView {
  details: Array<Record<string, unknown>>;
  histories: Array<Record<string, unknown>>;
  lineage: Array<Record<string, unknown>>;
  insights: Array<Record<string, unknown>>;
  stats: {
    totalTables: number;
    totalScans: number;
    totalSizeBytes: string;
    totalRows: string;
    domainCount: number;
    piiTablesCount: number;
    avgGovernanceScore: number;
    oldestScanAt: string | null;
    newestScanAt: string | null;
    coverageByScope: Array<{
      ucPath: string;
      scanId: string;
      runId: string | null;
      tableCount: number;
      scannedAt: string;
    }>;
  };
}

/**
 * Build an aggregate estate view by merging the latest data per table
 * across all environment scans (pipeline runs + standalone).
 *
 * Strategy: for each unique tableFqn, keep the record from the most
 * recent scan (by createdAt). Same for histories, lineage edges, and insights.
 */
export async function getAggregateEstateView(): Promise<AggregateEstateView> {
  return withPrisma(async (prisma) => {

  const scans = await prisma.forgeEnvironmentScan.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      scanId: true,
      runId: true,
      ucPath: true,
      tableCount: true,
      createdAt: true,
    },
  });

  if (scans.length === 0) {
    return {
      details: [],
      histories: [],
      lineage: [],
      insights: [],
      stats: {
        totalTables: 0,
        totalScans: 0,
        totalSizeBytes: "0",
        totalRows: "0",
        domainCount: 0,
        piiTablesCount: 0,
        avgGovernanceScore: 0,
        oldestScanAt: null,
        newestScanAt: null,
        coverageByScope: [],
      },
    };
  }

  // Fetch all details with their scan's createdAt for ordering
  const allDetails = await prisma.forgeTableDetail.findMany({
    include: { scan: { select: { createdAt: true } } },
    orderBy: { scan: { createdAt: "desc" } },
  });

  // Deduplicate: keep latest per tableFqn
  const detailMap = new Map<string, typeof allDetails[number]>();
  for (const d of allDetails) {
    if (!detailMap.has(d.tableFqn)) {
      detailMap.set(d.tableFqn, d);
    }
  }
  const mergedDetails = Array.from(detailMap.values());

  // Histories: latest per tableFqn
  const allHistories = await prisma.forgeTableHistorySummary.findMany({
    include: { scan: { select: { createdAt: true } } },
    orderBy: { scan: { createdAt: "desc" } },
  });
  const historyMap = new Map<string, typeof allHistories[number]>();
  for (const h of allHistories) {
    if (!historyMap.has(h.tableFqn)) {
      historyMap.set(h.tableFqn, h);
    }
  }
  const mergedHistories = Array.from(historyMap.values());

  // Lineage: deduplicate by (source, target), keep latest
  const allLineage = await prisma.forgeTableLineage.findMany({
    include: { scan: { select: { createdAt: true } } },
    orderBy: { scan: { createdAt: "desc" } },
  });
  const lineageMap = new Map<string, typeof allLineage[number]>();
  for (const l of allLineage) {
    const key = `${l.sourceTableFqn}::${l.targetTableFqn}`;
    if (!lineageMap.has(key)) {
      lineageMap.set(key, l);
    }
  }
  const mergedLineage = Array.from(lineageMap.values());

  // Insights: deduplicate by (insightType, tableFqn), keep latest
  const allInsights = await prisma.forgeTableInsight.findMany({
    include: { scan: { select: { createdAt: true } } },
    orderBy: { scan: { createdAt: "desc" } },
  });
  const insightMap = new Map<string, typeof allInsights[number]>();
  for (const i of allInsights) {
    const key = `${i.insightType}::${i.tableFqn ?? "null"}`;
    if (!insightMap.has(key)) {
      insightMap.set(key, i);
    }
  }
  const mergedInsights = Array.from(insightMap.values());

  // Compute aggregate stats
  const domains = new Set(mergedDetails.map((d) => d.dataDomain).filter(Boolean));
  const piiCount = mergedDetails.filter(
    (d) => d.sensitivityLevel === "confidential" || d.sensitivityLevel === "restricted"
  ).length;
  const govScores = mergedDetails.filter((d) => d.governanceScore != null).map((d) => d.governanceScore!);
  const avgGov = govScores.length > 0 ? govScores.reduce((a, b) => a + b, 0) / govScores.length : 0;
  const totalSize = mergedDetails.reduce((sum, d) => sum + (d.sizeInBytes ?? BigInt(0)), BigInt(0));
  const totalRows = mergedDetails.reduce((sum, d) => sum + (d.numRows ?? BigInt(0)), BigInt(0));

  // Coverage: which scans contributed
  const coverageByScope = scans.map((s) => ({
    ucPath: s.ucPath,
    scanId: s.scanId,
    runId: s.runId,
    tableCount: s.tableCount,
    scannedAt: s.createdAt.toISOString(),
  }));

  // Serialize — strip the `scan` relation from each record for JSON
  const serializeDetail = (d: typeof mergedDetails[number]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scan, sizeInBytes, numRows, ...rest } = d;
    return {
      ...rest,
      sizeInBytes: sizeInBytes?.toString() ?? null,
      numRows: numRows?.toString() ?? null,
    };
  };
  const serializeHistory = (h: typeof mergedHistories[number]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scan, lastWriteRows, lastWriteBytes, ...rest } = h;
    return {
      ...rest,
      lastWriteRows: lastWriteRows?.toString() ?? null,
      lastWriteBytes: lastWriteBytes?.toString() ?? null,
    };
  };
  const serializeLineage = (l: typeof mergedLineage[number]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scan, ...rest } = l;
    return rest;
  };
  const serializeInsight = (i: typeof mergedInsights[number]) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { scan, ...rest } = i;
    return rest;
  };

  return {
    details: mergedDetails.map(serializeDetail),
    histories: mergedHistories.map(serializeHistory),
    lineage: mergedLineage.map(serializeLineage),
    insights: mergedInsights.map(serializeInsight),
    stats: {
      totalTables: mergedDetails.length,
      totalScans: scans.length,
      totalSizeBytes: totalSize.toString(),
      totalRows: totalRows.toString(),
      domainCount: domains.size,
      piiTablesCount: piiCount,
      avgGovernanceScore: avgGov,
      oldestScanAt: scans.length > 0 ? scans[scans.length - 1].createdAt.toISOString() : null,
      newestScanAt: scans.length > 0 ? scans[0].createdAt.toISOString() : null,
      coverageByScope,
    },
  };
  });
}

/**
 * Get insights for a scan, optionally filtered by type.
 */
export async function getInsightsByScanId(
  scanId: string,
  insightType?: string
) {
  return withPrisma(async (prisma) => {
    return prisma.forgeTableInsight.findMany({
      where: {
        scanId,
        ...(insightType ? { insightType } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
  });
}

// ---------------------------------------------------------------------------
// Aggregate Estate — Excel-ready (preserves bigints for the Excel generator)
// ---------------------------------------------------------------------------

import type { ScanWithRelations } from "@/lib/export/environment-excel";

/**
 * Build an aggregate estate view suitable for the Excel export generator.
 *
 * Same merge logic as `getAggregateEstateView()` but returns data in the
 * `ScanWithRelations` shape with bigints intact (no JSON serialisation).
 * Returns null when no scans exist.
 */
export async function getAggregateForExcel(): Promise<ScanWithRelations | null> {
  return withPrisma(async (prisma) => {
    const scans = await prisma.forgeEnvironmentScan.findMany({
      orderBy: { createdAt: "desc" },
    });

    if (scans.length === 0) return null;

    // --- Details: latest per tableFqn ---
    const allDetails = await prisma.forgeTableDetail.findMany({
      include: { scan: { select: { createdAt: true } } },
      orderBy: { scan: { createdAt: "desc" } },
    });
    const detailMap = new Map<string, typeof allDetails[number]>();
    for (const d of allDetails) {
      if (!detailMap.has(d.tableFqn)) detailMap.set(d.tableFqn, d);
    }
    const details = Array.from(detailMap.values());

    // --- Histories: latest per tableFqn ---
    const allHistories = await prisma.forgeTableHistorySummary.findMany({
      include: { scan: { select: { createdAt: true } } },
      orderBy: { scan: { createdAt: "desc" } },
    });
    const historyMap = new Map<string, typeof allHistories[number]>();
    for (const h of allHistories) {
      if (!historyMap.has(h.tableFqn)) historyMap.set(h.tableFqn, h);
    }
    const histories = Array.from(historyMap.values());

    // --- Lineage: latest per (source, target) ---
    const allLineage = await prisma.forgeTableLineage.findMany({
      include: { scan: { select: { createdAt: true } } },
      orderBy: { scan: { createdAt: "desc" } },
    });
    const lineageMap = new Map<string, typeof allLineage[number]>();
    for (const l of allLineage) {
      const key = `${l.sourceTableFqn}::${l.targetTableFqn}`;
      if (!lineageMap.has(key)) lineageMap.set(key, l);
    }
    const lineage = Array.from(lineageMap.values());

    // --- Insights: latest per (insightType, tableFqn) ---
    const allInsights = await prisma.forgeTableInsight.findMany({
      include: { scan: { select: { createdAt: true } } },
      orderBy: { scan: { createdAt: "desc" } },
    });
    const insightMap = new Map<string, typeof allInsights[number]>();
    for (const i of allInsights) {
      const key = `${i.insightType}::${i.tableFqn ?? "null"}`;
      if (!insightMap.has(key)) insightMap.set(key, i);
    }
    const insights = Array.from(insightMap.values());

    // --- Aggregate scan-level stats ---
    const domains = new Set(details.map((d) => d.dataDomain).filter(Boolean));
    const piiCount = details.filter(
      (d) => d.sensitivityLevel === "confidential" || d.sensitivityLevel === "restricted"
    ).length;
    const govScores = details.filter((d) => d.governanceScore != null).map((d) => d.governanceScore!);
    const avgGov = govScores.length > 0 ? govScores.reduce((a, b) => a + b, 0) / govScores.length : 0;
    const totalSize = details.reduce((sum, d) => sum + (d.sizeInBytes ?? BigInt(0)), BigInt(0));
    const totalFiles = details.reduce((sum, d) => sum + (d.numFiles ?? 0), 0);
    const redundancyCount = insights.filter((i) => i.insightType === "redundancy").length;
    const dataProductCount = insights.filter((i) => i.insightType === "data_product").length;
    const lineageDiscovered = details.filter((d) => d.discoveredVia === "lineage").length;
    const streamingCount = histories.filter((h) => h.hasStreamingWrites).length;
    const cdfCount = details.filter((d) => d.cdfEnabled).length;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const needsOptimize = histories.filter(
      (h) => !h.lastOptimizeTimestamp || h.lastOptimizeTimestamp < thirtyDaysAgo
    ).length;
    const needsVacuum = histories.filter(
      (h) => !h.lastVacuumTimestamp || h.lastVacuumTimestamp < thirtyDaysAgo
    ).length;

    const ucPaths = [...new Set(scans.map((s) => s.ucPath))].join(", ");

    return {
      scanId: "aggregate",
      ucPath: ucPaths || "All Scans (Aggregate)",
      tableCount: details.length,
      totalSizeBytes: totalSize,
      totalFiles,
      tablesWithStreaming: streamingCount,
      tablesWithCDF: cdfCount,
      tablesNeedingOptimize: needsOptimize,
      tablesNeedingVacuum: needsVacuum,
      lineageDiscoveredCount: lineageDiscovered,
      domainCount: domains.size,
      piiTablesCount: piiCount,
      redundancyPairsCount: redundancyCount,
      dataProductCount,
      avgGovernanceScore: avgGov,
      scanDurationMs: null,
      passResultsJson: null,
      createdAt: scans[0].createdAt,
      details,
      histories,
      lineage,
      insights,
    };
  });
}

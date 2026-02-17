/**
 * CRUD operations for environment scans — backed by Lakebase (Prisma).
 *
 * Stores enriched metadata, lineage edges, and LLM-derived insights
 * from environment scan runs.
 */

import { getPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  EnvironmentScan,
  TableDetail,
  TableHistorySummary,
  LineageEdge,
  TableHealthInsight,
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
  insights: InsightRecord[]
): Promise<void> {
  const prisma = await getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Upsert the scan record
      await tx.inspireEnvironmentScan.upsert({
        where: { scanId: scan.scanId },
        create: {
          scanId: scan.scanId,
          runId: scan.runId,
          ucPath: scan.ucPath,
          tableCount: scan.tableCount,
          totalSizeBytes: BigInt(scan.totalSizeBytes),
          totalFiles: scan.totalFiles,
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

      // 2. Insert table details
      if (details.length > 0) {
        await tx.inspireTableDetail.createMany({
          data: details.map((d) => ({
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
            partitionColumns: JSON.stringify(d.partitionColumns),
            clusteringColumns: JSON.stringify(d.clusteringColumns),
            deltaMinReaderVersion: d.deltaMinReaderVersion,
            deltaMinWriterVersion: d.deltaMinWriterVersion,
            cdfEnabled: d.tableProperties["delta.enableChangeDataFeed"] === "true",
            autoOptimize: d.tableProperties["delta.autoOptimize.optimizeWrite"] === "true",
            tableCreatedAt: d.createdAt,
            lastModified: d.lastModified,
            propertiesJson: JSON.stringify(d.tableProperties),
            tagsJson: null,
            columnTagsJson: null,
            dataDomain: d.dataDomain,
            dataSubdomain: d.dataSubdomain,
            dataTier: d.dataTier,
            sensitivityLevel: d.sensitivityLevel,
            governancePriority: d.governancePriority,
            governanceScore: null,
            discoveredVia: d.discoveredVia,
          })),
          skipDuplicates: true,
        });
      }

      // 3. Insert history summaries
      if (histories.length > 0) {
        await tx.inspireTableHistorySummary.createMany({
          data: histories.map((h) => ({
            scanId: scan.scanId,
            tableFqn: h.tableFqn,
            lastWriteTimestamp: h.lastWriteTimestamp,
            lastWriteOperation: h.lastWriteOperation,
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

      // 4. Insert lineage edges
      if (lineageEdges.length > 0) {
        await tx.inspireTableLineage.createMany({
          data: lineageEdges.map((e) => ({
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

      // 5. Insert insights
      if (insights.length > 0) {
        await tx.inspireTableInsight.createMany({
          data: insights.map((i) => ({
            scanId: scan.scanId,
            insightType: i.insightType,
            tableFqn: i.tableFqn,
            payloadJson: i.payloadJson,
            severity: i.severity,
          })),
          skipDuplicates: true,
        });
      }
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
  const prisma = await getPrisma();
  return prisma.inspireEnvironmentScan.findUnique({
    where: { scanId },
    include: {
      details: true,
      histories: true,
      lineage: true,
      insights: true,
    },
  });
}

/**
 * Get environment scan linked to a pipeline run.
 */
export async function getEnvironmentScanByRunId(runId: string) {
  const prisma = await getPrisma();
  return prisma.inspireEnvironmentScan.findFirst({
    where: { runId },
    include: {
      details: true,
      histories: true,
      lineage: true,
      insights: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * List recent environment scans (summary only, no related data).
 */
export async function listEnvironmentScans(limit = 20, offset = 0) {
  const prisma = await getPrisma();
  return prisma.inspireEnvironmentScan.findMany({
    take: limit,
    skip: offset,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get insights for a scan, optionally filtered by type.
 */
export async function getInsightsByScanId(
  scanId: string,
  insightType?: string
) {
  const prisma = await getPrisma();
  return prisma.inspireTableInsight.findMany({
    where: {
      scanId,
      ...(insightType ? { insightType } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

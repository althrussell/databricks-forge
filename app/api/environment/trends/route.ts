/**
 * API: /api/environment/trends
 *
 * GET -- returns scan-over-scan trend analysis comparing the two most recent scans.
 */

import { NextResponse } from "next/server";
import { withPrisma } from "@/lib/prisma";
import { computeScanTrends, type ScanSnapshot } from "@/lib/domain/scan-trends";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const data = await withPrisma(async (prisma) => {
      const scans = await prisma.forgeEnvironmentScan.findMany({
        orderBy: { createdAt: "desc" },
        take: 2,
        include: {
          details: { select: { tableFqn: true } },
        },
      });

      if (scans.length < 2) {
        return { hasTrends: false as const, message: "Need at least 2 scans for trend analysis" };
      }

      const [currentScan, previousScan] = scans;

      function toSnapshot(scan: typeof currentScan): ScanSnapshot {
        return {
          scanId: scan.scanId,
          createdAt: scan.createdAt.toISOString(),
          ucPath: scan.ucPath,
          tableCount: scan.tableCount,
          totalSizeBytes: Number(scan.totalSizeBytes),
          totalRows: Number(scan.totalRows),
          domainCount: scan.domainCount,
          avgGovernanceScore: scan.avgGovernanceScore,
          piiTablesCount: scan.piiTablesCount,
          redundancyPairsCount: scan.redundancyPairsCount,
          dataProductCount: scan.dataProductCount,
          tablesWithStreaming: scan.tablesWithStreaming,
          tablesWithCDF: scan.tablesWithCDF,
          tablesNeedingOptimize: scan.tablesNeedingOptimize,
          tablesNeedingVacuum: scan.tablesNeedingVacuum,
          tableFqns: scan.details.map((d) => d.tableFqn),
        };
      }

      const trends = computeScanTrends(
        toSnapshot(previousScan),
        toSnapshot(currentScan)
      );

      return { hasTrends: true as const, trends };
    });

    return NextResponse.json(data);
  } catch (error) {
    logger.error("[api/environment/trends] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to compute trends" },
      { status: 500 }
    );
  }
}

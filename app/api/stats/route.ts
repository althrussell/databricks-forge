/**
 * API: /api/stats
 *
 * GET -- aggregate stats across all runs and use cases for the dashboard.
 */

import { NextResponse } from "next/server";
import { isDatabaseReady, withPrisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    if (!isDatabaseReady()) {
      return NextResponse.json(
        { error: "Database is warming up. Please retry shortly." },
        { status: 503, headers: { "Retry-After": "3" } }
      );
    }

    await ensureMigrated();

    // Sequential batches instead of 10-way Promise.all.
    // Uses 2-3 pool connections at a time, avoiding Lakebase rate limits.
    const result = await withPrisma(async (prisma) => {
      // Batch 1: Run data
      const [runStatusGroups, recentRuns] = await Promise.all([
        prisma.forgeRun.groupBy({
          by: ["status"],
          _count: { _all: true },
        }),
        prisma.forgeRun.findMany({
          orderBy: { createdAt: "desc" },
          take: 5,
          select: {
            runId: true,
            businessName: true,
            status: true,
            progressPct: true,
            createdAt: true,
            completedAt: true,
            _count: { select: { useCases: true } },
          },
        }),
      ]);

      // Batch 2: Use case data
      const [typeGroups, domainGroups, scoreRows] = await Promise.all([
        prisma.forgeUseCase.groupBy({
          by: ["type"],
          _count: { _all: true },
        }),
        prisma.forgeUseCase.groupBy({
          by: ["domain"],
          _count: { _all: true },
          orderBy: { _count: { domain: "desc" } },
        }),
        prisma.forgeUseCase.findMany({
          select: { overallScore: true },
          where: { overallScore: { not: null } },
        }),
      ]);

      const statusLookup = new Map(
        runStatusGroups.map((g) => [g.status, g._count._all])
      );
      const completedRuns = statusLookup.get("completed") ?? 0;
      const failedRuns = statusLookup.get("failed") ?? 0;
      const runningRuns =
        (statusLookup.get("running") ?? 0) + (statusLookup.get("pending") ?? 0);
      const totalRuns = runStatusGroups.reduce((sum, g) => sum + g._count._all, 0);

      const typeLookup = new Map(
        typeGroups.map((g) => [g.type, g._count._all])
      );
      const aiCount = typeLookup.get("AI") ?? 0;
      const statisticalCount = typeLookup.get("Statistical") ?? 0;
      const geospatialCount = typeLookup.get("Geospatial") ?? 0;
      const totalUseCases = typeGroups.reduce((sum, g) => sum + g._count._all, 0);

      const scores = scoreRows.map((r) => r.overallScore!);
      const avgScore =
        scores.length > 0
          ? Math.round(
              (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
            )
          : 0;

      const domainBreakdown = domainGroups.map((g) => ({
        domain: g.domain ?? "Unknown",
        count: g._count._all,
      }));

      const recent = recentRuns.map((r) => ({
        runId: r.runId,
        businessName: r.businessName,
        status: r.status,
        progressPct: r.progressPct,
        useCaseCount: r._count.useCases,
        createdAt: r.createdAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
      }));

      return {
        totalRuns,
        completedRuns,
        failedRuns,
        runningRuns,
        totalUseCases,
        aiCount,
        statisticalCount,
        geospatialCount,
        avgScore,
        totalDomains: domainBreakdown.length,
        domainBreakdown,
        scores,
        recentRuns: recent,
      };
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/stats] GET failed", { error: msg });
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}

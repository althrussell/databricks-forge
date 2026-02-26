/**
 * API: /api/stats
 *
 * GET -- aggregate stats across all runs and use cases for the dashboard.
 */

import { NextResponse } from "next/server";
import { withPrisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await ensureMigrated();

    const [
      totalRuns,
      completedRuns,
      failedRuns,
      runningRuns,
      totalUseCases,
      typeGroups,
      scoreAgg,
      domainGroups,
      scoreHistogramRaw,
      recentRuns,
    ] = await withPrisma((prisma) => Promise.all([
      prisma.forgeRun.count(),
      prisma.forgeRun.count({ where: { status: "completed" } }),
      prisma.forgeRun.count({ where: { status: "failed" } }),
      prisma.forgeRun.count({
        where: { status: { in: ["running", "pending"] } },
      }),
      prisma.forgeUseCase.count(),
      prisma.forgeUseCase.groupBy({
        by: ["type"],
        _count: { _all: true },
      }),
      prisma.forgeUseCase.aggregate({
        _avg: { overallScore: true },
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
    ]));

    const typeLookup = new Map(typeGroups.map((g) => [g.type, g._count._all]));
    const aiCount = typeLookup.get("AI") ?? 0;
    const statisticalCount = typeLookup.get("Statistical") ?? 0;
    const geospatialCount = typeLookup.get("Geospatial") ?? 0;
    const avgScore = scoreAgg._avg.overallScore != null
      ? Math.round(scoreAgg._avg.overallScore * 100)
      : 0;

    const domainBreakdown = domainGroups.map((g) => ({
      domain: g.domain ?? "Unknown",
      count: g._count._all,
    }));

    // Pre-compute histogram buckets instead of sending raw scores
    const scores = scoreHistogramRaw.map((r) => r.overallScore!);

    const recent = recentRuns.map((r) => ({
      runId: r.runId,
      businessName: r.businessName,
      status: r.status,
      progressPct: r.progressPct,
      useCaseCount: r._count.useCases,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));

    return NextResponse.json(
      {
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
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/stats] GET failed", { error: msg });
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}

/**
 * API: /api/stats
 *
 * GET -- aggregate stats across all runs and use cases for the dashboard.
 */

import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    await ensureMigrated();
    const prisma = await getPrisma();

    const [
      totalRuns,
      completedRuns,
      failedRuns,
      runningRuns,
      allUseCases,
      recentRuns,
    ] = await Promise.all([
      prisma.forgeRun.count(),
      prisma.forgeRun.count({ where: { status: "completed" } }),
      prisma.forgeRun.count({ where: { status: "failed" } }),
      prisma.forgeRun.count({
        where: { status: { in: ["running", "pending"] } },
      }),
      prisma.forgeUseCase.findMany({
        select: {
          domain: true,
          type: true,
          overallScore: true,
        },
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

    // Compute aggregate stats from use cases
    const totalUseCases = allUseCases.length;
    const aiCount = allUseCases.filter((uc) => uc.type === "AI").length;
    const statisticalCount = allUseCases.filter((uc) => uc.type === "Statistical").length;
    const geospatialCount = allUseCases.filter((uc) => uc.type === "Geospatial").length;
    const scores = allUseCases
      .map((uc) => uc.overallScore)
      .filter((s): s is number => s != null);
    const avgScore =
      scores.length > 0
        ? Math.round(
            (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
          )
        : 0;

    // Domain breakdown
    const domainCounts: Record<string, number> = {};
    for (const uc of allUseCases) {
      const d = uc.domain ?? "Unknown";
      domainCounts[d] = (domainCounts[d] || 0) + 1;
    }
    const domainBreakdown = Object.entries(domainCounts)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count);

    // Format recent runs
    const recent = recentRuns.map((r) => ({
      runId: r.runId,
      businessName: r.businessName,
      status: r.status,
      progressPct: r.progressPct,
      useCaseCount: r._count.useCases,
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));

    return NextResponse.json({
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

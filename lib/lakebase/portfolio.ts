/**
 * Portfolio data aggregation for the Business Value dashboard.
 */

import { withPrisma } from "@/lib/prisma";
import type {
  BusinessValuePortfolio,
  ExecutiveSynthesis,
  TrackingStage,
  RoadmapPhase,
} from "@/lib/domain/types";

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getPortfolioData(): Promise<BusinessValuePortfolio> {
  return withPrisma(async (prisma) => {
    const latestRun = await prisma.forgeRun.findFirst({
      where: { status: "completed", synthesisJson: { not: null } },
      orderBy: { completedAt: "desc" },
      select: { runId: true, synthesisJson: true },
    });

    const totalUseCases = await prisma.forgeUseCase.count();

    const valueAgg = await prisma.forgeValueEstimate.aggregate({
      _sum: { valueLow: true, valueMid: true, valueHigh: true },
    });

    const stageGroups = await prisma.forgeUseCaseTracking.groupBy({
      by: ["stage"],
      _count: { _all: true },
    });
    const byStage: Record<TrackingStage, number> = {
      discovered: 0,
      planned: 0,
      in_progress: 0,
      delivered: 0,
      measured: 0,
    };
    for (const g of stageGroups) {
      byStage[g.stage as TrackingStage] = g._count._all;
    }

    const phaseGroups = await prisma.forgeRoadmapPhase.groupBy({
      by: ["phase"],
      _count: { _all: true },
    });
    const byPhase: Record<RoadmapPhase, { count: number; valueMid: number }> = {
      quick_wins: { count: 0, valueMid: 0 },
      foundation: { count: 0, valueMid: 0 },
      transformation: { count: 0, valueMid: 0 },
    };
    for (const g of phaseGroups) {
      const phase = g.phase as RoadmapPhase;
      if (byPhase[phase]) {
        byPhase[phase].count = g._count._all;
      }
    }

    const byDomain: BusinessValuePortfolio["byDomain"] = [];
    if (latestRun) {
      const domainGroups = await prisma.forgeUseCase.groupBy({
        by: ["domain"],
        where: { runId: latestRun.runId },
        _count: { _all: true },
        _avg: { feasibilityScore: true, overallScore: true },
      });
      for (const g of domainGroups) {
        if (g.domain) {
          byDomain.push({
            domain: g.domain,
            useCaseCount: g._count._all,
            valueMid: 0,
            avgFeasibility: g._avg.feasibilityScore ?? 0,
            avgScore: g._avg.overallScore ?? 0,
          });
        }
      }
    }

    const deliveredAgg = await prisma.forgeValueCapture.aggregate({
      _sum: { amount: true },
    });

    const synthesis = safeParse<ExecutiveSynthesis>(
      latestRun?.synthesisJson ?? null,
      null as unknown as ExecutiveSynthesis,
    );

    return {
      totalUseCases,
      totalEstimatedValue: {
        low: valueAgg._sum.valueLow ?? 0,
        mid: valueAgg._sum.valueMid ?? 0,
        high: valueAgg._sum.valueHigh ?? 0,
        currency: "USD",
      },
      byStage,
      byPhase,
      byDomain,
      deliveredValue: deliveredAgg._sum.amount ?? 0,
      latestSynthesis: synthesis,
    };
  });
}

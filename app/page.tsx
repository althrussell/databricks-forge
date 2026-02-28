import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { DashboardContent, type DashboardStats } from "@/components/dashboard/dashboard-content";
import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

async function fetchDashboardStats(): Promise<{
  stats: DashboardStats | null;
  error: string | null;
}> {
  try {
    // Sequential queries instead of 10-way Promise.all.
    // Uses 1-2 pool connections at a time instead of 10, avoiding
    // Lakebase connection rate limits on cold start.
    const stats = await withPrisma(async (prisma) => {
      // ---- Batch 1: Run data (above the fold — KPI cards + recent runs) ----
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

      // ---- Batch 2: Use case data (charts + KPI enrichment) ----
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

      // Derive all KPIs from the grouped/raw results
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

    return { stats, error: null };
  } catch (err) {
    logger.error("[dashboard] Failed to fetch stats", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { stats: null, error: "Failed to load dashboard stats" };
  }
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}

async function DashboardData() {
  const { stats, error } = await fetchDashboardStats();
  return <DashboardContent initialStats={stats} initialError={error} />;
}

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/databricks-icon.svg"
            alt="Databricks"
            width={36}
            height={38}
            className="shrink-0"
          />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Forge AI</h1>
            <p className="mt-1 text-muted-foreground">
              Transform your Unity Catalog metadata into actionable,
              AI-generated use cases.
            </p>
          </div>
        </div>
        <Button asChild>
          <Link href="/configure">
            <Plus className="mr-2 h-4 w-4" />
            New Discovery
          </Link>
        </Button>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </div>
  );
}

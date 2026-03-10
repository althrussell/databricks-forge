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
    const stats = await withPrisma(async (prisma) => {
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

      const [qualityRows, benchmarkRows] = await Promise.all([
        prisma.forgeQualityMetric.findMany({
          where: {
            createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
          },
          select: {
            metricType: true,
            metricName: true,
            metricValue: true,
            passed: true,
          },
        }),
        prisma.forgeBenchmarkRecord.findMany({
          where: { lifecycleStatus: "published" },
          select: { industry: true, publishedAt: true, ttlDays: true },
        }),
      ]);

      const statusLookup = new Map(runStatusGroups.map((g) => [g.status, g._count._all]));
      const completedRuns = statusLookup.get("completed") ?? 0;
      const failedRuns = statusLookup.get("failed") ?? 0;
      const runningRuns = (statusLookup.get("running") ?? 0) + (statusLookup.get("pending") ?? 0);
      const totalRuns = runStatusGroups.reduce((sum, g) => sum + g._count._all, 0);

      const typeLookup = new Map(typeGroups.map((g) => [g.type, g._count._all]));
      const aiCount = typeLookup.get("AI") ?? 0;
      const statisticalCount = typeLookup.get("Statistical") ?? 0;
      const geospatialCount = typeLookup.get("Geospatial") ?? 0;
      const totalUseCases = typeGroups.reduce((sum, g) => sum + g._count._all, 0);

      const scores = scoreRows.map((r) => r.overallScore!);
      const avgScore =
        scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
          : 0;

      const domainBreakdown = domainGroups.map((g) => ({
        domain: g.domain ?? "Unknown",
        count: g._count._all,
      }));

      const consultantRows = qualityRows.filter(
        (m) => m.metricType === "run" && m.metricName === "consultant_readiness",
      );
      const assistantRows = qualityRows.filter(
        (m) => m.metricType === "assistant" && m.metricName === "assistant_overall_score",
      );
      const avgConsultantReadiness =
        consultantRows.length > 0
          ? consultantRows.reduce((s, m) => s + m.metricValue, 0) / consultantRows.length
          : null;
      const avgAssistantScore =
        assistantRows.length > 0
          ? assistantRows.reduce((s, m) => s + m.metricValue, 0) / assistantRows.length
          : null;
      const releaseGatePassRate =
        consultantRows.length > 0
          ? consultantRows.filter((m) => m.passed === true).length / consultantRows.length
          : null;

      const now = Date.now();
      const freshBenchmarks = benchmarkRows.filter((r) => {
        const start = r.publishedAt ? r.publishedAt.getTime() : now;
        const expiry = start + r.ttlDays * 24 * 60 * 60 * 1000;
        return expiry >= now;
      });
      const benchmarkFreshnessRate =
        benchmarkRows.length > 0 ? freshBenchmarks.length / benchmarkRows.length : null;
      const benchmarkIndustryCoverage = new Set(
        benchmarkRows.map((r) => (r.industry ?? "").trim()).filter(Boolean),
      ).size;

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
        quality: {
          avgConsultantReadiness,
          avgAssistantScore,
          releaseGatePassRate,
          benchmarkFreshnessRate,
          benchmarkIndustryCoverage,
        },
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
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* KPI tiles */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      {/* Quick actions */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <Skeleton className="h-20 flex-1 rounded-xl" />
        <Skeleton className="h-20 flex-1 rounded-xl" />
        <Skeleton className="h-20 flex-1 rounded-xl" />
      </div>
      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
      {/* Recent runs + Activity */}
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-72 rounded-xl lg:col-span-3" />
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
      </div>
    </div>
  );
}

async function DashboardData() {
  const { stats, error } = await fetchDashboardStats();
  return <DashboardContent initialStats={stats} initialError={error} />;
}

function HeroBanner() {
  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-accent/30 dark:from-card dark:via-card dark:to-primary/5">
      {/* Geometric texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.04]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5L55 20V40L30 55L5 40V20L30 5Z' fill='none' stroke='%23FF3621' stroke-width='0.5'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 60px",
        }}
      />
      <div className="relative flex items-center justify-between gap-6 px-8 py-10 sm:px-10 sm:py-12">
        <div className="flex items-center gap-5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 shadow-sm ring-1 ring-primary/10">
            <Image
              src="/databricks-icon.svg"
              alt="Databricks"
              width={32}
              height={34}
              className="shrink-0"
            />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Forge AI</h1>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground sm:text-base">
              Transform Unity Catalog metadata into scored, actionable use cases.
            </p>
          </div>
        </div>
        <Button size="lg" className="hidden shrink-0 sm:inline-flex" asChild>
          <Link href="/configure">
            <Plus className="mr-2 h-4 w-4" />
            New Discovery
          </Link>
        </Button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <HeroBanner />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData />
      </Suspense>
    </div>
  );
}

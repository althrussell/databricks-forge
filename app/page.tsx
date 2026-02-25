"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { resilientFetch } from "@/lib/resilient-fetch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/ui/info-tip";
import { DASHBOARD } from "@/lib/help-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScoreDistributionChart } from "@/components/charts/score-distribution-chart";
import { DomainBreakdownChart } from "@/components/charts/domain-breakdown-chart";
import { TypeSplitChart } from "@/components/charts/type-split-chart";
import { ActivityFeedInline } from "@/components/pipeline/activity-feed";
import {
  BarChart3,
  BrainCircuit,
  Layers,
  Trophy,
  Activity,
  TrendingUp,
  Plus,
  ArrowRight,
} from "lucide-react";

interface DashboardStats {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  totalUseCases: number;
  aiCount: number;
  statisticalCount: number;
  geospatialCount: number;
  avgScore: number;
  totalDomains: number;
  domainBreakdown: { domain: string; count: number }[];
  scores: number[];
  recentRuns: {
    runId: string;
    businessName: string;
    status: string;
    progressPct: number;
    useCaseCount: number;
    createdAt: string;
    completedAt: string | null;
  }[];
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await resilientFetch("/api/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <TooltipProvider>
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
            <h1 className="text-3xl font-bold tracking-tight">
              Forge AI
            </h1>
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

      {loading ? (
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchStats}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : stats && stats.totalRuns === 0 ? (
        <EmptyDashboard />
      ) : stats ? (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-5">
            <KPICard
              icon={<Activity className="h-4 w-4 text-blue-500" />}
              label="Total Runs"
              tip={DASHBOARD.totalRuns}
              value={stats.totalRuns}
              detail={
                stats.runningRuns > 0
                  ? `${stats.runningRuns} active`
                  : `${stats.completedRuns} completed`
              }
            />
            <KPICard
              icon={<BrainCircuit className="h-4 w-4 text-violet-500" />}
              label="Use Cases"
              tip={DASHBOARD.useCases}
              value={stats.totalUseCases}
              detail={`${stats.aiCount} AI, ${stats.statisticalCount} Stat${stats.geospatialCount ? `, ${stats.geospatialCount} Geo` : ""}`}
            />
            <KPICard
              icon={<Trophy className="h-4 w-4 text-amber-500" />}
              label="Avg Score"
              tip={DASHBOARD.avgScore}
              value={`${stats.avgScore}%`}
              detail="Across all use cases"
            />
            <KPICard
              icon={<Layers className="h-4 w-4 text-teal-500" />}
              label="Domains"
              tip={DASHBOARD.domains}
              value={stats.totalDomains}
              detail="Unique business domains"
            />
            <KPICard
              icon={<TrendingUp className="h-4 w-4 text-green-500" />}
              label="Success Rate"
              tip={DASHBOARD.successRate}
              value={
                stats.totalRuns > 0
                  ? `${Math.round((stats.completedRuns / stats.totalRuns) * 100)}%`
                  : "N/A"
              }
              detail={
                stats.failedRuns > 0
                  ? `${stats.failedRuns} failed`
                  : "All runs successful"
              }
            />
          </div>

          {/* Charts Row */}
          {stats.totalUseCases > 0 && (
            <div className="grid gap-6 md:grid-cols-3">
              <ScoreDistributionChart scores={stats.scores} />
              <DomainBreakdownChart data={stats.domainBreakdown} />
              <TypeSplitChart
                aiCount={stats.aiCount}
                statisticalCount={stats.statisticalCount}
                geospatialCount={stats.geospatialCount}
              />
            </div>
          )}

          {/* Recent Runs & Activity */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <Tabs defaultValue="runs" className="w-full">
                <div className="flex items-center justify-between">
                  <TabsList>
                    <TabsTrigger value="runs">Recent Runs</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                  </TabsList>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/runs">
                      View All
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
                <TabsContent value="runs" className="mt-4">
                  {stats.recentRuns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No runs yet. Start a new discovery to see results here.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {stats.recentRuns.map((run) => (
                        <Link
                          key={run.runId}
                          href={`/runs/${run.runId}`}
                          className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-medium">{run.businessName}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(run.createdAt).toLocaleDateString(
                                  undefined,
                                  {
                                    month: "short",
                                    day: "numeric",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  }
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {run.status === "completed" && run.useCaseCount > 0 && (
                              <span className="text-sm text-muted-foreground">
                                {run.useCaseCount} use cases
                              </span>
                            )}
                            <Badge
                              variant="secondary"
                              className={STATUS_STYLES[run.status] ?? ""}
                            >
                              {run.status}
                            </Badge>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="activity" className="mt-4">
                  <ActivityFeedInline limit={10} />
                </TabsContent>
              </Tabs>
            </CardHeader>
          </Card>

          <p className="text-xs text-muted-foreground">
            Forge reads <strong>metadata only</strong> -- schema names,
            table names, and column names. No row-level data is accessed
            unless data sampling is explicitly enabled.
          </p>
        </>
      ) : null}
    </div>
    </TooltipProvider>
  );
}

function KPICard({
  icon,
  label,
  tip,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  tip?: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          {icon}
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            {tip && <InfoTip tip={tip} />}
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold">{value}</p>
        {detail && (
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyDashboard() {
  return (
    <div className="space-y-6">
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <BrainCircuit className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Welcome to Forge AI</h2>
          <p className="mt-2 max-w-md text-muted-foreground">
            Discover high-value data use cases from your Unity Catalog metadata.
            Start by configuring your business context and selecting your data
            sources.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/configure">
              <Plus className="mr-2 h-4 w-4" />
              Start Your First Discovery
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle className="text-base">1. Configure</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Set your business context, select catalogs and schemas, and choose
              analysis priorities.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
              <BrainCircuit className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            </div>
            <CardTitle className="text-base">2. Discover</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              AI analyses your metadata in 7 steps: context, filtering, use case
              generation, scoring, and SQL.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 dark:bg-green-900/30">
              <Trophy className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle className="text-base">3. Export</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Download results as Excel, PDF, PowerPoint, or deploy SQL
              notebooks directly to your workspace.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

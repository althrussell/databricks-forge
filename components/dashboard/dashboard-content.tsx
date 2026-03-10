"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { resilientFetch } from "@/lib/resilient-fetch";
import { InfoTip } from "@/components/ui/info-tip";
import { DASHBOARD } from "@/lib/help-text";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ScoreDistributionChart,
  DomainBreakdownChart,
  TypeSplitChart,
} from "@/components/charts/lazy";
import { ActivityFeedInline } from "@/components/pipeline/activity-feed";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { cn, formatCurrency } from "@/lib/utils";
import {
  BrainCircuit,
  Layers,
  Trophy,
  Activity,
  TrendingUp,
  Plus,
  ArrowRight,
  Sparkles,
  DollarSign,
} from "lucide-react";

export interface DashboardStats {
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
  quality?: {
    avgConsultantReadiness: number | null;
    avgAssistantScore: number | null;
    releaseGatePassRate: number | null;
    benchmarkFreshnessRate: number | null;
    benchmarkIndustryCoverage: number | null;
  };
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function BusinessValueSummary() {
  const [valueMid, setValueMid] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/business-value/portfolio")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setValueMid(data.totalEstimatedValue?.mid ?? null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  if (!loaded || valueMid === null || valueMid === 0) return null;

  return (
    <Link href="/business-value" className="group flex-1">
      <Card className="h-full hover:-translate-y-0.5 hover:shadow-md">
        <CardContent className="flex h-full items-center gap-4 pt-6">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-100 transition-colors group-hover:bg-green-200 dark:bg-green-900/30 dark:group-hover:bg-green-900/50">
            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <p className="font-semibold">Business Value</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(valueMid)} estimated</p>
          </div>
          <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
        </CardContent>
      </Card>
    </Link>
  );
}

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

export function DashboardContent({
  initialStats,
  initialError,
}: {
  initialStats: DashboardStats | null;
  initialError: string | null;
}) {
  const [stats, setStats] = useState<DashboardStats | null>(initialStats);
  const [error, setError] = useState<string | null>(initialError);

  const refetch = useCallback(async () => {
    try {
      const res = await resilientFetch("/api/stats");
      if (!res.ok) throw new Error("Failed to fetch stats");
      const data = await res.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    }
  }, []);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" className="mt-4" onClick={refetch}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.totalRuns === 0) {
    return <EmptyDashboard />;
  }

  const successRate =
    stats.totalRuns > 0 ? Math.round((stats.completedRuns / stats.totalRuns) * 100) : 0;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── KPI tiles ── */}
      <motion.div
        variants={staggerItem}
        className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5"
      >
        <KPITile
          icon={<BrainCircuit className="h-4 w-4 text-primary" />}
          label="Use Cases"
          tip={DASHBOARD.useCases}
          value={stats.totalUseCases.toLocaleString()}
          detail={`${stats.aiCount} AI · ${stats.statisticalCount} Statistical${stats.geospatialCount > 0 ? ` · ${stats.geospatialCount} Geo` : ""}`}
        />
        <KPITile
          icon={<Activity className="h-4 w-4 text-chart-2" />}
          label="Total Runs"
          tip={DASHBOARD.totalRuns}
          value={stats.totalRuns}
          detail={
            stats.runningRuns > 0
              ? `${stats.runningRuns} active`
              : `${stats.completedRuns} completed`
          }
        />
        <KPITile
          icon={<Trophy className="h-4 w-4 text-chart-4" />}
          label="Avg Score"
          tip={DASHBOARD.avgScore}
          value={`${stats.avgScore}%`}
          detail="Composite quality score"
          sentiment={
            stats.avgScore >= 70 ? "positive" : stats.avgScore >= 40 ? "neutral" : "warning"
          }
        />
        <KPITile
          icon={<Layers className="h-4 w-4 text-chart-3" />}
          label="Domains"
          tip={DASHBOARD.domains}
          value={stats.totalDomains}
          detail="Business domains identified"
        />
        <KPITile
          icon={<TrendingUp className="h-4 w-4 text-chart-3" />}
          label="Success Rate"
          tip={DASHBOARD.successRate}
          value={successRate > 0 ? `${successRate}%` : "N/A"}
          detail={stats.failedRuns > 0 ? `${stats.failedRuns} failed` : "All runs successful"}
          sentiment={successRate === 100 ? "positive" : successRate >= 80 ? "neutral" : "warning"}
        />
      </motion.div>

      {/* ── Quick actions + Business value ── */}
      <motion.div variants={staggerItem} className="flex flex-col gap-4 sm:flex-row">
        <Link href="/configure" className="group flex-1">
          <Card className="h-full hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="flex h-full items-center gap-4 pt-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 transition-colors group-hover:bg-primary/15">
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold">New Discovery</p>
                <p className="text-xs text-muted-foreground">Configure a pipeline run</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>

        <Link href="/ask-forge" className="group flex-1">
          <Card className="h-full hover:-translate-y-0.5 hover:shadow-md">
            <CardContent className="flex h-full items-center gap-4 pt-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-chart-2/10 transition-colors group-hover:bg-chart-2/15">
                <Sparkles className="h-5 w-5 text-chart-2" />
              </div>
              <div>
                <p className="font-semibold">Ask Forge</p>
                <p className="text-xs text-muted-foreground">Chat with your data estate</p>
              </div>
              <ArrowRight className="ml-auto h-4 w-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
            </CardContent>
          </Card>
        </Link>

        {stats.totalUseCases > 0 && <BusinessValueSummary />}
      </motion.div>

      {/* ── Charts ── */}
      {stats.totalUseCases > 0 && (
        <motion.div variants={staggerItem} className="grid gap-6 md:grid-cols-3">
          <ScoreDistributionChart scores={stats.scores} />
          <DomainBreakdownChart data={stats.domainBreakdown} />
          <TypeSplitChart
            aiCount={stats.aiCount}
            statisticalCount={stats.statisticalCount}
            geospatialCount={stats.geospatialCount}
          />
        </motion.div>
      )}

      {/* ── Recent Runs + Activity ── */}
      <motion.div variants={staggerItem} className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Runs</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2.5 text-xs text-muted-foreground"
                asChild
              >
                <Link href="/runs">
                  View all
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {stats.recentRuns.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No runs yet. Start a new discovery to see results here.
              </p>
            ) : (
              <div className="space-y-2">
                {stats.recentRuns.map((run) => (
                  <Link
                    key={run.runId}
                    href={`/runs/${run.runId}`}
                    className="flex items-center justify-between rounded-lg border px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{run.businessName}</p>
                      <p
                        className="text-xs text-muted-foreground"
                        title={new Date(run.createdAt).toLocaleString()}
                      >
                        {timeAgo(run.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      {run.status === "completed" && run.useCaseCount > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {run.useCaseCount} use cases
                        </span>
                      )}
                      <Badge variant="secondary" className={STATUS_STYLES[run.status] ?? ""}>
                        {run.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeedInline limit={5} />
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ── KPI Tile ──────────────────────────────────────────────────────────

type Sentiment = "positive" | "neutral" | "warning";

const SENTIMENT_BORDER: Record<Sentiment, string> = {
  positive: "border-l-green-500 dark:border-l-green-400",
  neutral: "border-l-border",
  warning: "border-l-amber-500 dark:border-l-amber-400",
};

function KPITile({
  icon,
  label,
  tip,
  value,
  detail,
  sentiment = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  tip?: string;
  value: string | number;
  detail?: string;
  sentiment?: Sentiment;
}) {
  return (
    <Card className={cn("border-l-[3px]", SENTIMENT_BORDER[sentiment])}>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2">
          {icon}
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            {tip && <InfoTip tip={tip} />}
          </div>
        </div>
        <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
        {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}

// ── Empty Dashboard ───────────────────────────────────────────────────

function EmptyDashboard() {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Welcome hero */}
      <motion.div variants={staggerItem}>
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-primary/5">
          {/* Diamond pattern */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M20 2L38 20L20 38L2 20Z' fill='none' stroke='%23FF3621' stroke-width='0.5'/%3E%3C/svg%3E")`,
              backgroundSize: "40px 40px",
            }}
          />
          <div className="relative px-8 py-16 text-center sm:px-12 sm:py-20">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 shadow-sm ring-1 ring-primary/10">
              <BrainCircuit className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              Welcome to Forge AI
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Discover high-value data use cases from your Unity Catalog metadata. Configure your
              business context, point at your catalogs, and let AI generate scored, actionable
              recommendations.
            </p>
            <Button size="lg" className="mt-8" asChild>
              <Link href="/configure">
                <Plus className="mr-2 h-4 w-4" />
                Start Your First Discovery
              </Link>
            </Button>
          </div>
        </div>
      </motion.div>

      {/* How it works -- compact row */}
      <motion.div variants={staggerItem} className="grid gap-4 sm:grid-cols-3">
        <StepTile
          step={1}
          title="Configure"
          description="Set your business context, select catalogs and schemas, and choose analysis priorities."
        />
        <StepTile
          step={2}
          title="Discover"
          description="AI analyses your metadata in 7 steps: context, filtering, generation, clustering, scoring, and SQL."
        />
        <StepTile
          step={3}
          title="Export & Deploy"
          description="Download results as Excel, PDF, or PowerPoint. Deploy SQL notebooks and Genie Spaces."
        />
      </motion.div>
    </motion.div>
  );
}

function StepTile({
  step,
  title,
  description,
}: {
  step: number;
  title: string;
  description: string;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="pointer-events-none absolute -right-3 -top-3 text-7xl font-extrabold leading-none text-muted-foreground/[0.04]">
        {step}
      </div>
      <CardContent className="relative pt-6">
        <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
          {step}
        </div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

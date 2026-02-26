"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { resilientFetch } from "@/lib/resilient-fetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunProgress } from "@/components/pipeline/run-progress";
import { UseCaseTable } from "@/components/pipeline/use-case-table";
import { ExportToolbar } from "@/components/pipeline/export-toolbar";
import { GenieWorkbench } from "@/components/pipeline/genie-workbench";
import { DashboardsTab } from "@/components/pipeline/dashboards-tab";
import {
  ScoreDistributionChart,
  DomainBreakdownChart,
  TypeSplitChart,
  StepDurationChart,
  ScoreRadarOverview,
} from "@/components/charts/lazy";
import { SchemaCoverageCard } from "@/components/pipeline/run-detail/schema-coverage-card";
import { IndustryCoverageCard } from "@/components/pipeline/run-detail/industry-coverage-card";
import { computeIndustryCoverage } from "@/lib/domain/industry-coverage";
import { BusinessContextCard } from "@/components/pipeline/run-detail/business-context-card";
import { PromptVersionsCard } from "@/components/pipeline/run-detail/prompt-versions-card";
import { EnvironmentScanCard } from "@/components/pipeline/run-detail/environment-scan-card";
import {
  AIObservabilityTab,
  type PromptLogEntry,
  type PromptLogStats,
} from "@/components/pipeline/run-detail/ai-observability-tab";
import {
  Target,
  Database,
  Copy,
  ChevronDown,
  ChevronUp,
  BarChart3,
  Settings2,
  Eye,
  RotateCcw,
  ArrowLeft,
  GitCompareArrows,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoTip } from "@/components/ui/info-tip";
import { RUN_DETAIL } from "@/lib/help-text";
import { Separator } from "@/components/ui/separator";
import type {
  PipelineRun,
  UseCase,
  PipelineStep,
} from "@/lib/domain/types";
import { computeDomainStats, effectiveScores } from "@/lib/domain/scoring";
import { toast } from "sonner";
import { useIndustryOutcomes } from "@/lib/hooks/use-industry-outcomes";

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const router = useRouter();
  const { getOutcome: getIndustryOutcome } = useIndustryOutcomes();
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [lineageDiscoveredFqns, setLineageDiscoveredFqns] = useState<
    string[]
  >([]);
  const [scanId, setScanId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchingRef = useRef(false);

  const [activeTab, setActiveTab] = useState("overview");

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value);
  }, []);

  // Collapsible section state
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Genie Engine background generation indicator
  const [genieGenerating, setGenieGenerating] = useState(false);
  const geniePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Dashboard Engine background generation indicator
  const [dashboardGenerating, setDashboardGenerating] = useState(false);
  const dashboardPollRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  useEffect(() => {
    if (run?.status !== "completed" || useCases.length === 0) return;

    let cancelled = false;

    async function checkGenieStatus() {
      try {
        const res = await fetch(
          `/api/runs/${runId}/genie-engine/generate/status`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.status === "generating") {
          setGenieGenerating(true);
          if (!geniePollRef.current) {
            geniePollRef.current = setInterval(async () => {
              try {
                const r = await fetch(
                  `/api/runs/${runId}/genie-engine/generate/status`
                );
                if (r.ok) {
                  const d = await r.json();
                  if (d.status !== "generating") {
                    setGenieGenerating(false);
                    if (geniePollRef.current) {
                      clearInterval(geniePollRef.current);
                      geniePollRef.current = null;
                    }
                  }
                }
              } catch {
                /* ignore */
              }
            }, 3000);
          }
        } else {
          setGenieGenerating(false);
        }
      } catch {
        /* ignore */
      }
    }

    checkGenieStatus();
    return () => {
      cancelled = true;
      if (geniePollRef.current) {
        clearInterval(geniePollRef.current);
        geniePollRef.current = null;
      }
    };
  }, [run?.status, runId, useCases.length]);

  useEffect(() => {
    if (run?.status !== "completed" || useCases.length === 0) return;

    let cancelled = false;

    async function checkDashboardStatus() {
      try {
        const res = await fetch(
          `/api/runs/${runId}/dashboard-engine/generate/status`
        );
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (data.status === "generating") {
          setDashboardGenerating(true);
          if (!dashboardPollRef.current) {
            dashboardPollRef.current = setInterval(async () => {
              try {
                const r = await fetch(
                  `/api/runs/${runId}/dashboard-engine/generate/status`
                );
                if (r.ok) {
                  const d = await r.json();
                  if (d.status !== "generating") {
                    setDashboardGenerating(false);
                    if (dashboardPollRef.current) {
                      clearInterval(dashboardPollRef.current);
                      dashboardPollRef.current = null;
                    }
                  }
                }
              } catch {
                /* ignore */
              }
            }, 3000);
          }
        } else {
          setDashboardGenerating(false);
        }
      } catch {
        /* ignore */
      }
    }

    checkDashboardStatus();
    return () => {
      cancelled = true;
      if (dashboardPollRef.current) {
        clearInterval(dashboardPollRef.current);
        dashboardPollRef.current = null;
      }
    };
  }, [run?.status, runId, useCases.length]);

  // Prompt logs state
  const [promptLogs, setPromptLogs] = useState<PromptLogEntry[]>([]);
  const [promptStats, setPromptStats] = useState<PromptLogStats | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);

  // Rerun state
  const [isRerunning, setIsRerunning] = useState(false);

  const fetchRun = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const url = useCases.length === 0
        ? `/api/runs/${runId}?fields=summary`
        : `/api/runs/${runId}`;
      const res = await resilientFetch(url, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Run not found");
      const data = await res.json();
      setRun(data.run);
      if (data.useCases) setUseCases(data.useCases);
      if (data.lineageDiscoveredFqns)
        setLineageDiscoveredFqns(data.lineageDiscoveredFqns);
      if (data.scanId) setScanId(data.scanId);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Keep stale data visible during transient failures; only show error
      // if we have no data at all (initial load failed completely).
      if (!run) {
        setError(err instanceof Error ? err.message : "Failed to load run");
      }
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [runId, run, useCases.length]);

  const fetchPromptLogs = useCallback(async () => {
    if (logsLoaded || logsLoading) return;
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/runs/${runId}/prompt-logs`);
      if (res.ok) {
        const data = await res.json();
        setPromptLogs(data.logs ?? []);
        setPromptStats(data.stats ?? null);
      }
    } catch {
      // Non-critical -- silently fail
    } finally {
      setLogsLoading(false);
      setLogsLoaded(true);
    }
  }, [runId, logsLoaded, logsLoading]);

  const handleRerun = useCallback(async () => {
    if (!run) return;
    setIsRerunning(true);
    try {
      const cfg = run.config;
      const createRes = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: cfg.businessName,
          ucMetadata: cfg.ucMetadata,
          industry: cfg.industry,
          businessDomains: cfg.businessDomains,
          businessPriorities: cfg.businessPriorities,
          strategicGoals: cfg.strategicGoals,
          languages: cfg.languages,
          sampleRowsPerTable: cfg.sampleRowsPerTable,
          discoveryDepth: cfg.discoveryDepth,
          depthConfig: cfg.depthConfig,
          estateScanEnabled: cfg.estateScanEnabled,
          assetDiscoveryEnabled: cfg.assetDiscoveryEnabled,
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error ?? "Failed to create run");
      }
      const { runId: newRunId } = await createRes.json();

      const execRes = await fetch(`/api/runs/${newRunId}/execute`, {
        method: "POST",
      });
      if (!execRes.ok) {
        const err = await execRes.json();
        throw new Error(err.error ?? "Failed to start pipeline");
      }

      toast.success("Pipeline restarted! Redirecting to new run...");
      router.push(`/runs/${newRunId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to rerun pipeline"
      );
    } finally {
      setIsRerunning(false);
    }
  }, [run, router]);

  useEffect(() => {
    fetchRun();
    return () => abortRef.current?.abort();
  }, [fetchRun]);

  useEffect(() => {
    const isActive = run?.status === "running" || run?.status === "pending";
    if (!isActive) return;
    const interval = setInterval(fetchRun, 3000);
    return () => clearInterval(interval);
  }, [run?.status, fetchRun]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Run not found"}
        </div>
        <Button variant="outline" asChild>
          <Link href="/runs">Back to Runs</Link>
        </Button>
      </div>
    );
  }

  const STATUS_LABELS: Record<string, string> = {
    pending: "Pending",
    running: "Running",
    completed: "Completed",
    failed: "Failed",
  };

  const STATUS_STYLES: Record<string, string> = {
    pending:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    running:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    completed:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const isCompleted = run.status === "completed";
  const isActive = run.status === "running" || run.status === "pending";
  const domainStats = isCompleted ? computeDomainStats(useCases) : [];

  // Compute coverage data for the summary card (only when industry is set)
  const industryOutcome = run.config.industry
    ? getIndustryOutcome(run.config.industry)
    : null;
  const coverageData =
    industryOutcome && useCases.length > 0
      ? computeIndustryCoverage(industryOutcome, useCases)
      : null;


  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {run.config.businessName}
            </h1>
            <Badge
              variant="secondary"
              className={STATUS_STYLES[run.status] ?? ""}
            >
              {STATUS_LABELS[run.status]}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {run.config.ucMetadata}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Created{" "}
            {new Date(run.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {run.completedAt &&
              ` \u2022 Completed ${new Date(
                run.completedAt
              ).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isCompleted && (
            <>
              <ExportToolbar
                runId={run.runId}
                businessName={run.config.businessName}
                scanId={scanId}
              />
              <Separator orientation="vertical" className="mx-1 h-6" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  sessionStorage.setItem(
                    "forge:duplicate-config",
                    JSON.stringify(run.config)
                  );
                  router.push("/configure");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Duplicate
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/runs/compare?run=${runId}`}>
                  <GitCompareArrows className="mr-1.5 h-3.5 w-3.5" />
                  Compare
                </Link>
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/runs">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              Runs
            </Link>
          </Button>
        </div>
      </div>

      {/* Industry Outcome Map Banner */}
      {run.config.industry &&
        (() => {
          const outcome = getIndustryOutcome(run.config.industry);
          return outcome ? (
            <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/30">
              <Target className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-violet-900 dark:text-violet-200">
                  Matched Industry Outcome Map:{" "}
                  <span className="font-semibold">{outcome.name}</span>
                </p>
                <p className="text-xs text-violet-700 dark:text-violet-400">
                  {run.industryAutoDetected
                    ? "Automatically detected from business context"
                    : "Manually selected during configuration"}
                  {" \u2022 "}
                  {outcome.objectives.length} strategic objective
                  {outcome.objectives.length !== 1 ? "s" : ""}
                  {" \u2022 "}
                  {outcome.objectives.reduce(
                    (sum, o) => sum + o.priorities.length,
                    0
                  )}{" "}
                  priorities
                  {" \u2022 "}
                  {outcome.objectives.reduce(
                    (sum, o) =>
                      sum +
                      o.priorities.reduce(
                        (s, p) => s + p.useCases.length,
                        0
                      ),
                    0
                  )}{" "}
                  reference use cases
                </p>
              </div>
              {run.industryAutoDetected && (
                <Badge
                  variant="outline"
                  className="shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-400"
                >
                  auto-detected
                </Badge>
              )}
            </div>
          ) : null;
        })()}

      {/* Progress (running/pending) */}
      {isActive && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Progress</CardTitle>
            <CardDescription>
              {run.statusMessage ??
                (run.currentStep
                  ? `Currently: ${run.currentStep}`
                  : "Waiting to start...")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <Progress value={run.progressPct} className="h-3" />
              <p className="mt-1 text-right text-sm text-muted-foreground">
                {run.progressPct}%
              </p>
            </div>
            <RunProgress
              currentStep={run.currentStep as PipelineStep}
              progressPct={run.progressPct}
              status={run.status}
              statusMessage={run.statusMessage ?? undefined}
            />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {run.status === "failed" && run.errorMessage && (
        <Card className="border-destructive/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg text-destructive">
                Pipeline Failed
              </CardTitle>
              <Button
                size="sm"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/runs/${runId}/execute?resume=true`, { method: "POST" });
                    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Resume failed"); }
                    toast.success("Pipeline resuming from last successful step");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Resume failed");
                  }
                }}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Resume Pipeline
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{run.errorMessage}</p>
            <RunProgress
              currentStep={run.currentStep as PipelineStep}
              progressPct={run.progressPct}
              status={run.status}
            />
          </CardContent>
        </Card>
      )}

      {/* Completed Results */}
      {isCompleted && (
        <>
          {/* Clickable Summary Cards */}
          <div className="grid gap-4 md:grid-cols-5">
            <SummaryCard
              title="Total Use Cases"
              value={String(useCases.length)}
              tip={RUN_DETAIL.totalUseCases}
              onClick={() => setActiveTab("usecases")}
            />
            <SummaryCard
              title="Domains"
              value={String(
                new Set(useCases.map((uc) => uc.domain)).size
              )}
              tip={RUN_DETAIL.domainCount}
              onClick={() => {
                setActiveTab("overview");
                setInsightsOpen(true);
              }}
            />
            <SummaryCard
              title="AI Use Cases"
              value={String(
                useCases.filter((uc) => uc.type === "AI").length
              )}
              tip={RUN_DETAIL.aiUseCases}
              onClick={() => setActiveTab("usecases")}
            />
            <SummaryCard
              title="Avg Score"
              value={
                useCases.length > 0
                  ? `${Math.round(
                      (useCases.reduce(
                        (s, uc) => s + effectiveScores(uc).overall,
                        0
                      ) /
                        useCases.length) *
                        100
                    )}%`
                  : "N/A"
              }
              tip={RUN_DETAIL.avgScore}
              onClick={() => setActiveTab("overview")}
            />
            <CoverageGapCard
              coverageData={coverageData}
              onClick={() => {
                setActiveTab("overview");
                setInsightsOpen(true);
              }}
            />
          </div>

          {/* Score Landscape Radar */}
          {useCases.length > 1 && (
            <div>
              <ScoreRadarOverview useCases={useCases} />
            </div>
          )}

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>{RUN_DETAIL.tabOverview}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger value="usecases">
                    Use Cases ({useCases.length})
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>{RUN_DETAIL.tabUseCases}</TooltipContent>
              </Tooltip>
              {useCases.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="genie">
                      Genie Spaces{" "}
                      {genieGenerating && (
                        <span className="ml-1 animate-pulse text-violet-500">
                          ●
                        </span>
                      )}
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{RUN_DETAIL.tabGenie}</TooltipContent>
                </Tooltip>
              )}
              {useCases.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger value="dashboards">
                      Dashboards{" "}
                      {dashboardGenerating && (
                        <span className="ml-1 animate-pulse text-blue-500">
                          ●
                        </span>
                      )}
                    </TabsTrigger>
                  </TooltipTrigger>
                  <TooltipContent>{RUN_DETAIL.tabDashboards}</TooltipContent>
                </Tooltip>
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <TabsTrigger
                    value="observability"
                    onClick={() => fetchPromptLogs()}
                  >
                    AI Observability
                  </TabsTrigger>
                </TooltipTrigger>
                <TooltipContent>{RUN_DETAIL.tabObservability}</TooltipContent>
              </Tooltip>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 pt-4">
              {/* Insights group (expanded by default) */}
              <Collapsible open={insightsOpen} onOpenChange={setInsightsOpen}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-semibold">Insights</span>
                  </div>
                  {insightsOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-6 pt-4">
                  {/* Charts */}
                  {useCases.length > 0 && (
                    <div className="grid gap-6 md:grid-cols-3">
                      <ScoreDistributionChart
                        scores={useCases.map(
                          (uc) => effectiveScores(uc).overall
                        )}
                        title="Score Distribution"
                      />
                      <DomainBreakdownChart
                        data={domainStats.map((d) => ({
                          domain: d.domain,
                          count: d.count,
                        }))}
                        title="Use Cases by Domain"
                      />
                      <TypeSplitChart
                        aiCount={
                          useCases.filter((uc) => uc.type === "AI").length
                        }
                        statisticalCount={
                          useCases.filter((uc) => uc.type === "Statistical")
                            .length
                        }
                        geospatialCount={
                          useCases.filter((uc) => uc.type === "Geospatial")
                            .length
                        }
                        title="Use Case Types"
                      />
                    </div>
                  )}

                  {/* Schema Coverage */}
                  {useCases.length > 0 && (
                    <SchemaCoverageCard
                      useCases={useCases}
                      lineageDiscoveredFqns={lineageDiscoveredFqns}
                    />
                  )}

                  {/* Industry Coverage + Gap Analysis */}
                  {run.config.industry && useCases.length > 0 && (
                    <div>
                      <IndustryCoverageCard
                        industryId={run.config.industry}
                        useCases={useCases}
                        runId={run.runId}
                      />
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Run Details group (collapsed by default) */}
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-4 py-2.5 text-left transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-semibold">Run Details</span>
                  </div>
                  {detailsOpen ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-6 pt-4">
                  {/* Business Context */}
                  {run.businessContext && (
                    <BusinessContextCard context={run.businessContext} />
                  )}

                  {/* Run Configuration */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">
                        Run Configuration
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                        <ConfigField
                          label="Discovery Depth"
                          value={
                            (run.config.discoveryDepth ?? "balanced")
                              .charAt(0)
                              .toUpperCase() +
                            (run.config.discoveryDepth ?? "balanced").slice(
                              1
                            ) +
                            (run.config.depthConfig
                              ? ` (${run.config.depthConfig.batchTargetMin}-${run.config.depthConfig.batchTargetMax}/batch, floor ${run.config.depthConfig.qualityFloor}, cap ${run.config.depthConfig.adaptiveCap}, lineage ${run.config.depthConfig.lineageDepth} hops)`
                              : "")
                          }
                        />
                        <ConfigField
                          label="AI Model"
                          value={run.config.aiModel}
                        />
                        <ConfigField
                          label="Industry"
                          value={
                            run.config.industry
                              ? (getIndustryOutcome(run.config.industry)
                                  ?.name ?? run.config.industry)
                              : "Not specified"
                          }
                          badge={
                            run.config.industry && run.industryAutoDetected
                              ? "auto-detected"
                              : undefined
                          }
                        />
                        <ConfigField
                          label="Priorities"
                          value={
                            run.config.businessPriorities.length > 0
                              ? run.config.businessPriorities.join(", ")
                              : "Default"
                          }
                        />
                      </div>
                      {run.config.sampleRowsPerTable > 0 ? (
                        <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
                          <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                          <p className="text-sm text-blue-800 dark:text-blue-300">
                            <span className="font-medium">
                              Data sampling enabled
                            </span>
                            {" \u2014 "}
                            {run.config.sampleRowsPerTable} rows per table
                            sampled during discovery and SQL generation
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 rounded-md border border-muted px-3 py-2">
                          <Database className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            Data sampling disabled — metadata only (no
                            row-level data read)
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Environment Scan */}
                  <EnvironmentScanCard runId={runId} />

                  {/* Pipeline Timeline */}
                  {run.stepLog.length > 0 && (
                    <StepDurationChart steps={run.stepLog} />
                  )}
                </CollapsibleContent>
              </Collapsible>
            </TabsContent>

            {/* Use Cases Tab */}
            <TabsContent value="usecases" className="pt-4">
              {useCases.length > 0 ? (
                <UseCaseTable
                  useCases={useCases}
                  lineageDiscoveredFqns={lineageDiscoveredFqns}
                  onUpdate={async (updated) => {
                    try {
                      const original = useCases.find(
                        (uc) => uc.id === updated.id
                      );
                      const payload: Record<string, unknown> = {};

                      if (updated.name !== original?.name)
                        payload.name = updated.name;
                      if (updated.statement !== original?.statement)
                        payload.statement = updated.statement;
                      if (
                        JSON.stringify(updated.tablesInvolved) !==
                        JSON.stringify(original?.tablesInvolved)
                      ) {
                        payload.tablesInvolved = updated.tablesInvolved;
                      }

                      const scoresChanged =
                        updated.userPriorityScore !==
                          original?.userPriorityScore ||
                        updated.userFeasibilityScore !==
                          original?.userFeasibilityScore ||
                        updated.userImpactScore !==
                          original?.userImpactScore ||
                        updated.userOverallScore !==
                          original?.userOverallScore;

                      if (scoresChanged) {
                        const isScoreReset =
                          updated.userPriorityScore === null &&
                          updated.userFeasibilityScore === null &&
                          updated.userImpactScore === null &&
                          updated.userOverallScore === null;

                        if (isScoreReset) {
                          payload.resetScores = true;
                        } else {
                          payload.userPriorityScore =
                            updated.userPriorityScore;
                          payload.userFeasibilityScore =
                            updated.userFeasibilityScore;
                          payload.userImpactScore = updated.userImpactScore;
                          payload.userOverallScore =
                            updated.userOverallScore;
                        }
                      }

                      if (Object.keys(payload).length === 0) {
                        setUseCases((prev) =>
                          prev.map((uc) =>
                            uc.id === updated.id ? updated : uc
                          )
                        );
                        return { ok: true };
                      }

                      const res = await fetch(
                        `/api/runs/${runId}/usecases/${updated.id}`,
                        {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                        }
                      );
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        const msg = data?.error || `HTTP ${res.status}`;
                        void 0;
                        return { ok: false, error: msg };
                      }
                      setUseCases((prev) =>
                        prev.map((uc) =>
                          uc.id === updated.id ? updated : uc
                        )
                      );
                      return { ok: true };
                    } catch (err) {
                      void 0;
                      return {
                        ok: false,
                        error:
                          err instanceof Error
                            ? err.message
                            : "Network error",
                      };
                    }
                  }}
                />
              ) : (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <p className="text-muted-foreground">
                      No use cases were generated.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Genie Spaces Tab */}
            {useCases.length > 0 && (
              <TabsContent value="genie" className="pt-4">
                <GenieWorkbench runId={run.runId} />
              </TabsContent>
            )}

            {/* Dashboards Tab */}
            {useCases.length > 0 && (
              <TabsContent value="dashboards" className="pt-4">
                <DashboardsTab runId={run.runId} />
              </TabsContent>
            )}

            {/* AI Observability Tab (now includes Prompt Versions) */}
            <TabsContent value="observability" className="space-y-6 pt-4">
              <AIObservabilityTab
                logs={promptLogs}
                stats={promptStats}
                loading={logsLoading}
                stepLog={run.stepLog}
                promptVersionsNode={
                  run.promptVersions ? (
                    <PromptVersionsCard
                      runVersions={run.promptVersions}
                      runId={run.runId}
                    />
                  ) : undefined
                }
                onRerun={handleRerun}
                isRerunning={isRerunning}
              />
            </TabsContent>
          </Tabs>
        </>
      )}

      {isCompleted && useCases.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">
              Pipeline completed but no use cases were generated.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  title,
  value,
  tip,
  onClick,
}: {
  title: string;
  value: string;
  tip?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={
        onClick
          ? "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
          : ""
      }
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-muted-foreground">{title}</p>
          {tip && <InfoTip tip={tip} />}
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function CoverageGapCard({
  coverageData,
  onClick,
}: {
  coverageData: {
    overallCoverage: number;
    gapCount: number;
  } | null;
  onClick?: () => void;
}) {
  if (!coverageData) {
    return (
      <Card className="opacity-60">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Coverage</p>
          <p className="text-2xl font-bold text-muted-foreground">N/A</p>
          <p className="text-xs text-muted-foreground">No industry map</p>
        </CardContent>
      </Card>
    );
  }

  const pct = Math.round(coverageData.overallCoverage * 100);
  const colorClass =
    pct >= 75
      ? "text-green-600 dark:text-green-400"
      : pct >= 25
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Card
      className={
        onClick
          ? "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
          : ""
      }
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-violet-500" />
          <p className="text-sm text-muted-foreground">Coverage</p>
        </div>
        <p className={`text-2xl font-bold ${colorClass}`}>{pct}%</p>
        {coverageData.gapCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {coverageData.gapCount} gap{coverageData.gapCount !== 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ConfigField({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm">
        {value}
        {badge && (
          <span className="ml-1.5 inline-block rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {badge}
          </span>
        )}
      </p>
    </div>
  );
}

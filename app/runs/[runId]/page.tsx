"use client";

import { useEffect, useState, useRef, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RunProgress } from "@/components/pipeline/run-progress";
import { UseCaseTable } from "@/components/pipeline/use-case-table";
import { ExportToolbar } from "@/components/pipeline/export-toolbar";
import { GenieWorkbench } from "@/components/pipeline/genie-workbench";
import { ScoreDistributionChart } from "@/components/charts/score-distribution-chart";
import { DomainBreakdownChart } from "@/components/charts/domain-breakdown-chart";
import { TypeSplitChart } from "@/components/charts/type-split-chart";
import { StepDurationChart } from "@/components/charts/step-duration-chart";
import { ScoreRadarOverview } from "@/components/charts/score-radar-overview";
import {
  Building2,
  Target,
  TrendingUp,
  Network,
  DollarSign,
  Cpu,
  Clock,
  CheckCircle2,
  XCircle,
  Activity,
  ChevronDown,
  ChevronUp,
  Eye,
  Database,
  Copy,
} from "lucide-react";
import type {
  PipelineRun,
  UseCase,
  PipelineStep,
  BusinessContext,
  StepLogEntry,
} from "@/lib/domain/types";
import { computeDomainStats, effectiveScores } from "@/lib/domain/scoring";
import {
  type IndustryOutcome,
  type StrategicPriority,
} from "@/lib/domain/industry-outcomes";
import { useIndustryOutcomes } from "@/lib/hooks/use-industry-outcomes";

interface PromptLogEntry {
  logId: string;
  runId: string;
  step: string;
  promptKey: string;
  promptVersion: string;
  model: string;
  temperature: number;
  renderedPrompt: string;
  rawResponse: string | null;
  honestyScore: number | null;
  durationMs: number | null;
  success: boolean;
  errorMessage: string | null;
}

interface PromptLogStats {
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

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
  const [lineageDiscoveredFqns, setLineageDiscoveredFqns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchingRef = useRef(false);

  const [activeTab, setActiveTab] = useState("overview");

  // Prompt logs state
  const [promptLogs, setPromptLogs] = useState<PromptLogEntry[]>([]);
  const [promptStats, setPromptStats] = useState<PromptLogStats | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);

  const fetchRun = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(`/api/runs/${runId}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Run not found");
      const data = await res.json();
      setRun(data.run);
      if (data.useCases) setUseCases(data.useCases);
      if (data.lineageDiscoveredFqns) setLineageDiscoveredFqns(data.lineageDiscoveredFqns);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load run");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [runId]);

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
    pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };

  const isCompleted = run.status === "completed";
  const isActive = run.status === "running" || run.status === "pending";
  const domainStats = isCompleted ? computeDomainStats(useCases) : [];

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
              ` \u2022 Completed ${new Date(run.completedAt).toLocaleDateString(undefined, {
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
                <Copy className="mr-1 h-3.5 w-3.5" />
                Duplicate Config
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/runs/compare?run=${runId}`}>Compare</Link>
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/runs">Back to Runs</Link>
          </Button>
        </div>
      </div>

      {/* Industry Outcome Map Banner */}
      {run.config.industry && (() => {
        const outcome = getIndustryOutcome(run.config.industry);
        return outcome ? (
          <div className="flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/30">
            <Target className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-violet-900 dark:text-violet-200">
                Matched Industry Outcome Map: <span className="font-semibold">{outcome.name}</span>
              </p>
              <p className="text-xs text-violet-700 dark:text-violet-400">
                {run.industryAutoDetected
                  ? "Automatically detected from business context"
                  : "Manually selected during configuration"}
                {" \u2022 "}
                {outcome.objectives.length} strategic objective{outcome.objectives.length !== 1 ? "s" : ""}
                {" \u2022 "}
                {outcome.objectives.reduce((sum, o) => sum + o.priorities.length, 0)} priorities
                {" \u2022 "}
                {outcome.objectives.reduce((sum, o) => sum + o.priorities.reduce((s, p) => s + p.useCases.length, 0), 0)} reference use cases
              </p>
            </div>
            {run.industryAutoDetected && (
              <Badge variant="outline" className="shrink-0 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-400">
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
              {run.statusMessage ?? (run.currentStep ? `Currently: ${run.currentStep}` : "Waiting to start...")}
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
            <CardTitle className="text-lg text-destructive">Pipeline Failed</CardTitle>
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

      {/* Completed Results - Tabbed Layout */}
      {isCompleted && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard title="Total Use Cases" value={String(useCases.length)} />
            <SummaryCard
              title="Domains"
              value={String(new Set(useCases.map((uc) => uc.domain)).size)}
            />
            <SummaryCard
              title="AI Use Cases"
              value={String(useCases.filter((uc) => uc.type === "AI").length)}
            />
            <SummaryCard
              title="Avg Score"
              value={
                useCases.length > 0
                  ? `${Math.round((useCases.reduce((s, uc) => s + effectiveScores(uc).overall, 0) / useCases.length) * 100)}%`
                  : "N/A"
              }
            />
          </div>

          {/* Score Landscape Radar -- all use cases at a glance */}
          {useCases.length > 1 && (
            <ScoreRadarOverview useCases={useCases} />
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="usecases">
                Use Cases ({useCases.length})
              </TabsTrigger>
              {useCases.length > 0 && (
                <TabsTrigger value="genie">Genie Spaces</TabsTrigger>
              )}
              <TabsTrigger
                value="observability"
                onClick={() => fetchPromptLogs()}
              >
                AI Observability
              </TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 pt-4">
              {/* Business Context */}
              {run.businessContext && (
                <BusinessContextCard context={run.businessContext} />
              )}

              {/* Config Summary */}
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
                        ((run.config.discoveryDepth ?? "balanced").charAt(0).toUpperCase() + (run.config.discoveryDepth ?? "balanced").slice(1))
                        + (run.config.depthConfig
                          ? ` (${run.config.depthConfig.batchTargetMin}-${run.config.depthConfig.batchTargetMax}/batch, floor ${run.config.depthConfig.qualityFloor}, cap ${run.config.depthConfig.adaptiveCap}, lineage ${run.config.depthConfig.lineageDepth} hops)`
                          : "")
                      }
                    />
                    <ConfigField label="AI Model" value={run.config.aiModel} />
                    <ConfigField
                      label="Industry"
                      value={
                        run.config.industry
                          ? getIndustryOutcome(run.config.industry)?.name ?? run.config.industry
                          : "Not specified"
                      }
                      badge={
                        run.config.industry && run.industryAutoDetected
                          ? "auto-detected"
                          : undefined
                      }
                    />
                    <ConfigField
                      label="Languages"
                      value={run.config.languages.join(", ")}
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
                  {/* Data Sampling indicator */}
                  {run.config.sampleRowsPerTable > 0 ? (
                    <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 dark:border-blue-800 dark:bg-blue-950/30">
                      <Database className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <p className="text-sm text-blue-800 dark:text-blue-300">
                        <span className="font-medium">Data sampling enabled</span>
                        {" \u2014 "}
                        {run.config.sampleRowsPerTable} rows per table sampled during discovery and SQL generation
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-md border border-muted px-3 py-2">
                      <Database className="h-4 w-4 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Data sampling disabled — metadata only (no row-level data read)
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Environment Scan Summary */}
              <EnvironmentScanCard runId={runId} />

              {/* Pipeline Timeline */}
              {run.stepLog.length > 0 && (
                <StepDurationChart steps={run.stepLog} />
              )}

              {/* Charts */}
              {useCases.length > 0 && (
                <div className="grid gap-6 md:grid-cols-3">
                  <ScoreDistributionChart
                    scores={useCases.map((uc) => effectiveScores(uc).overall)}
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
                    aiCount={useCases.filter((uc) => uc.type === "AI").length}
                    statisticalCount={
                      useCases.filter((uc) => uc.type === "Statistical").length
                    }
                    title="AI vs Statistical"
                  />
                </div>
              )}

              {/* Schema Coverage -- expansion signals */}
              {useCases.length > 0 && <SchemaCoverageCard useCases={useCases} lineageDiscoveredFqns={lineageDiscoveredFqns} />}

              {/* Industry Coverage Analysis */}
              {run.config.industry && useCases.length > 0 && (
                <IndustryCoverageCard
                  industryId={run.config.industry}
                  useCases={useCases}
                />
              )}

              {/* Export */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-sm font-medium">
                      Export Results
                    </CardTitle>
                    <CardDescription>
                      Download use cases in multiple formats
                    </CardDescription>
                  </div>
                  <ExportToolbar
                    runId={run.runId}
                    businessName={run.config.businessName}
                    onGenieClick={() => setActiveTab("genie")}
                  />
                </CardHeader>
              </Card>
            </TabsContent>

            {/* Use Cases Tab */}
            <TabsContent value="usecases" className="pt-4">
              {useCases.length > 0 ? (
                <UseCaseTable
                  useCases={useCases}
                  lineageDiscoveredFqns={lineageDiscoveredFqns}
                  onUpdate={async (updated) => {
                    try {
                      const original = useCases.find((uc) => uc.id === updated.id);
                      const payload: Record<string, unknown> = {};

                      // Only send text fields that actually changed
                      if (updated.name !== original?.name) payload.name = updated.name;
                      if (updated.statement !== original?.statement) payload.statement = updated.statement;
                      if (JSON.stringify(updated.tablesInvolved) !== JSON.stringify(original?.tablesInvolved)) {
                        payload.tablesInvolved = updated.tablesInvolved;
                      }

                      // Detect score changes by comparing updated vs original
                      const scoresChanged =
                        updated.userPriorityScore !== original?.userPriorityScore ||
                        updated.userFeasibilityScore !== original?.userFeasibilityScore ||
                        updated.userImpactScore !== original?.userImpactScore ||
                        updated.userOverallScore !== original?.userOverallScore;

                      if (scoresChanged) {
                        const isScoreReset =
                          updated.userPriorityScore === null &&
                          updated.userFeasibilityScore === null &&
                          updated.userImpactScore === null &&
                          updated.userOverallScore === null;

                        if (isScoreReset) {
                          payload.resetScores = true;
                        } else {
                          payload.userPriorityScore = updated.userPriorityScore;
                          payload.userFeasibilityScore = updated.userFeasibilityScore;
                          payload.userImpactScore = updated.userImpactScore;
                          payload.userOverallScore = updated.userOverallScore;
                        }
                      }

                      if (Object.keys(payload).length === 0) {
                        setUseCases((prev) =>
                          prev.map((uc) => (uc.id === updated.id ? updated : uc))
                        );
                        return { ok: true };
                      }

                      const res = await fetch(`/api/runs/${runId}/usecases/${updated.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        const msg = data?.error || `HTTP ${res.status}`;
                        void 0; // logged server-side
                        return { ok: false, error: msg };
                      }
                      setUseCases((prev) =>
                        prev.map((uc) => (uc.id === updated.id ? updated : uc))
                      );
                      return { ok: true };
                    } catch (err) {
                      void 0; // network error surfaced in return value
                      return { ok: false, error: err instanceof Error ? err.message : "Network error" };
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

            {/* AI Observability Tab */}
            <TabsContent value="observability" className="space-y-6 pt-4">
              <AIObservabilityTab
                logs={promptLogs}
                stats={promptStats}
                loading={logsLoading}
                stepLog={run.stepLog}
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

function SummaryCard({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

function SchemaCoverageCard({ useCases, lineageDiscoveredFqns = [] }: { useCases: UseCase[]; lineageDiscoveredFqns?: string[] }) {
  const lineageFqnSet = new Set(lineageDiscoveredFqns);
  // Derive all unique tables referenced by use cases
  const allReferencedTables = new Set<string>();
  for (const uc of useCases) {
    for (const fqn of uc.tablesInvolved) {
      allReferencedTables.add(fqn.replace(/`/g, ""));
    }
  }

  // Count per-table references
  const tableCounts = new Map<string, number>();
  for (const uc of useCases) {
    for (const fqn of uc.tablesInvolved) {
      const clean = fqn.replace(/`/g, "");
      tableCounts.set(clean, (tableCounts.get(clean) ?? 0) + 1);
    }
  }

  const topTables = [...tableCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  if (allReferencedTables.size === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Database className="h-4 w-4 text-emerald-500" />
          Schema Coverage
        </CardTitle>
        <CardDescription>
          Tables referenced by generated use cases -- most-referenced tables represent your highest-value data assets
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Tables Referenced</p>
            <p className="text-lg font-bold">{allReferencedTables.size}</p>
            {lineageDiscoveredFqns.length > 0 && (() => {
              const selectedCount = [...allReferencedTables].filter((fqn) => !lineageFqnSet.has(fqn)).length;
              const lineageCount = [...allReferencedTables].filter((fqn) => lineageFqnSet.has(fqn)).length;
              return lineageCount > 0 ? (
                <p className="text-[10px] text-muted-foreground">
                  {selectedCount} selected + {lineageCount} via lineage
                </p>
              ) : null;
            })()}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Via Lineage</p>
            <p className="text-lg font-bold">{[...allReferencedTables].filter((fqn) => lineageFqnSet.has(fqn)).length}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Unique Table-UC Links</p>
            <p className="text-lg font-bold">
              {[...tableCounts.values()].reduce((s, v) => s + v, 0)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg Use Cases per Table</p>
            <p className="text-lg font-bold">
              {allReferencedTables.size > 0
                ? (
                    [...tableCounts.values()].reduce((s, v) => s + v, 0) /
                    allReferencedTables.size
                  ).toFixed(1)
                : "0"}
            </p>
          </div>
        </div>

        <Separator />

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Most-Referenced Tables (highest-value data assets)
          </p>
          <div className="space-y-1.5">
            {topTables.map(([fqn, count]) => {
              const isLineage = lineageFqnSet.has(fqn);
              return (
                <div
                  key={fqn}
                  className={`flex items-center justify-between rounded-md border px-3 py-1.5 ${isLineage ? "border-dashed border-blue-400/60" : ""}`}
                >
                  <span className="truncate font-mono text-xs">{fqn}</span>
                  <div className="ml-2 flex shrink-0 items-center gap-1.5">
                    {isLineage && (
                      <Badge variant="outline" className="border-blue-400/60 text-[10px] text-blue-500">
                        via lineage
                      </Badge>
                    )}
                    <Badge variant="secondary">
                      {count} use case{count !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
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

function EnvironmentScanCard({ runId }: { runId: string }) {
  const [scan, setScan] = useState<{
    tableCount: number;
    domainCount: number;
    piiTablesCount: number;
    avgGovernanceScore: number;
    lineageDiscoveredCount: number;
    scanDurationMs: number | null;
  } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const resp = await fetch("/api/environment-scan");
        if (!resp.ok) return;
        const data = await resp.json();
        const linked = data.scans?.find((s: { runId?: string }) => s.runId === runId);
        if (linked) setScan(linked);
      } catch {
        // Non-critical
      }
    })();
  }, [runId]);

  if (!scan) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Network className="h-4 w-4" />
          Environment Intelligence
        </CardTitle>
        <CardDescription>
          Metadata enrichment scan linked to this run
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Tables Scanned</p>
            <p className="text-lg font-bold">{scan.tableCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Domains Found</p>
            <p className="text-lg font-bold">{scan.domainCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Via Lineage</p>
            <p className="text-lg font-bold">{scan.lineageDiscoveredCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">PII Tables</p>
            <p className="text-lg font-bold">{scan.piiTablesCount}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Avg Governance</p>
            <p className="text-lg font-bold">{scan.avgGovernanceScore?.toFixed(0) ?? "—"}/100</p>
          </div>
        </div>
        {scan.scanDurationMs && (
          <p className="text-xs text-muted-foreground mt-2">
            Scan completed in {(scan.scanDurationMs / 1000).toFixed(1)}s
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BusinessContextCard({ context }: { context: BusinessContext }) {
  const sections = [
    { icon: <Building2 className="h-4 w-4 text-blue-500" />, label: "Industries", value: context.industries },
    { icon: <Target className="h-4 w-4 text-violet-500" />, label: "Strategic Goals", value: context.strategicGoals },
    { icon: <TrendingUp className="h-4 w-4 text-green-500" />, label: "Business Priorities", value: context.businessPriorities },
    { icon: <Cpu className="h-4 w-4 text-amber-500" />, label: "Strategic Initiative", value: context.strategicInitiative },
    { icon: <Network className="h-4 w-4 text-teal-500" />, label: "Value Chain", value: context.valueChain },
    { icon: <DollarSign className="h-4 w-4 text-emerald-500" />, label: "Revenue Model", value: context.revenueModel },
  ].filter((s) => s.value && s.value.trim().length > 0);

  if (sections.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          AI-Generated Business Context
        </CardTitle>
        <CardDescription>
          Automatically derived from business name and configuration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {sections.map((s) => (
            <div key={s.label} className="rounded-md border bg-muted/30 p-3">
              <div className="mb-1 flex items-center gap-2">
                {s.icon}
                <p className="text-xs font-semibold text-muted-foreground">
                  {s.label}
                </p>
              </div>
              <p className="text-sm leading-relaxed">{s.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Industry Coverage Analysis
// ---------------------------------------------------------------------------

interface PriorityCoverage {
  priority: StrategicPriority;
  objective: string;
  matchedUseCases: UseCase[];
  coverageRatio: number;
}

function computeIndustryCoverage(
  industry: IndustryOutcome,
  useCases: UseCase[]
): {
  priorities: PriorityCoverage[];
  overallCoverage: number;
  totalRefUseCases: number;
  coveredRefUseCases: number;
} {
  const priorities: PriorityCoverage[] = [];
  let totalRef = 0;
  let coveredRef = 0;

  const ucNameWords = useCases.map((uc) => ({
    uc,
    words: new Set(
      (uc.name + " " + uc.statement)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    ),
  }));

  for (const objective of industry.objectives) {
    for (const priority of objective.priorities) {
      const matched: UseCase[] = [];

      for (const refUc of priority.useCases) {
        totalRef++;
        const refWords = new Set(
          (refUc.name + " " + refUc.description)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 3)
        );

        // Match if generated use case shares meaningful keywords with reference
        let bestMatch: UseCase | null = null;
        let bestOverlap = 0;
        for (const { uc, words } of ucNameWords) {
          const overlap = [...refWords].filter((w) => words.has(w)).length;
          const overlapRatio = overlap / Math.max(refWords.size, 1);
          if (overlapRatio > bestOverlap && overlapRatio >= 0.25) {
            bestOverlap = overlapRatio;
            bestMatch = uc;
          }
        }
        if (bestMatch && !matched.includes(bestMatch)) {
          matched.push(bestMatch);
          coveredRef++;
        }
      }

      priorities.push({
        priority,
        objective: objective.name,
        matchedUseCases: matched,
        coverageRatio:
          priority.useCases.length > 0
            ? matched.length / priority.useCases.length
            : 0,
      });
    }
  }

  return {
    priorities,
    overallCoverage: totalRef > 0 ? coveredRef / totalRef : 0,
    totalRefUseCases: totalRef,
    coveredRefUseCases: coveredRef,
  };
}

function IndustryCoverageCard({
  industryId,
  useCases,
}: {
  industryId: string;
  useCases: UseCase[];
}) {
  const { getOutcome } = useIndustryOutcomes();
  const industry = getOutcome(industryId);
  if (!industry) return null;

  const coverage = computeIndustryCoverage(industry, useCases);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Eye className="h-4 w-4 text-violet-500" />
          Industry Outcome Map Coverage ({industry.name})
        </CardTitle>
        <CardDescription>
          Comparison of generated use cases against{" "}
          {coverage.totalRefUseCases} reference use cases from the{" "}
          {industry.name} outcome map
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall coverage */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Progress
              value={Math.round(coverage.overallCoverage * 100)}
              className="h-3"
            />
          </div>
          <span className="min-w-[60px] text-right text-sm font-semibold">
            {Math.round(coverage.overallCoverage * 100)}% covered
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {coverage.coveredRefUseCases} of {coverage.totalRefUseCases}{" "}
          reference use cases have matching generated use cases
        </p>

        <Separator />

        {/* Per-priority breakdown */}
        <div className="space-y-3">
          {coverage.priorities.map((pc) => {
            const pctCovered = Math.round(pc.coverageRatio * 100);
            const statusColor =
              pctCovered >= 75
                ? "text-green-600 dark:text-green-400"
                : pctCovered >= 25
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-red-600 dark:text-red-400";

            return (
              <div key={`${pc.objective}-${pc.priority.name}`} className="rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{pc.priority.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {pc.objective} &middot;{" "}
                      {pc.priority.useCases.length} reference use cases
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={statusColor}
                  >
                    {pctCovered}%
                  </Badge>
                </div>
                {pc.matchedUseCases.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {pc.matchedUseCases.map((uc) => (
                      <Badge key={uc.id} variant="secondary" className="text-xs">
                        {uc.name}
                      </Badge>
                    ))}
                  </div>
                )}
                {pc.matchedUseCases.length === 0 && (
                  <p className="mt-1 text-xs text-muted-foreground italic">
                    No matching use cases generated -- consider adding relevant
                    data sources for this area
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function AIObservabilityTab({
  logs,
  stats,
  loading,
  stepLog,
}: {
  logs: PromptLogEntry[];
  stats: PromptLogStats | null;
  loading: boolean;
  stepLog: StepLogEntry[];
}) {
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <p className="text-muted-foreground">
            No prompt logs available for this run. Logs are captured
            automatically for runs executed after the audit logging feature was
            enabled.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Group logs by step
  const stepGroups: Record<string, PromptLogEntry[]> = {};
  for (const log of logs) {
    if (!stepGroups[log.step]) stepGroups[log.step] = [];
    stepGroups[log.step].push(log);
  }

  return (
    <>
      {/* Stats Summary */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <p className="text-xs text-muted-foreground">Total LLM Calls</p>
              </div>
              <p className="mt-1 text-2xl font-bold">{stats.totalCalls}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <p className="text-xs text-muted-foreground">Success Rate</p>
              </div>
              <p className="mt-1 text-2xl font-bold">
                {stats.totalCalls > 0
                  ? `${Math.round((stats.successCount / stats.totalCalls) * 100)}%`
                  : "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <p className="text-xs text-muted-foreground">Failures</p>
              </div>
              <p className="mt-1 text-2xl font-bold">{stats.failureCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                <p className="text-xs text-muted-foreground">Avg Duration</p>
              </div>
              <p className="mt-1 text-2xl font-bold">
                {stats.avgDurationMs > 0
                  ? `${(stats.avgDurationMs / 1000).toFixed(1)}s`
                  : "N/A"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-violet-500" />
                <p className="text-xs text-muted-foreground">Total Duration</p>
              </div>
              <p className="mt-1 text-2xl font-bold">
                {stats.totalDurationMs > 0
                  ? `${Math.round(stats.totalDurationMs / 1000)}s`
                  : "N/A"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step Duration Chart */}
      {stepLog.length > 0 && <StepDurationChart steps={stepLog} />}

      {/* Prompt Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            LLM Call Log ({logs.length} calls)
          </CardTitle>
          <CardDescription>
            Every AI query call with prompt, response, timing, and honesty
            scores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Object.entries(stepGroups).map(([step, stepLogs]) => (
              <div key={step}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {step} ({stepLogs.length} calls)
                </p>
                <div className="space-y-1">
                  {stepLogs.map((log) => (
                    <div key={log.logId} className="rounded-md border">
                      <button
                        className="flex w-full items-center justify-between p-3 text-left transition-colors hover:bg-muted/50"
                        onClick={() =>
                          setExpandedLog(
                            expandedLog === log.logId ? null : log.logId
                          )
                        }
                      >
                        <div className="flex items-center gap-3">
                          {log.success ? (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                          )}
                          <div>
                            <p className="text-sm font-medium">
                              {log.promptKey}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {log.model} &middot; temp {log.temperature}
                              {log.durationMs != null &&
                                ` \u2022 ${(log.durationMs / 1000).toFixed(1)}s`}
                              {log.honestyScore != null &&
                                ` \u2022 honesty: ${Math.round(log.honestyScore * 100)}%`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {log.honestyScore != null && (
                            <Badge
                              variant="outline"
                              className={
                                log.honestyScore >= 0.7
                                  ? "border-green-200 text-green-700"
                                  : log.honestyScore >= 0.3
                                    ? "border-amber-200 text-amber-700"
                                    : "border-red-200 text-red-700"
                              }
                            >
                              {Math.round(log.honestyScore * 100)}%
                            </Badge>
                          )}
                          {expandedLog === log.logId ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </button>
                      {expandedLog === log.logId && (
                        <div className="border-t p-3 text-xs">
                          <div className="space-y-3">
                            <div>
                              <p className="mb-1 font-semibold text-muted-foreground">
                                Rendered Prompt
                              </p>
                              <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 font-mono leading-relaxed">
                                {log.renderedPrompt.length > 2000
                                  ? log.renderedPrompt.slice(0, 2000) + "\n... (truncated)"
                                  : log.renderedPrompt}
                              </pre>
                            </div>
                            {log.rawResponse && (
                              <div>
                                <p className="mb-1 font-semibold text-muted-foreground">
                                  Raw Response
                                </p>
                                <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 font-mono leading-relaxed">
                                  {log.rawResponse.length > 2000
                                    ? log.rawResponse.slice(0, 2000) + "\n... (truncated)"
                                    : log.rawResponse}
                                </pre>
                              </div>
                            )}
                            {log.errorMessage && (
                              <div>
                                <p className="mb-1 font-semibold text-destructive">
                                  Error
                                </p>
                                <p className="text-destructive">
                                  {log.errorMessage}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <Separator className="my-3" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

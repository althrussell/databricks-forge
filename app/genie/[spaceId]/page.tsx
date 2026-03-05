"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Info,
  Lightbulb,
  Loader2,
  Shield,
  Sparkles,
  Table2,
  BarChart3,
  MessageSquare,
  Link2,
  Wrench,
  XCircle,
  AlertTriangle,
  FlaskConical,
  Settings,
  Activity,
} from "lucide-react";
import { SpaceConfigViewer } from "@/components/genie/space-config-viewer";
import { OptimizationReview } from "@/components/genie/optimization-review";
import type { SerializedSpace } from "@/lib/genie/types";
import type { SpaceHealthReport } from "@/lib/genie/health-checks/types";
import type { SpaceMetadata } from "@/lib/genie/space-metadata";

interface SpaceDetail {
  spaceId: string;
  title: string;
  description: string;
  domain: string | null;
  runId: string | null;
  status: string;
  source: string;
  serializedSpace: string;
  metadata: SpaceMetadata | null;
  healthReport: SpaceHealthReport | null;
}

interface FixResult {
  updatedSerializedSpace: string;
  changes: Array<{
    section: string;
    description: string;
    added: number;
    modified: number;
  }>;
  strategiesRun: string[];
  originalSerializedSpace?: string;
}

export default function SpaceDetailPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<SpaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [databricksHost, setDatabricksHost] = useState("");
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState<FixResult | null>(null);
  const [cloning, setCloning] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/detail`);
      if (!res.ok) throw new Error("Failed to load space details");
      const data: SpaceDetail = await res.json();
      setDetail(data);
    } catch {
      toast.error("Failed to load space details");
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchDetail();
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.host) setDatabricksHost(d.host.replace(/\/$/, ""));
      })
      .catch(() => {});
  }, [fetchDetail]);

  const handleFix = async (checkIds: string[]) => {
    setFixing(true);
    setFixResult(null);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checks: checkIds }),
      });
      if (!res.ok) throw new Error("Fix failed");
      const data: FixResult = await res.json();
      setFixResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Fix failed");
    } finally {
      setFixing(false);
    }
  };

  const handleApply = async (serializedSpace: string) => {
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serializedSpace }),
      });
      if (!res.ok) throw new Error("Apply failed");
      toast.success("Changes applied successfully");
      setFixResult(null);
      fetchDetail();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    }
  };

  const handleCloneAndApply = async (serializedSpace: string) => {
    setCloning(true);
    try {
      const cloneRes = await fetch(`/api/genie-spaces/${spaceId}/clone`, {
        method: "POST",
      });
      if (!cloneRes.ok) throw new Error("Clone failed");
      const { clonedSpaceId } = await cloneRes.json();

      const applyRes = await fetch(`/api/genie-spaces/${clonedSpaceId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serializedSpace }),
      });
      if (!applyRes.ok) throw new Error("Apply to clone failed");

      toast.success("Cloned and applied changes");
      setFixResult(null);
      router.push(`/genie/${clonedSpaceId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone and apply failed");
    } finally {
      setCloning(false);
    }
  };

  const handleClone = async () => {
    setCloning(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/clone`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Clone failed");
      const { clonedSpaceId, title } = await res.json();
      toast.success(`Cloned as "${title}"`);
      router.push(`/genie/${clonedSpaceId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone failed");
    } finally {
      setCloning(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/genie">
            <ArrowLeft className="mr-1 size-4" />
            Back to Genie Spaces
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Space not found or inaccessible.</p>
      </div>
    );
  }

  const parsed: SerializedSpace | null = (() => {
    try {
      return JSON.parse(detail.serializedSpace) as SerializedSpace;
    } catch {
      return null;
    }
  })();

  const genieUrl = databricksHost
    ? `${databricksHost}/genie/rooms/${spaceId}`
    : "";

  // If a fix result is pending review, show the optimization review
  if (fixResult) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setFixResult(null)}>
            <ArrowLeft className="mr-1 size-4" />
            Back to Space
          </Button>
        </div>
        <OptimizationReview
          changes={fixResult.changes}
          strategiesRun={fixResult.strategiesRun}
          currentSerializedSpace={detail.serializedSpace}
          updatedSerializedSpace={fixResult.updatedSerializedSpace}
          onApply={handleApply}
          onCloneAndApply={handleCloneAndApply}
          onCancel={() => setFixResult(null)}
          applying={false}
          cloning={cloning}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/genie">
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{detail.title}</h1>
          {detail.description && (
            <p className="mt-1 text-sm text-muted-foreground">{detail.description}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {detail.healthReport && (
            <HealthGradeInline report={detail.healthReport} />
          )}
          <Badge variant={detail.source === "pipeline" ? "secondary" : "outline"} className="text-xs">
            {detail.source === "pipeline" ? "Pipeline" : "Workspace"}
          </Badge>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">
            <Activity className="mr-1.5 size-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="configuration">
            <Settings className="mr-1.5 size-4" />
            Configuration
          </TabsTrigger>
          <TabsTrigger value="health">
            <Shield className="mr-1.5 size-4" />
            Health
          </TabsTrigger>
          <TabsTrigger value="benchmarks">
            <FlaskConical className="mr-1.5 size-4" />
            Benchmarks
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Key Stats */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Space Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  <StatItem icon={Table2} label="Tables" value={detail.metadata?.tableCount ?? 0} />
                  <StatItem icon={BarChart3} label="Measures" value={detail.metadata?.measureCount ?? 0} />
                  <StatItem icon={MessageSquare} label="Sample Questions" value={detail.metadata?.sampleQuestionCount ?? 0} />
                  <StatItem icon={Link2} label="Filters" value={detail.metadata?.filterCount ?? 0} />
                  <StatItem icon={Sparkles} label="Joins" value={detail.metadata?.joinCount ?? 0} />
                  <StatItem icon={FlaskConical} label="Benchmarks" value={detail.metadata?.benchmarkCount ?? 0} />
                </div>
              </CardContent>
            </Card>

            {/* Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {detail.domain && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Domain</span>
                    <span>{detail.domain}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Space ID</span>
                  <code className="text-xs">{spaceId}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant="outline" className="text-xs">{detail.status}</Badge>
                </div>
                {detail.metadata?.metricViewCount !== undefined && detail.metadata.metricViewCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Metric Views</span>
                    <span>{detail.metadata.metricViewCount}</span>
                  </div>
                )}
                {detail.metadata?.expressionCount !== undefined && detail.metadata.expressionCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expressions</span>
                    <span>{detail.metadata.expressionCount}</span>
                  </div>
                )}
                {detail.metadata?.exampleSqlCount !== undefined && detail.metadata.exampleSqlCount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Example SQLs</span>
                    <span>{detail.metadata.exampleSqlCount}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Actions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {genieUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={genieUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="mr-1.5 size-4" />
                      Open in Databricks
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" asChild>
                  <Link href={`/genie/${spaceId}/benchmarks`}>
                    <FlaskConical className="mr-1.5 size-4" />
                    Run Benchmarks
                  </Link>
                </Button>
                <Button size="sm" variant="outline" onClick={handleClone} disabled={cloning}>
                  {cloning ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Copy className="mr-1.5 size-4" />}
                  Clone
                </Button>
                {detail.runId && (
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/runs/${detail.runId}?tab=genie`}>View Run</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="configuration" className="mt-4">
          {parsed ? (
            <SpaceConfigViewer space={parsed} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Unable to parse space configuration.
            </p>
          )}
        </TabsContent>

        {/* Health Tab */}
        <TabsContent value="health" className="mt-4 space-y-6">
          {detail.healthReport ? (
            <InlineHealthReport
              report={detail.healthReport}
              spaceId={spaceId}
              onFix={handleFix}
              fixing={fixing}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Health report unavailable.
            </p>
          )}
        </TabsContent>

        {/* Benchmarks Tab */}
        <TabsContent value="benchmarks" className="mt-4">
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <FlaskConical className="mb-4 size-10 text-muted-foreground/50" />
              <h2 className="text-lg font-semibold">Benchmark Test Runner</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Run benchmark questions against this space to test accuracy.
              </p>
              <Button className="mt-4" asChild>
                <Link href={`/genie/${spaceId}/benchmarks`}>
                  <FlaskConical className="mr-2 size-4" />
                  Open Test Runner
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-4 text-muted-foreground" />
      <div>
        <div className="text-lg font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function HealthGradeInline({ report }: { report: SpaceHealthReport }) {
  const colorClass =
    report.grade === "A" || report.grade === "B"
      ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400"
      : report.grade === "C"
        ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400"
        : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400";

  return (
    <div
      className={`flex size-8 items-center justify-center rounded-full border text-sm font-bold ${colorClass}`}
      title={`Health: ${report.grade} (${report.overallScore}/100)`}
    >
      {report.grade}
    </div>
  );
}

function severityIcon(severity: string) {
  switch (severity) {
    case "critical":
      return <XCircle className="size-4 text-red-500" />;
    case "warning":
      return <AlertTriangle className="size-4 text-amber-500" />;
    case "info":
      return <Info className="size-4 text-blue-500" />;
    default:
      return null;
  }
}

function gradeBg(grade: string): string {
  switch (grade) {
    case "A":
    case "B":
      return "bg-green-100 dark:bg-green-900/30";
    case "C":
      return "bg-amber-100 dark:bg-amber-900/30";
    case "D":
    case "F":
      return "bg-red-100 dark:bg-red-900/30";
    default:
      return "bg-muted";
  }
}

function gradeColor(grade: string): string {
  switch (grade) {
    case "A":
    case "B":
      return "text-green-600";
    case "C":
      return "text-amber-600";
    case "D":
    case "F":
      return "text-red-600";
    default:
      return "text-muted-foreground";
  }
}

function InlineHealthReport({
  report,
  spaceId,
  onFix,
  fixing,
}: {
  report: SpaceHealthReport;
  spaceId: string;
  onFix: (checkIds: string[]) => void;
  fixing: boolean;
}) {
  const fixableChecks = report.checks.filter((c) => !c.passed && c.fixable);

  return (
    <div className="space-y-6">
      {/* Score header */}
      <div className={`flex items-center gap-4 rounded-lg p-4 ${gradeBg(report.grade)}`}>
        <div className={`text-4xl font-bold ${gradeColor(report.grade)}`}>
          {report.grade}
        </div>
        <div>
          <div className="text-2xl font-semibold">{report.overallScore}/100</div>
          <div className="text-sm text-muted-foreground">
            {report.fixableCount > 0 && (
              <span className="text-amber-600">
                {report.fixableCount} fixable issue{report.fixableCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Quick wins */}
      {report.quickWins.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <Lightbulb className="size-4 text-amber-500" />
            Quick Wins
          </h3>
          <ul className="space-y-1.5">
            {report.quickWins.map((qw, i) => (
              <li key={i} className="rounded border bg-muted/50 px-3 py-2 text-sm">
                {qw}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Fix All + Run Benchmarks */}
      <div className="flex gap-2">
        {fixableChecks.length > 0 && (
          <Button
            size="sm"
            onClick={() => onFix(fixableChecks.map((c) => c.id))}
            disabled={fixing}
          >
            {fixing ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Wrench className="mr-2 size-4" />}
            Fix All ({fixableChecks.length})
          </Button>
        )}
        <Button size="sm" variant="outline" asChild>
          <Link href={`/genie/${spaceId}/benchmarks`}>
            <FlaskConical className="mr-2 size-4" />
            Run Benchmarks
          </Link>
        </Button>
      </div>

      {/* Category breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Categories</h3>
        {Object.entries(report.categories).map(([catId, cat]) => (
          <div key={catId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{cat.label}</span>
              <span className="text-muted-foreground">
                {cat.passed}/{cat.total} ({cat.score}%)
              </span>
            </div>
            <Progress value={cat.score} className="h-2" />
          </div>
        ))}
      </div>

      {/* Individual checks */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium">All Checks</h3>
        {Object.entries(report.categories).map(([catId, cat]) => {
          const catChecks = report.checks.filter((c) => c.category === catId);
          if (catChecks.length === 0) return null;
          return (
            <div key={catId} className="space-y-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {cat.label}
              </h4>
              {catChecks.map((check) => (
                <div key={check.id} className="flex items-start gap-2 rounded border px-3 py-2">
                  {check.passed ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-500" />
                  ) : (
                    severityIcon(check.severity)
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{check.description}</div>
                    {check.detail && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{check.detail}</div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {!check.passed && check.fixable && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-xs"
                        onClick={() => onFix([check.id])}
                        disabled={fixing}
                      >
                        <Wrench className="mr-1 size-3" />
                        Fix
                      </Button>
                    )}
                    {!check.passed && (
                      <Badge
                        variant={check.severity === "critical" ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {check.severity}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

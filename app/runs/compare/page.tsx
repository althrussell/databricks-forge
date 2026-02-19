"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeftRight,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import type { PipelineRun } from "@/lib/domain/types";

interface RunSummary {
  run: PipelineRun;
  useCaseCount: number;
  avgScore: number;
  domains: string[];
  aiCount: number;
  statisticalCount: number;
}

interface CompareData {
  runA: RunSummary;
  runB: RunSummary;
  overlap: {
    sharedCount: number;
    uniqueACount: number;
    uniqueBCount: number;
    sharedNames: string[];
  };
}

export default function ComparePage() {
  return (
    <Suspense>
      <ComparePageInner />
    </Suspense>
  );
}

function ComparePageInner() {
  const searchParams = useSearchParams();
  const runAParam = searchParams.get("runA");
  const runBParam = searchParams.get("runB");

  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [runA, setRunA] = useState(runAParam ?? "");
  const [runB, setRunB] = useState(runBParam ?? "");
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [loading, setLoading] = useState(false);
  const [runsLoading, setRunsLoading] = useState(true);

  // Fetch available runs
  useEffect(() => {
    fetch("/api/runs?limit=100")
      .then((r) => r.json())
      .then((data) => {
        const completedRuns = (data.runs as PipelineRun[]).filter(
          (r) => r.status === "completed"
        );
        setRuns(completedRuns);
      })
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, []);

  const fetchComparison = useCallback(async () => {
    if (!runA || !runB || runA === runB) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/runs/compare?runA=${runA}&runB=${runB}`
      );
      if (res.ok) {
        const data = await res.json();
        setCompareData(data);
      }
    } catch {
      // handled silently
    } finally {
      setLoading(false);
    }
  }, [runA, runB]);

  useEffect(() => {
    if (runA && runB && runA !== runB) {
      fetchComparison();
    }
  }, [runA, runB, fetchComparison]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Compare Runs</h1>
          <p className="mt-1 text-muted-foreground">
            Side-by-side comparison of two discovery runs
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/runs">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Runs
          </Link>
        </Button>
      </div>

      {/* Run Selectors */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Run A
              </p>
              {runsLoading ? (
                <Skeleton className="h-10" />
              ) : (
                <Select value={runA} onValueChange={setRunA}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a run..." />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map((r) => (
                      <SelectItem key={r.runId} value={r.runId}>
                        {r.config.businessName} (
                        {new Date(r.createdAt).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <ArrowLeftRight className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1 min-w-[200px]">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Run B
              </p>
              {runsLoading ? (
                <Skeleton className="h-10" />
              ) : (
                <Select value={runB} onValueChange={setRunB}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a run..." />
                  </SelectTrigger>
                  <SelectContent>
                    {runs.map((r) => (
                      <SelectItem key={r.runId} value={r.runId}>
                        {r.config.businessName} (
                        {new Date(r.createdAt).toLocaleDateString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="space-y-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      )}

      {!loading && runA && runB && runA === runB && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              Please select two different runs to compare.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && compareData && (
        <>
          {/* Side-by-side metrics */}
          <div className="grid gap-4 md:grid-cols-2">
            <RunSummaryCard
              label="Run A"
              data={compareData.runA}
            />
            <RunSummaryCard
              label="Run B"
              data={compareData.runB}
            />
          </div>

          {/* Metric Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Metric Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <CompareRow
                  label="Use Cases"
                  valueA={compareData.runA.useCaseCount}
                  valueB={compareData.runB.useCaseCount}
                />
                <CompareRow
                  label="Avg Score"
                  valueA={compareData.runA.avgScore}
                  valueB={compareData.runB.avgScore}
                  suffix="%"
                />
                <CompareRow
                  label="Domains"
                  valueA={compareData.runA.domains.length}
                  valueB={compareData.runB.domains.length}
                />
                <CompareRow
                  label="AI Use Cases"
                  valueA={compareData.runA.aiCount}
                  valueB={compareData.runB.aiCount}
                />
                <CompareRow
                  label="Statistical Use Cases"
                  valueA={compareData.runA.statisticalCount}
                  valueB={compareData.runB.statisticalCount}
                />
              </div>
            </CardContent>
          </Card>

          {/* Overlap Analysis */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Use Case Overlap
              </CardTitle>
              <CardDescription>
                Matched by use case name (exact match)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="rounded-md border p-4">
                  <p className="text-2xl font-bold text-blue-600">
                    {compareData.overlap.uniqueACount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unique to Run A
                  </p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-2xl font-bold text-green-600">
                    {compareData.overlap.sharedCount}
                  </p>
                  <p className="text-xs text-muted-foreground">Shared</p>
                </div>
                <div className="rounded-md border p-4">
                  <p className="text-2xl font-bold text-violet-600">
                    {compareData.overlap.uniqueBCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Unique to Run B
                  </p>
                </div>
              </div>
              {compareData.overlap.sharedNames.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Shared Use Cases
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {compareData.overlap.sharedNames.map((name) => (
                      <Badge key={name} variant="secondary" className="text-xs">
                        {name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Config Diff */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">
                Configuration Differences
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <ConfigDiffRow
                  label="Business Name"
                  a={compareData.runA.run.config.businessName}
                  b={compareData.runB.run.config.businessName}
                />
                <ConfigDiffRow
                  label="UC Metadata"
                  a={compareData.runA.run.config.ucMetadata}
                  b={compareData.runB.run.config.ucMetadata}
                />
                <ConfigDiffRow
                  label="AI Model"
                  a={compareData.runA.run.config.aiModel}
                  b={compareData.runB.run.config.aiModel}
                />
                <ConfigDiffRow
                  label="Priorities"
                  a={compareData.runA.run.config.businessPriorities.join(", ")}
                  b={compareData.runB.run.config.businessPriorities.join(", ")}
                />
                <ConfigDiffRow
                  label="Languages"
                  a={compareData.runA.run.config.languages.join(", ")}
                  b={compareData.runB.run.config.languages.join(", ")}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunSummaryCard({
  label,
  data,
}: {
  label: string;
  data: RunSummary;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{label}</CardTitle>
          <Badge variant="secondary">{data.run.status}</Badge>
        </div>
        <CardDescription>
          <Link
            href={`/runs/${data.run.runId}`}
            className="hover:underline"
          >
            {data.run.config.businessName}
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-center">
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold">{data.useCaseCount}</p>
            <p className="text-[10px] text-muted-foreground">Use Cases</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold">{data.avgScore}%</p>
            <p className="text-[10px] text-muted-foreground">Avg Score</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold">{data.domains.length}</p>
            <p className="text-[10px] text-muted-foreground">Domains</p>
          </div>
          <div className="rounded-md bg-muted/50 p-2">
            <p className="text-lg font-bold">
              {data.aiCount}/{data.statisticalCount}
            </p>
            <p className="text-[10px] text-muted-foreground">AI/Stats</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CompareRow({
  label,
  valueA,
  valueB,
  suffix = "",
}: {
  label: string;
  valueA: number;
  valueB: number;
  suffix?: string;
}) {
  const diff = valueB - valueA;
  return (
    <div className="flex items-center justify-between rounded-md border p-2.5">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex items-center gap-4">
        <span className="text-sm font-mono">
          {valueA}
          {suffix}
        </span>
        <div className="flex items-center gap-1">
          {diff > 0 ? (
            <TrendingUp className="h-3.5 w-3.5 text-green-500" />
          ) : diff < 0 ? (
            <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <span
            className={`text-xs font-medium ${
              diff > 0
                ? "text-green-600"
                : diff < 0
                  ? "text-red-600"
                  : "text-muted-foreground"
            }`}
          >
            {diff > 0 ? `+${diff}` : diff === 0 ? "=" : diff}
          </span>
        </div>
        <span className="text-sm font-mono">
          {valueB}
          {suffix}
        </span>
      </div>
    </div>
  );
}

function ConfigDiffRow({
  label,
  a,
  b,
}: {
  label: string;
  a: string;
  b: string;
}) {
  const isDifferent = a !== b;
  return (
    <div
      className={`rounded-md border p-2.5 ${
        isDifferent ? "border-amber-300 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10" : ""
      }`}
    >
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        <p className="text-sm truncate">{a || "(empty)"}</p>
        <p className="text-sm truncate">{b || "(empty)"}</p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
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
import { RunProgress } from "@/components/pipeline/run-progress";
import { UseCaseTable } from "@/components/pipeline/use-case-table";
import { ExportToolbar } from "@/components/pipeline/export-toolbar";
import type { PipelineRun, UseCase, PipelineStep } from "@/lib/domain/types";

export default function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = use(params);
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [useCases, setUseCases] = useState<UseCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRun();

    // Poll while running
    const interval = setInterval(() => {
      if (run?.status === "running" || run?.status === "pending") {
        fetchRun();
      }
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, run?.status]);

  async function fetchRun() {
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error("Run not found");
      const data = await res.json();
      setRun(data.run);
      if (data.useCases) setUseCases(data.useCases);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }

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
              className={
                run.status === "completed"
                  ? "bg-green-100 text-green-800"
                  : run.status === "running"
                    ? "bg-blue-100 text-blue-800"
                    : run.status === "failed"
                      ? "bg-red-100 text-red-800"
                      : ""
              }
            >
              {STATUS_LABELS[run.status]}
            </Badge>
          </div>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {run.config.ucMetadata}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/runs">Back to Runs</Link>
        </Button>
      </div>

      {/* Progress */}
      {(run.status === "running" || run.status === "pending") && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pipeline Progress</CardTitle>
            <CardDescription>
              {run.currentStep
                ? `Currently: ${run.currentStep}`
                : "Waiting to start..."}
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
            />
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {run.status === "failed" && run.errorMessage && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">
              Pipeline Failed
            </CardTitle>
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

      {/* Results */}
      {run.status === "completed" && useCases.length > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4">
            <SummaryCard
              title="Total Use Cases"
              value={String(useCases.length)}
            />
            <SummaryCard
              title="Domains"
              value={String(
                new Set(useCases.map((uc) => uc.domain)).size
              )}
            />
            <SummaryCard
              title="AI Use Cases"
              value={String(
                useCases.filter((uc) => uc.type === "AI").length
              )}
            />
            <SummaryCard
              title="Avg Score"
              value={`${Math.round(
                (useCases.reduce(
                  (sum, uc) => sum + uc.overallScore,
                  0
                ) /
                  useCases.length) *
                  100
              )}%`}
            />
          </div>

          <Separator />

          {/* Export */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Export Results</h2>
            <ExportToolbar
              runId={run.runId}
              businessName={run.config.businessName}
            />
          </div>

          <Separator />

          {/* Use Case Table */}
          <div>
            <h2 className="mb-4 text-lg font-semibold">
              Discovered Use Cases
            </h2>
            <UseCaseTable useCases={useCases} />
          </div>
        </>
      )}

      {run.status === "completed" && useCases.length === 0 && (
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

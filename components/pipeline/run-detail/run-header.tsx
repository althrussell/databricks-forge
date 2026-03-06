"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExportToolbar } from "@/components/pipeline/export-toolbar";
import { Separator } from "@/components/ui/separator";
import { Copy, GitCompareArrows, ArrowLeft, Zap } from "lucide-react";
import type { PipelineRun } from "@/lib/domain/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
};

export function RunHeader({
  run,
  runId,
  scanId,
  hasFabricTag,
  onDuplicate,
  onOpenPbiDialog,
}: {
  run: PipelineRun;
  runId: string;
  scanId: string | null;
  hasFabricTag: boolean;
  onDuplicate: () => void;
  onOpenPbiDialog: () => void;
}) {
  const isCompleted = run.status === "completed";

  return (
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
              onClick={onDuplicate}
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
            {!hasFabricTag && (
              <Button variant="outline" size="sm" onClick={onOpenPbiDialog}>
                <Zap className="mr-1.5 h-3.5 w-3.5 text-violet-500" />
                Enrich with PBI
              </Button>
            )}
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
  );
}

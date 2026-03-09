"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExportToolbar } from "@/components/pipeline/export-toolbar";
import {
  Copy,
  GitCompareArrows,
  ArrowLeft,
  Zap,
  MoreHorizontal,
} from "lucide-react";
import type { PipelineRun } from "@/lib/domain/types";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
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
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/runs" className="hover:text-foreground transition-colors">
          Runs
        </Link>
        <span>/</span>
        <span className="text-foreground">Run Detail</span>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {run.config.businessName}
            </h1>
            <Badge variant="secondary" className={STATUS_STYLES[run.status] ?? ""}>
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

        <div className="flex shrink-0 items-center gap-2">
          {isCompleted && (
            <>
              <ExportToolbar
                runId={run.runId}
                businessName={run.config.businessName}
                scanId={scanId}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate Run
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href={`/runs/compare?run=${runId}`}>
                      <GitCompareArrows className="mr-2 h-4 w-4" />
                      Compare
                    </Link>
                  </DropdownMenuItem>
                  {!hasFabricTag && (
                    <DropdownMenuItem onClick={onOpenPbiDialog}>
                      <Zap className="mr-2 h-4 w-4 text-violet-500" />
                      Enrich with PBI
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
    </div>
  );
}

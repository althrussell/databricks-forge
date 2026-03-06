"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RunProgress } from "@/components/pipeline/run-progress";
import { Square, RotateCcw } from "lucide-react";
import type { PipelineRun, PipelineStep } from "@/lib/domain/types";

export function RunProgressCard({
  run,
  onCancel,
}: {
  run: PipelineRun;
  runId?: string;
  onCancel: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Pipeline Progress</CardTitle>
            <CardDescription>
              {run.statusMessage ??
                (run.currentStep ? `Currently: ${run.currentStep}` : "Waiting to start...")}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-amber-600 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/30"
            onClick={onCancel}
          >
            <Square className="mr-1 h-3.5 w-3.5" />
            Stop
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Progress value={run.progressPct} className="h-3" />
          <p className="mt-1 text-right text-sm text-muted-foreground">{run.progressPct}%</p>
        </div>
        <RunProgress
          currentStep={run.currentStep as PipelineStep}
          progressPct={run.progressPct}
          status={run.status}
          statusMessage={run.statusMessage ?? undefined}
          assetDiscoveryEnabled={run.config.assetDiscoveryEnabled}
        />
      </CardContent>
    </Card>
  );
}

export function RunFailedCard({
  run,
  onResume,
}: {
  run: PipelineRun;
  runId?: string;
  onResume: () => void;
}) {
  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-destructive">Pipeline Failed</CardTitle>
          <Button size="sm" onClick={onResume}>
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
          assetDiscoveryEnabled={run.config.assetDiscoveryEnabled}
        />
      </CardContent>
    </Card>
  );
}

export function RunCancelledCard({
  run,
  onResume,
}: {
  run: PipelineRun;
  runId?: string;
  onResume: () => void;
}) {
  return (
    <Card className="border-amber-500/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-amber-600">Pipeline Cancelled</CardTitle>
          <Button size="sm" onClick={onResume}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Resume Pipeline
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This pipeline was stopped by a user. You can resume it from the last successful step.
        </p>
        <div className="mt-4">
          <RunProgress
            currentStep={run.currentStep as PipelineStep}
            progressPct={run.progressPct}
            status={run.status}
            assetDiscoveryEnabled={run.config.assetDiscoveryEnabled}
          />
        </div>
      </CardContent>
    </Card>
  );
}

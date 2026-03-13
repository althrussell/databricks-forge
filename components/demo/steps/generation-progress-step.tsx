"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  Database,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { DataJobStatus } from "@/lib/demo/data-engine/types";
import type { TablePhase } from "@/lib/demo/types";

interface GenerationProgressStepProps {
  sessionId: string;
}

const PHASE_LABELS: Record<TablePhase, { label: string; icon: React.ReactNode }> = {
  pending: { label: "Pending", icon: <Clock className="h-3 w-3" /> },
  "generating-sql": {
    label: "Generating SQL",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
  },
  executing: { label: "Executing", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  retrying: { label: "Retrying", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  validating: { label: "Validating", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: "Done", icon: <CheckCircle2 className="h-3 w-3 text-green-500" /> },
  failed: { label: "Failed", icon: <AlertCircle className="h-3 w-3 text-destructive" /> },
};

export function GenerationProgressStep({ sessionId }: GenerationProgressStepProps) {
  const [status, setStatus] = useState<DataJobStatus | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/demo/generate/status?sessionId=${sessionId}`);
        const data: DataJobStatus = await resp.json();
        setStatus(data);

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // retry
      }
    }, 2_000);

    return () => clearInterval(interval);
  }, [sessionId]);

  if (!status) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Starting generation...</span>
      </div>
    );
  }

  if (status.status === "failed") {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-destructive font-medium">Generation failed</p>
        <p className="text-sm text-muted-foreground mt-1">{status.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-1">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{status.message}</span>
          <span className="text-xs text-muted-foreground">
            {status.completedTables}/{status.totalTables} tables
          </span>
        </div>
        <Progress value={status.percent} />
      </div>

      {status.tableStatuses.length > 0 && (
        <div className="space-y-1">
          {status.tableStatuses.map((table) => {
            const phaseInfo = PHASE_LABELS[table.phase];
            return (
              <div
                key={table.tableName}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-mono">{table.tableName}</span>
                </div>
                <div className="flex items-center gap-2">
                  {table.rowCount > 0 && (
                    <span className="text-xs text-muted-foreground">
                      {table.rowCount.toLocaleString()} rows
                    </span>
                  )}
                  <Badge variant={table.phase === "completed" ? "secondary" : table.phase === "failed" ? "destructive" : "outline"} className="gap-1">
                    {phaseInfo.icon}
                    {phaseInfo.label}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

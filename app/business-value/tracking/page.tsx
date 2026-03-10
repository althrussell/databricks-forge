"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import type { TrackingStage } from "@/lib/domain/types";

interface TrackingEntry {
  id: string;
  runId: string;
  useCaseId: string;
  stage: string;
  assignedOwner: string | null;
  updatedAt: string;
  run: { businessName: string };
}

interface TrackingResponse {
  byStage: Record<TrackingStage, number>;
  entries: TrackingEntry[];
}

const STAGES: { value: TrackingStage; label: string }[] = [
  { value: "discovered", label: "Discovered" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "delivered", label: "Delivered" },
  { value: "measured", label: "Measured" },
];

const STAGE_COLORS: Record<TrackingStage, string> = {
  discovered: "bg-muted text-muted-foreground",
  planned: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  delivered: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  measured: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
};

const PIPELINE_COLORS: Record<TrackingStage, string> = {
  discovered: "bg-muted text-muted-foreground",
  planned: "bg-blue-100 text-blue-900 dark:bg-blue-900/50 dark:text-blue-100",
  in_progress: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100",
  delivered: "bg-green-100 text-green-900 dark:bg-green-900/50 dark:text-green-100",
  measured: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100",
};

function truncateId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 8)}...`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function ValueTrackingPage() {
  const [data, setData] = useState<TrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/business-value/tracking");
      if (!res.ok) throw new Error("Failed to load tracking data");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tracking data");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleStageChange = async (runId: string, useCaseId: string, stage: TrackingStage) => {
    const key = `${runId}:${useCaseId}`;
    setUpdating((prev) => new Set(prev).add(key));
    try {
      const res = await fetch("/api/business-value/tracking", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, useCaseId, stage }),
      });
      if (!res.ok) throw new Error("Failed to update stage");
      await fetchData();
    } catch {
      setError("Failed to update stage");
    } finally {
      setUpdating((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-8">
        <div>
          <Skeleton className="mb-1 h-8 w-48" />
          <Skeleton className="h-5 w-80" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>

        <Skeleton className="h-20 w-full rounded-xl" />

        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-8">
        <PageHeader
          title="Value Tracking"
          subtitle="Track use case implementation from discovery to measured value"
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" onClick={fetchData}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const byStage = data?.byStage ?? {
    discovered: 0,
    planned: 0,
    in_progress: 0,
    delivered: 0,
    measured: 0,
  };
  const entries = data?.entries ?? [];
  const plannedPlusInProgress = byStage.planned + byStage.in_progress;

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="Value Tracking"
        subtitle="Track use case implementation from discovery to measured value"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Discovered</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{byStage.discovered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Planned + In Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{plannedPlusInProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Delivered</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{byStage.delivered}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Measured</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{byStage.measured}</p>
          </CardContent>
        </Card>
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Stage Pipeline</h2>
        <div className="flex flex-wrap items-stretch gap-0 rounded-lg border bg-muted/30 overflow-hidden">
          {STAGES.map((s, i) => (
            <div
              key={s.value}
              className={`flex flex-1 min-w-[100px] flex-col items-center justify-center px-4 py-3 ${PIPELINE_COLORS[s.value as TrackingStage]} ${i < STAGES.length - 1 ? "border-r border-border/60" : ""}`}
            >
              <span className="text-xs font-medium opacity-90">{s.label}</span>
              <span className="text-lg font-bold">{byStage[s.value as TrackingStage] ?? 0}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Tracking Table</h2>
        {entries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CardDescription className="text-center">
                No use cases are being tracked yet. Run a discovery pipeline to begin.
              </CardDescription>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Use Case ID</TableHead>
                    <TableHead>Business Name</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Assigned Owner</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="w-[140px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const key = `${entry.runId}:${entry.useCaseId}`;
                    const isUpdating = updating.has(key);
                    const stage = entry.stage as TrackingStage;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs">
                          {truncateId(entry.useCaseId)}
                        </TableCell>
                        <TableCell>{entry.run?.businessName ?? "-"}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className={STAGE_COLORS[stage] ?? "bg-muted"}>
                            {STAGES.find((s) => s.value === stage)?.label ?? stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {entry.assignedOwner ?? "-"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(entry.updatedAt)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={stage}
                            onValueChange={(v) =>
                              handleStageChange(entry.runId, entry.useCaseId, v as TrackingStage)
                            }
                            disabled={isUpdating}
                          >
                            <SelectTrigger className="h-8 w-[130px]">
                              {isUpdating && (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              )}
                              <SelectValue placeholder="Change stage" />
                            </SelectTrigger>
                            <SelectContent>
                              {STAGES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>
                                  {s.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { PipelineRun } from "@/lib/domain/types";
import type {
  GenieSpaceRecommendation,
  TrackedGenieSpace,
} from "@/lib/genie/types";

// ---------------------------------------------------------------------------
// Icons (inline SVG, same pattern as sidebar-nav)
// ---------------------------------------------------------------------------

function GenieIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5-4 6.5V18H9v-2.5C6.5 14 5 12 5 9a7 7 0 0 1 7-7z" />
      <path d="M9 22h6" />
      <path d="M10 18v4" />
      <path d="M14 18v4" />
    </svg>
  );
}

function TableIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M3 15h18" />
      <path d="M9 3v18" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function GeniePage() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [recommendations, setRecommendations] = useState<GenieSpaceRecommendation[]>([]);
  const [tracked, setTracked] = useState<TrackedGenieSpace[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load completed runs
  useEffect(() => {
    async function loadRuns() {
      try {
        const res = await fetch("/api/runs");
        const data = await res.json();
        const completed = (data.runs ?? data ?? []).filter(
          (r: PipelineRun) => r.status === "completed"
        );
        setRuns(completed);
        if (completed.length > 0) {
          setSelectedRunId(completed[0].runId);
        }
      } catch {
        setError("Failed to load runs");
      } finally {
        setLoadingRuns(false);
      }
    }
    loadRuns();
  }, []);

  // Load recommendations when run is selected
  const loadRecommendations = useCallback(async (runId: string) => {
    if (!runId) return;
    setLoadingRecs(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/genie-recommendations`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load recommendations");
        setRecommendations([]);
        setTracked([]);
        return;
      }
      setRecommendations(data.recommendations ?? []);
      setTracked(data.tracked ?? []);
    } catch {
      setError("Failed to load recommendations");
    } finally {
      setLoadingRecs(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRunId) loadRecommendations(selectedRunId);
  }, [selectedRunId, loadRecommendations]);

  // Get tracking status for a domain
  function getTrackingForDomain(domain: string): TrackedGenieSpace | undefined {
    return tracked.find(
      (t) => t.domain === domain && t.status !== "trashed"
    );
  }

  // Actions
  async function handleCreate(rec: GenieSpaceRecommendation) {
    setActionLoading(rec.domain);
    try {
      const res = await fetch("/api/genie-spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rec.title,
          description: rec.description,
          serializedSpace: rec.serializedSpace,
          runId: selectedRunId,
          domain: rec.domain,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRecommendations(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleUpdate(rec: GenieSpaceRecommendation) {
    const tracking = getTrackingForDomain(rec.domain);
    if (!tracking) return;
    setActionLoading(rec.domain);
    try {
      const res = await fetch(`/api/genie-spaces/${tracking.spaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: rec.title,
          description: rec.description,
          serializedSpace: rec.serializedSpace,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRecommendations(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleTrash(domain: string) {
    const tracking = getTrackingForDomain(domain);
    if (!tracking) return;
    setActionLoading(domain);
    try {
      const res = await fetch(`/api/genie-spaces/${tracking.spaceId}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await loadRecommendations(selectedRunId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trash failed");
    } finally {
      setActionLoading(null);
    }
  }

  const selectedRun = runs.find((r) => r.runId === selectedRunId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <GenieIcon className="h-7 w-7 text-violet-500" />
          <h1 className="text-2xl font-bold tracking-tight">Genie Spaces</h1>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          AI-recommended Genie Spaces based on your data domains and use cases.
          Each space comes pre-configured with tables, sample questions, SQL
          examples, join relationships, and knowledge store snippets.
        </p>
      </div>

      {/* Run Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Select a Completed Run</CardTitle>
          <CardDescription>
            Choose a pipeline run to generate Genie Space recommendations from
            its domains, tables, and use cases.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRuns ? (
            <Skeleton className="h-10 w-full max-w-md" />
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No completed runs found. Complete a pipeline run first.
            </p>
          ) : (
            <Select value={selectedRunId} onValueChange={setSelectedRunId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select a run..." />
              </SelectTrigger>
              <SelectContent>
                {runs.map((r) => (
                  <SelectItem key={r.runId} value={r.runId}>
                    {r.config.businessName} --{" "}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardContent>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loadingRecs && (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-10 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recommendations */}
      {!loadingRecs && recommendations.length > 0 && selectedRun && (
        <>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">
              {recommendations.length} Recommended Genie Space
              {recommendations.length !== 1 ? "s" : ""}
            </h2>
            <Badge variant="secondary">{selectedRun.config.businessName}</Badge>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {recommendations.map((rec) => (
              <RecommendationCard
                key={rec.domain}
                rec={rec}
                tracking={getTrackingForDomain(rec.domain)}
                loading={actionLoading === rec.domain}
                onCreate={() => handleCreate(rec)}
                onUpdate={() => handleUpdate(rec)}
                onTrash={() => handleTrash(rec.domain)}
                host={
                  typeof window !== "undefined"
                    ? ""
                    : ""
                }
              />
            ))}
          </div>
        </>
      )}

      {/* No recommendations */}
      {!loadingRecs && recommendations.length === 0 && selectedRunId && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <GenieIcon className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-sm text-muted-foreground">
              No recommendations available for this run.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommendation Card
// ---------------------------------------------------------------------------

function RecommendationCard({
  rec,
  tracking,
  loading,
  onCreate,
  onUpdate,
  onTrash,
}: {
  rec: GenieSpaceRecommendation;
  tracking?: TrackedGenieSpace;
  loading: boolean;
  onCreate: () => void;
  onUpdate: () => void;
  onTrash: () => void;
  host: string;
}) {
  const isCreated = tracking && tracking.status !== "trashed";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <GenieIcon className="h-4 w-4 shrink-0 text-violet-500" />
              <span className="truncate">{rec.domain}</span>
            </CardTitle>
            {rec.subdomains.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {rec.subdomains.slice(0, 5).map((sd) => (
                  <Badge key={sd} variant="outline" className="text-[10px]">
                    {sd}
                  </Badge>
                ))}
                {rec.subdomains.length > 5 && (
                  <Badge variant="outline" className="text-[10px]">
                    +{rec.subdomains.length - 5}
                  </Badge>
                )}
              </div>
            )}
          </div>
          {isCreated ? (
            <Badge className="shrink-0 bg-green-500/10 text-green-600">
              {tracking.status === "updated" ? "Updated" : "Created"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0">
              Not Created
            </Badge>
          )}
        </div>
        <CardDescription className="mt-2 text-xs">
          {rec.description}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
          <StatBadge icon={<TableIcon className="h-3 w-3" />} label="Tables" value={rec.tableCount} />
          <StatBadge label="Use Cases" value={rec.useCaseCount} />
          <StatBadge label="SQL Examples" value={rec.sqlExampleCount} />
          <StatBadge label="Joins" value={rec.joinCount} />
        </div>
        {(rec.metricViewCount > 0 || rec.measureCount > 0 || rec.filterCount > 0 || rec.dimensionCount > 0) && (
          <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
            <StatBadge label="Metric Views" value={rec.metricViewCount} />
            <StatBadge label="Measures" value={rec.measureCount} />
            <StatBadge label="Filters" value={rec.filterCount} />
            <StatBadge label="Dimensions" value={rec.dimensionCount} />
          </div>
        )}

        {/* Expandable detail */}
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="tables" className="border-b-0">
            <AccordionTrigger className="py-2 text-xs font-medium">
              Tables & Metric Views ({rec.tableCount + rec.metricViewCount})
            </AccordionTrigger>
            <AccordionContent>
              <div className="max-h-40 overflow-auto text-xs text-muted-foreground">
                {rec.tables.map((t) => (
                  <div key={t} className="truncate py-0.5 font-mono">
                    {t}
                  </div>
                ))}
                {rec.metricViews.map((mv) => (
                  <div key={mv} className="truncate py-0.5 font-mono text-violet-500">
                    {mv} (metric view)
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          {!isCreated ? (
            <Button
              size="sm"
              onClick={onCreate}
              disabled={loading}
              className="bg-green-600 hover:bg-green-700"
            >
              {loading ? "Creating..." : "Create Space"}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onUpdate}
                disabled={loading}
              >
                {loading ? "Updating..." : "Update"}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={loading}
                  >
                    Trash
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Trash Genie Space?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will move the &quot;{rec.title}&quot; Genie space to
                      trash. This action can be undone from the Databricks
                      workspace.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onTrash}>
                      Trash
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {tracking && (
                <Button size="sm" variant="ghost" asChild>
                  <a
                    href={`/genie-space/${tracking.spaceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1"
                  >
                    <ExternalLinkIcon className="h-3 w-3" />
                    Open
                  </a>
                </Button>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stat Badge
// ---------------------------------------------------------------------------

function StatBadge({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-md bg-muted/50 px-1.5 py-1">
      <div className="flex items-center justify-center gap-1">
        {icon}
        <span className="font-semibold">{value}</span>
      </div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

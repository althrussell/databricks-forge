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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { BrainCircuit, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type {
  GenieEngineRecommendation,
  MetricViewProposal,
  TrackedGenieSpace,
  SerializedSpace,
} from "@/lib/genie/types";
import type { UseCase } from "@/lib/domain/types";
import { GenieDeployModal } from "./genie-deploy-modal";

// ---------------------------------------------------------------------------
// Trash preview types
// ---------------------------------------------------------------------------

interface SharedAsset {
  fqn: string;
  usedBy: string[];
}

interface TrashPreview {
  assets: { functions: string[]; metricViews: string[] };
  shared: { functions: SharedAsset[]; metricViews: SharedAsset[] };
  safeToDelete: { functions: string[]; metricViews: string[] };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GenieSpacesTabProps {
  runId: string;
  /** Whether the Genie Engine is currently generating. */
  generating?: boolean;
  /** Domain names that the engine has finished processing so far. */
  completedDomainNames?: string[];
  /** Incremented when the engine completes; triggers a data refetch. */
  refreshKey?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenieSpacesTab({
  runId,
  generating: engineGenerating = false,
  completedDomainNames = [],
  refreshKey = 0,
}: GenieSpacesTabProps) {
  const [recommendations, setRecommendations] = useState<
    GenieEngineRecommendation[]
  >([]);
  const [tracked, setTracked] = useState<TrackedGenieSpace[]>([]);
  const [databricksHost, setDatabricksHost] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Detail sheet
  const [detailDomain, setDetailDomain] = useState<string | null>(null);

  // Deploy state

  // Trash flow state
  const [trashingDomain, setTrashingDomain] = useState<string | null>(null);
  const [trashDialogOpen, setTrashDialogOpen] = useState(false);
  const [trashDialogDomain, setTrashDialogDomain] = useState<string | null>(null);
  const [trashPreview, setTrashPreview] = useState<TrashPreview | null>(null);
  const [trashPreviewLoading, setTrashPreviewLoading] = useState(false);
  const [dropAssetsChecked, setDropAssetsChecked] = useState(true);

  // Test Space state
  const [testingDomain, setTestingDomain] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    { question: string; status: string; sql?: string; error?: string }[] | null
  >(null);


  // Deploy modal state
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployModalDomains, setDeployModalDomains] = useState<
    GenieEngineRecommendation[]
  >([]);

  // Per-domain regeneration state
  const [regeneratingDomain, setRegeneratingDomain] = useState<string | null>(null);

  // Use cases for detail sheet (lazy-loaded per domain, cached)
  const [detailUseCases, setDetailUseCases] = useState<UseCase[]>([]);
  const [useCaseCache, setUseCaseCache] = useState<Map<string, UseCase[]>>(new Map());
  const [loadingUseCases, setLoadingUseCases] = useState(false);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchRecommendations = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/genie-recommendations`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load Genie recommendations");
        return;
      }
      setRecommendations(data.recommendations ?? []);
      setTracked(data.tracked ?? []);
      if (data.databricksHost) setDatabricksHost(data.databricksHost);
    } catch {
      setError("Failed to load Genie recommendations");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // Re-fetch when the engine completes (refreshKey increments from parent)
  useEffect(() => {
    if (refreshKey > 0) {
      fetchRecommendations();
    }
  }, [refreshKey, fetchRecommendations]);

  useEffect(() => {
    if (!detailDomain) {
      setDetailUseCases([]);
      return;
    }
    const cached = useCaseCache.get(detailDomain);
    if (cached) {
      setDetailUseCases(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingUseCases(true);
      try {
        const res = await fetch(`/api/runs/${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const all: UseCase[] = data.useCases ?? [];
        const filtered = all.filter((uc) => uc.domain === detailDomain);
        setUseCaseCache((prev) => new Map(prev).set(detailDomain, filtered));
        setDetailUseCases(filtered);
      } catch {
        /* non-critical */
      } finally {
        if (!cancelled) setLoadingUseCases(false);
      }
    })();
    return () => { cancelled = true; };
  }, [detailDomain, runId, useCaseCache]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function getTracking(domain: string): TrackedGenieSpace | undefined {
    return tracked.find((t) => t.domain === domain && t.status !== "trashed");
  }

  function isDeployed(domain: string): boolean {
    return !!getTracking(domain);
  }

  function genieSpaceUrl(spaceId: string): string | null {
    if (!databricksHost) return null;
    const host = databricksHost.replace(/\/$/, "");
    return `${host}/genie/rooms/${spaceId}`;
  }

  // Selectable = not already deployed AND has at least one table
  const selectableDomains = recommendations
    .filter((r) => !isDeployed(r.domain) && r.tableCount > 0)
    .map((r) => r.domain);

  const allSelected =
    selectableDomains.length > 0 &&
    selectableDomains.every((d) => selected.has(d));

  function toggleSelect(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectableDomains));
    }
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  function handleBulkDeploy() {
    const toDeploy = recommendations.filter(
      (r) => selected.has(r.domain) && !isDeployed(r.domain)
    );
    if (toDeploy.length === 0) return;
    setDeployModalDomains(toDeploy);
    setDeployModalOpen(true);
  }

  function handleDeployModalComplete() {
    setSelected(new Set());
    setDeployModalOpen(false);
    fetchRecommendations();
  }

  async function openTrashDialog(domain: string) {
    const tracking = getTracking(domain);
    if (!tracking) return;

    setTrashDialogDomain(domain);
    setTrashPreview(null);
    setDropAssetsChecked(true);
    setTrashDialogOpen(true);
    setTrashPreviewLoading(true);

    try {
      const res = await fetch(`/api/genie-spaces/${tracking.spaceId}/trash-preview`);
      if (res.ok) {
        const data = (await res.json()) as TrashPreview;
        setTrashPreview(data);
      }
    } catch {
      // Non-fatal — user can still trash without asset cleanup
    } finally {
      setTrashPreviewLoading(false);
    }
  }

  async function executeTrash() {
    if (!trashDialogDomain) return;
    const tracking = getTracking(trashDialogDomain);
    if (!tracking) return;

    setTrashingDomain(trashDialogDomain);
    setTrashDialogOpen(false);

    try {
      const body: Record<string, unknown> = {};
      if (dropAssetsChecked && trashPreview) {
        body.dropAssets = true;
        body.assetsToDelete = trashPreview.safeToDelete;
      }

      const res = await fetch(`/api/genie-spaces/${tracking.spaceId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to trash space");
      }
      toast.success(`Trashed "${tracking.title}"`);
      await fetchRecommendations();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trash failed");
    } finally {
      setTrashingDomain(null);
      setTrashDialogDomain(null);
      setTrashPreview(null);
    }
  }

  async function handleTestSpace(domain: string) {
    const tracking = getTracking(domain);
    if (!tracking) return;

    const rec = recommendations.find((r) => r.domain === domain);
    if (!rec) return;

    let sampleQuestions: string[] = [];
    try {
      const parsed = JSON.parse(rec.serializedSpace) as SerializedSpace;
      sampleQuestions = parsed.config.sample_questions
        .slice(0, 5)
        .map((q) => q.question.join(" "));
    } catch { /* use empty */ }

    if (sampleQuestions.length === 0) {
      toast.error("No sample questions available to test");
      return;
    }

    setTestingDomain(domain);
    setTestResults(null);

    try {
      const res = await fetch(
        `/api/runs/${runId}/genie-engine/${encodeURIComponent(domain)}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spaceId: tracking.spaceId,
            questions: sampleQuestions,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Test failed");
        return;
      }
      setTestResults(data.results);
      toast.success(
        `Test complete: ${data.summary.passed}/${data.summary.total} passed`
      );
    } catch {
      toast.error("Failed to test Genie Space");
    } finally {
      setTestingDomain(null);
    }
  }

  async function handleRegenerateDomain(domain: string) {
    setRegeneratingDomain(domain);
    try {
      const res = await fetch(`/api/runs/${runId}/genie-engine/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: [domain] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || "Failed to start regeneration");
        setRegeneratingDomain(null);
        return;
      }

      toast.info(`Regenerating "${domain}"...`);

      const poll = setInterval(async () => {
        try {
          const sr = await fetch(`/api/runs/${runId}/genie-engine/generate/status`);
          if (!sr.ok) return;
          const sd = await sr.json();
          if (sd.status === "completed") {
            clearInterval(poll);
            setRegeneratingDomain(null);
            toast.success(`"${domain}" regenerated`);
            await fetchRecommendations();
          } else if (sd.status === "failed") {
            clearInterval(poll);
            setRegeneratingDomain(null);
            toast.error(sd.error || `"${domain}" regeneration failed`);
          }
        } catch { /* retry */ }
      }, 2000);
    } catch {
      toast.error("Failed to start regeneration");
      setRegeneratingDomain(null);
    }
  }

  // -------------------------------------------------------------------------
  // Detail sheet data
  // -------------------------------------------------------------------------

  const detailRec = detailDomain
    ? recommendations.find((r) => r.domain === detailDomain) ?? null
    : null;

  const detailParsed: SerializedSpace | null = detailRec
    ? (() => {
        try {
          return JSON.parse(detailRec.serializedSpace) as SerializedSpace;
        } catch {
          return null;
        }
      })()
    : null;

  const detailMvProposals: MetricViewProposal[] = detailRec?.metricViewProposals
    ? (() => {
        try {
          const parsed = JSON.parse(detailRec.metricViewProposals);
          return Array.isArray(parsed) ? (parsed as MetricViewProposal[]) : [];
        } catch {
          return [];
        }
      })()
    : [];

  const detailTracking = detailDomain ? getTracking(detailDomain) : undefined;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <GenieIcon className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No Genie Space recommendations available for this run. This may be
            because the metadata snapshot was not cached.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <GenieIcon className="h-4 w-4 text-violet-500" />
            Recommended Genie Spaces ({recommendations.length})
          </CardTitle>
          <CardDescription>
            One space per business domain. Select spaces and deploy them to your
            Databricks workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleSelectAll}
                      disabled={selectableDomains.length === 0}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-2.5 text-left font-medium">Domain</th>
                  <th className="px-3 py-2.5 text-left font-medium">
                    Subdomains
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    Knowledge Store
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    Status
                  </th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {recommendations.map((rec) => {
                  const deployed = isDeployed(rec.domain);
                  const tracking = getTracking(rec.domain);

                  const noTables = rec.tableCount === 0;

                  return (
                    <tr
                      key={rec.domain}
                      className="cursor-pointer border-b transition-colors hover:bg-muted/30"
                      onClick={() => setDetailDomain(rec.domain)}
                    >
                      <td
                        className="px-4 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selected.has(rec.domain)}
                          onCheckedChange={() => toggleSelect(rec.domain)}
                          disabled={deployed || noTables}
                          aria-label={`Select ${rec.domain}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium">
                        <span className="flex items-center gap-1.5">
                          {rec.domain}
                          {engineGenerating && completedDomainNames.includes(rec.domain) && (
                            <BrainCircuit
                              className="h-3.5 w-3.5 text-violet-500"
                              aria-label="AI analysis complete"
                            />
                          )}
                          {engineGenerating && !completedDomainNames.includes(rec.domain) && (
                            <BrainCircuit
                              className="h-3.5 w-3.5 animate-pulse text-violet-400/50"
                              aria-label="AI analysis in progress"
                            />
                          )}
                          {!engineGenerating && completedDomainNames.includes(rec.domain) && (
                            <BrainCircuit
                              className="h-3.5 w-3.5 text-violet-500"
                              aria-label="AI enriched"
                            />
                          )}
                        </span>
                      </td>
                      <td className="max-w-[200px] px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {rec.subdomains.slice(0, 3).map((sd) => (
                            <Badge
                              key={sd}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {sd}
                            </Badge>
                          ))}
                          {rec.subdomains.length > 3 && (
                            <Badge variant="outline" className="text-[10px]">
                              +{rec.subdomains.length - 3}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {noTables ? (
                          <Badge variant="destructive" className="text-[10px]">
                            No Tables
                          </Badge>
                        ) : (
                          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                            <KSChip label="Tables" value={rec.tableCount} />
                            <KSChip label="Metric Views" value={rec.metricViewCount} accent="violet" />
                            <KSChip label="Use Cases" value={rec.useCaseCount} />
                            <KSChip label="SQL" value={rec.sqlExampleCount} />
                            <KSChip label="Measures" value={rec.measureCount} accent="blue" />
                            <KSChip label="Filters" value={rec.filterCount} accent="amber" />
                            <KSChip label="Dimensions" value={rec.dimensionCount} accent="emerald" />
                            <KSChip label="Joins" value={rec.joinCount} />
                            <KSChip label="Benchmarks" value={rec.benchmarkCount} accent="violet" />
                            <KSChip label="Instructions" value={rec.instructionCount} />
                            <KSChip label="Questions" value={rec.sampleQuestionCount} />
                            <KSChip label="Functions" value={rec.sqlFunctionCount} accent="blue" />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {deployed ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <Badge className="bg-green-500/10 text-green-600">
                              {tracking?.status === "updated"
                                ? "Updated"
                                : "Deployed"}
                            </Badge>
                            {tracking && genieSpaceUrl(tracking.spaceId) && (
                              <a
                                href={genieSpaceUrl(tracking.spaceId)!}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-violet-600 transition-colors hover:bg-violet-500/10"
                                title="Open in Databricks"
                              >
                                Open
                                <ExternalLinkIcon className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        ) : (
                          <Badge variant="secondary">Not Deployed</Badge>
                        )}
                      </td>
                      <td
                        className="px-3 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {deployed && (
                          <button
                            className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                            disabled={trashingDomain === rec.domain}
                            aria-label={`Trash ${rec.domain} space`}
                            onClick={() => openTrashDialog(rec.domain)}
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Floating action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-10 flex items-center justify-between rounded-lg border bg-background p-3 shadow-lg">
          <span className="text-sm font-medium">
            {selected.size} space{selected.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Deselect All
            </Button>
            <Button
              size="sm"
              onClick={handleBulkDeploy}
              className="bg-green-600 hover:bg-green-700"
            >
              Deploy Selected ({selected.size})
            </Button>
          </div>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet
        open={!!detailDomain}
        onOpenChange={(open) => {
          if (!open) setDetailDomain(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {detailRec && detailParsed && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <GenieIcon className="h-5 w-5 text-violet-500" />
                  {detailRec.domain}
                  {completedDomainNames.includes(detailRec.domain) && (
                    <BrainCircuit className="h-4 w-4 text-violet-500" aria-label="AI enriched" />
                  )}
                </SheetTitle>
                <SheetDescription>{detailRec.description}</SheetDescription>
                {detailTracking && (
                  <Badge className="mt-1 w-fit bg-green-500/10 text-green-600">
                    {detailTracking.status === "updated"
                      ? "Updated"
                      : "Deployed"}
                  </Badge>
                )}
              </SheetHeader>

              <div className="mt-6 space-y-5 px-4">
                {/* Stats */}
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <StatBadge label="Tables" value={detailRec.tableCount} />
                  <StatBadge
                    label="Metric Views"
                    value={detailRec.metricViewCount}
                  />
                  <StatBadge label="Use Cases" value={detailRec.useCaseCount} />
                  <StatBadge
                    label="SQL Examples"
                    value={detailRec.sqlExampleCount}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <StatBadge label="Joins" value={detailRec.joinCount} />
                  <StatBadge label="Measures" value={detailRec.measureCount} />
                  <StatBadge label="Filters" value={detailRec.filterCount} />
                  <StatBadge
                    label="Dimensions"
                    value={detailRec.dimensionCount}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
                  <StatBadge label="Benchmarks" value={detailRec.benchmarkCount} />
                  <StatBadge label="Instructions" value={detailRec.instructionCount} />
                  <StatBadge label="Questions" value={detailRec.sampleQuestionCount} />
                  <StatBadge label="Functions" value={detailRec.sqlFunctionCount} />
                </div>

                <Separator />

                {/* Expandable sections */}
                <Accordion
                  type="multiple"
                  defaultValue={["tables"]}
                  className="w-full"
                >
                  {/* Tables & Views */}
                  <AccordionItem value="tables">
                    <AccordionTrigger className="text-xs font-medium">
                      Tables &amp; Views ({detailRec.tableCount})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="max-h-48 space-y-0.5 overflow-auto text-xs">
                        {detailRec.tables.map((t) => (
                          <div key={t} className="truncate font-mono text-muted-foreground">
                            {t}
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Metric Views */}
                  {(detailRec.metricViews.length > 0 || detailMvProposals.length > 0 || (detailParsed.data_sources.metric_views && detailParsed.data_sources.metric_views.length > 0)) && (
                    <AccordionItem value="metric-views">
                      <AccordionTrigger className="text-xs font-medium">
                        Metric Views ({detailRec.metricViewCount})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="max-h-80 space-y-3 overflow-auto text-xs">
                          {detailMvProposals.length > 0 ? (
                            detailMvProposals.map((mv, i) => (
                              <div key={i} className="space-y-1.5 rounded border p-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono font-semibold text-violet-500">{mv.name}</span>
                                  <Badge
                                    variant="outline"
                                    className={
                                      mv.validationStatus === "valid"
                                        ? "border-green-500/50 text-green-600 text-[9px]"
                                        : mv.validationStatus === "warning"
                                          ? "border-amber-500/50 text-amber-600 text-[9px]"
                                          : "border-red-500/50 text-red-600 text-[9px]"
                                    }
                                  >
                                    {mv.validationStatus}
                                  </Badge>
                                </div>
                                {mv.description && (
                                  <p className="text-muted-foreground">{mv.description}</p>
                                )}
                                <div className="flex flex-wrap gap-1">
                                  {mv.sourceTables.map((t) => (
                                    <Badge key={t} variant="outline" className="font-mono text-[9px]">{t}</Badge>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {mv.hasJoins && <Badge className="bg-blue-500/10 text-blue-600 text-[9px]">joins</Badge>}
                                  {mv.hasFilteredMeasures && <Badge className="bg-amber-500/10 text-amber-600 text-[9px]">filtered</Badge>}
                                  {mv.hasWindowMeasures && <Badge className="bg-purple-500/10 text-purple-600 text-[9px]">window</Badge>}
                                  {mv.hasMaterialization && <Badge className="bg-emerald-500/10 text-emerald-600 text-[9px]">materialized</Badge>}
                                </div>
                                {mv.validationIssues && mv.validationIssues.length > 0 && (
                                  <div className={`rounded p-1.5 ${mv.validationStatus === "error" ? "bg-red-50 dark:bg-red-950/20" : "bg-amber-50 dark:bg-amber-950/20"}`}>
                                    <p className={`text-[10px] font-medium ${mv.validationStatus === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                                      {mv.validationStatus === "error" ? "Validation errors:" : "Validation issues:"}
                                    </p>
                                    {mv.validationIssues.map((issue: string, idx: number) => (
                                      <p key={idx} className={`text-[10px] ${mv.validationStatus === "error" ? "text-red-600 dark:text-red-500" : "text-amber-600 dark:text-amber-500"}`}>
                                        - {issue}
                                      </p>
                                    ))}
                                  </div>
                                )}
                                {mv.ddl && (
                                  <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[10px] font-mono leading-relaxed">
                                    {mv.ddl}
                                  </pre>
                                )}
                              </div>
                            ))
                          ) : detailParsed.data_sources.metric_views && detailParsed.data_sources.metric_views.length > 0 ? (
                            detailParsed.data_sources.metric_views.map((mv) => (
                              <div key={mv.identifier} className="space-y-0.5">
                                <span className="truncate font-mono text-violet-500">{mv.identifier}</span>
                                {mv.description && mv.description.length > 0 && (
                                  <p className="text-muted-foreground">{mv.description.join(" ")}</p>
                                )}
                              </div>
                            ))
                          ) : (
                            detailRec.metricViews.map((mv) => (
                              <div key={mv} className="truncate font-mono text-violet-500">
                                {mv}
                              </div>
                            ))
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Use Cases */}
                  {detailRec.useCaseCount > 0 && (
                    <AccordionItem value="usecases">
                      <AccordionTrigger className="text-xs font-medium">
                        Use Cases ({detailRec.useCaseCount})
                      </AccordionTrigger>
                      <AccordionContent>
                        {loadingUseCases ? (
                          <div className="space-y-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <Skeleton key={i} className="h-10 w-full" />
                            ))}
                          </div>
                        ) : detailUseCases.length > 0 ? (
                          <div className="max-h-72 space-y-2 overflow-auto">
                            {detailUseCases.map((uc) => (
                              <div key={uc.id} className="rounded border p-2 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium">{uc.name}</span>
                                  <Badge
                                    variant="outline"
                                    className={
                                      uc.type === "AI"
                                        ? "border-violet-500/50 text-violet-600 text-[9px]"
                                        : uc.type === "Geospatial"
                                          ? "border-emerald-500/50 text-emerald-600 text-[9px]"
                                          : "border-blue-500/50 text-blue-600 text-[9px]"
                                    }
                                  >
                                    {uc.type}
                                  </Badge>
                                  <span className="ml-auto text-[10px] font-medium tabular-nums text-muted-foreground">
                                    {Math.round(uc.overallScore)}%
                                  </span>
                                </div>
                                {uc.statement && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">{uc.statement}</p>
                                )}
                                {uc.tablesInvolved.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {uc.tablesInvolved.map((t) => (
                                      <Badge key={t} variant="outline" className="font-mono text-[9px]">{t}</Badge>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">No use case details available.</p>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Column enrichment info is now folded into table descriptions */}

                  {/* Sample Questions */}
                  {detailParsed.config.sample_questions.length > 0 && (
                    <AccordionItem value="questions">
                      <AccordionTrigger className="text-xs font-medium">
                        Sample Questions ({detailParsed.config.sample_questions.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          {detailParsed.config.sample_questions.map((q) => (
                            <li key={q.id}>{q.question.join(" ")}</li>
                          ))}
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* SQL Examples */}
                  {detailParsed.instructions.example_question_sqls.length > 0 && (
                    <AccordionItem value="sql">
                      <AccordionTrigger className="text-xs font-medium">
                        SQL Examples ({detailParsed.instructions.example_question_sqls.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="max-h-64 space-y-3 overflow-auto">
                          {detailParsed.instructions.example_question_sqls.map((ex) => (
                            <div key={ex.id}>
                              <p className="text-xs font-medium">{ex.question.join(" ")}</p>
                              <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[10px] font-mono leading-relaxed">
                                {ex.sql.join("\n")}
                              </pre>
                              {ex.usage_guidance && ex.usage_guidance.length > 0 && (
                                <p className="mt-1 text-[10px] text-muted-foreground italic">
                                  {ex.usage_guidance.join("; ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Measures */}
                  {detailParsed.instructions.sql_snippets.measures.length > 0 && (
                    <AccordionItem value="measures">
                      <AccordionTrigger className="text-xs font-medium">
                        Measures ({detailParsed.instructions.sql_snippets.measures.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-0.5 text-xs">
                          {detailParsed.instructions.sql_snippets.measures.map((m) => (
                            <div key={m.id} className="flex items-baseline gap-2 py-0.5">
                              <code className="rounded bg-muted px-1 font-mono text-[10px]">{m.alias}</code>
                              <span className="text-muted-foreground">{m.sql.join(" ")}</span>
                              {m.synonyms && m.synonyms.length > 0 && (
                                <span className="flex gap-0.5">
                                  {m.synonyms.map((s, si) => (
                                    <Badge key={si} variant="outline" className="text-[9px]">{s}</Badge>
                                  ))}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Filters */}
                  {detailParsed.instructions.sql_snippets.filters.length > 0 && (
                    <AccordionItem value="filters">
                      <AccordionTrigger className="text-xs font-medium">
                        Filters ({detailParsed.instructions.sql_snippets.filters.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-0.5 text-xs">
                          {detailParsed.instructions.sql_snippets.filters.map((f) => (
                            <div key={f.id} className="flex items-baseline gap-2 py-0.5">
                              <code className="rounded bg-muted px-1 font-mono text-[10px]">{f.display_name}</code>
                              <span className="text-muted-foreground">{f.sql.join(" ")}</span>
                              {f.synonyms && f.synonyms.length > 0 && (
                                <span className="flex gap-0.5">
                                  {f.synonyms.map((s, si) => (
                                    <Badge key={si} variant="outline" className="text-[9px]">{s}</Badge>
                                  ))}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Dimensions */}
                  {detailParsed.instructions.sql_snippets.expressions.length > 0 && (
                    <AccordionItem value="dimensions">
                      <AccordionTrigger className="text-xs font-medium">
                        Dimensions ({detailParsed.instructions.sql_snippets.expressions.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-0.5 text-xs">
                          {detailParsed.instructions.sql_snippets.expressions.map((e) => (
                            <div key={e.id} className="flex items-baseline gap-2 py-0.5">
                              <code className="rounded bg-muted px-1 font-mono text-[10px]">{e.alias}</code>
                              <span className="text-muted-foreground">{e.sql.join(" ")}</span>
                              {e.synonyms && e.synonyms.length > 0 && (
                                <span className="flex gap-0.5">
                                  {e.synonyms.map((s, si) => (
                                    <Badge key={si} variant="outline" className="text-[9px]">{s}</Badge>
                                  ))}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Join Relationships */}
                  {detailParsed.instructions.join_specs.length > 0 && (
                    <AccordionItem value="joins">
                      <AccordionTrigger className="text-xs font-medium">
                        Join Relationships ({detailParsed.instructions.join_specs.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-1 text-xs">
                          {detailParsed.instructions.join_specs.map((j) => {
                            const rtMatch = j.sql.find((s: string) => s.startsWith("--rt="))?.match(/--rt=FROM_RELATIONSHIP_TYPE_(\w+)--/);
                            const rt = rtMatch ? rtMatch[1].toLowerCase().replace(/_/g, " ") : null;
                            const sqlDisplay = j.sql.filter((s: string) => !s.startsWith("--rt=")).join(" ");
                            return (
                              <div key={j.id} className="flex items-baseline gap-2 py-0.5">
                                <span className="truncate font-mono text-muted-foreground">{sqlDisplay}</span>
                                {rt && (
                                  <Badge variant="outline" className="shrink-0 text-[9px]">{rt}</Badge>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* SQL Functions (Trusted Asset UDFs) */}
                  {detailParsed.instructions.sql_functions && detailParsed.instructions.sql_functions.length > 0 && (
                    <AccordionItem value="functions">
                      <AccordionTrigger className="text-xs font-medium">
                        SQL Functions ({detailParsed.instructions.sql_functions.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-0.5 text-xs font-mono text-muted-foreground">
                          {detailParsed.instructions.sql_functions.map((fn) => (
                            <div key={fn.id} className="truncate">{fn.identifier}</div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Text Instructions */}
                  {detailParsed.instructions.text_instructions.length > 0 && (
                    <AccordionItem value="instructions">
                      <AccordionTrigger className="text-xs font-medium">
                        Text Instructions ({detailParsed.instructions.text_instructions.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          {detailParsed.instructions.text_instructions.map((ti) => (
                            <p key={ti.id} className="whitespace-pre-line">{ti.content.join("\n")}</p>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Benchmarks */}
                  {detailParsed.benchmarks && detailParsed.benchmarks.questions.length > 0 && (
                    <AccordionItem value="benchmarks">
                      <AccordionTrigger className="text-xs font-medium">
                        Benchmarks ({detailParsed.benchmarks.questions.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="max-h-64 space-y-2 overflow-auto">
                          {detailParsed.benchmarks.questions.map((b) => (
                            <div key={b.id} className="rounded border p-2">
                              <p className="text-xs font-medium">{b.question.join(" ")}</p>
                              {b.answer && b.answer.length > 0 && (
                                <pre className="mt-1 rounded bg-muted/50 p-1 text-[10px] font-mono">
                                  {b.answer[0].content.join("\n")}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </div>

              {/* Test Results */}
              {testResults && detailDomain && (
                <div className="mt-4 space-y-2 px-4">
                  <Separator />
                  <h4 className="text-xs font-semibold">Test Results</h4>
                  {testResults.map((r, i) => (
                    <div key={i} className="rounded border p-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            r.status === "COMPLETED"
                              ? "bg-green-500/10 text-green-600"
                              : "bg-red-500/10 text-red-600"
                          }
                        >
                          {r.status === "COMPLETED" ? "Pass" : "Fail"}
                        </Badge>
                        <span className="text-xs">{r.question}</span>
                      </div>
                      {r.sql && (
                        <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/50 p-1.5 text-[10px] font-mono">
                          {r.sql}
                        </pre>
                      )}
                      {r.error && (
                        <p className="mt-1 text-[10px] text-destructive">
                          {r.error}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}


              {/* Footer actions */}
              <SheetFooter className="mt-6 flex-col gap-2 sm:flex-col">
                {detailTracking && genieSpaceUrl(detailTracking.spaceId) && (
                  <Button asChild className="w-full bg-violet-600 hover:bg-violet-700">
                    <a
                      href={genieSpaceUrl(detailTracking.spaceId)!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLinkIcon className="mr-2 h-4 w-4" />
                      Open in Databricks
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleRegenerateDomain(detailRec.domain)}
                  disabled={regeneratingDomain === detailRec.domain}
                >
                  {regeneratingDomain === detailRec.domain
                    ? "Regenerating..."
                    : "Regenerate Domain"}
                </Button>
                {detailTracking && (
                  <div className="flex w-full gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleTestSpace(detailRec.domain)}
                      disabled={testingDomain === detailRec.domain}
                    >
                      {testingDomain === detailRec.domain
                        ? "Testing..."
                        : "Test Space"}
                    </Button>
                  </div>
                )}
                {detailTracking ? (
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={trashingDomain === detailRec.domain}
                    onClick={() => {
                      setDetailDomain(null);
                      openTrashDialog(detailRec.domain);
                    }}
                  >
                    Delete Space
                  </Button>
                ) : detailRec.tableCount === 0 ? (
                  <Button className="w-full" variant="secondary" disabled>
                    Cannot Deploy — No Tables
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setDetailDomain(null);
                      setDeployModalDomains([detailRec]);
                      setDeployModalOpen(true);
                    }}
                  >
                    Deploy
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Trash Confirmation Dialog */}
      <AlertDialog open={trashDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setTrashDialogOpen(false);
          setTrashDialogDomain(null);
          setTrashPreview(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trash Genie Space?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the space to trash in Databricks.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {trashPreviewLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking deployed resources...
            </div>
          )}

          {!trashPreviewLoading && trashPreview && (
            <TrashPreviewSection
              preview={trashPreview}
              dropChecked={dropAssetsChecked}
              onDropCheckedChange={setDropAssetsChecked}
            />
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeTrash}
              disabled={trashPreviewLoading}
            >
              Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deploy Modal */}
      <GenieDeployModal
        open={deployModalOpen}
        onOpenChange={setDeployModalOpen}
        domains={deployModalDomains}
        runId={runId}
        onComplete={handleDeployModalComplete}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small sub-components
// ---------------------------------------------------------------------------

function StatBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-muted/50 px-1.5 py-1">
      <div className="font-semibold">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

const ACCENT_COLORS: Record<string, string> = {
  blue: "text-blue-500",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  violet: "text-violet-500",
};

function KSChip({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "blue" | "amber" | "emerald" | "violet";
}) {
  if (value === 0) return null;
  const valueColor = accent ? ACCENT_COLORS[accent] : "text-foreground";
  return (
    <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[10px]">
      <span className={`font-semibold ${valueColor}`}>{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

function TrashPreviewSection({
  preview,
  dropChecked,
  onDropCheckedChange,
}: {
  preview: TrashPreview;
  dropChecked: boolean;
  onDropCheckedChange: (v: boolean) => void;
}) {
  const hasSafe =
    preview.safeToDelete.functions.length > 0 ||
    preview.safeToDelete.metricViews.length > 0;
  const hasShared =
    preview.shared.functions.length > 0 ||
    preview.shared.metricViews.length > 0;
  const hasAny = hasSafe || hasShared;

  if (!hasAny) return null;

  return (
    <div className="space-y-3 text-sm">
      {hasSafe && (
        <div className="flex items-start gap-2">
          <Checkbox
            checked={dropChecked}
            onCheckedChange={(v) => onDropCheckedChange(v === true)}
            id="drop-assets"
            className="mt-0.5"
          />
          <label htmlFor="drop-assets" className="cursor-pointer leading-tight">
            Also delete deployed functions and metric views
          </label>
        </div>
      )}

      {hasSafe && dropChecked && (
        <div className="rounded border bg-destructive/5 p-2.5 space-y-1">
          <p className="text-xs font-medium text-destructive">
            Will be removed from Unity Catalog:
          </p>
          {preview.safeToDelete.functions.map((fqn) => (
            <p key={fqn} className="text-xs font-mono text-destructive/80 truncate">
              fn: {fqn}
            </p>
          ))}
          {preview.safeToDelete.metricViews.map((fqn) => (
            <p key={fqn} className="text-xs font-mono text-destructive/80 truncate">
              mv: {fqn}
            </p>
          ))}
        </div>
      )}

      {hasShared && (
        <div className="rounded border bg-amber-50 dark:bg-amber-950/20 p-2.5 space-y-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
            Shared with other spaces (will be kept):
          </p>
          {preview.shared.functions.map((s) => (
            <p key={s.fqn} className="text-xs font-mono text-amber-600 dark:text-amber-500 truncate">
              fn: {s.fqn} — used by {s.usedBy.join(", ")}
            </p>
          ))}
          {preview.shared.metricViews.map((s) => (
            <p key={s.fqn} className="text-xs font-mono text-amber-600 dark:text-amber-500 truncate">
              mv: {s.fqn} — used by {s.usedBy.join(", ")}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function GenieIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5-4 6.5V18H9v-2.5C6.5 14 5 12 5 9a7 7 0 0 1 7-7z" />
      <path d="M9 22h6" />
      <path d="M10 18v4" />
      <path d="M14 18v4" />
    </svg>
  );
}

function ExternalLinkIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

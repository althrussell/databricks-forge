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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import type {
  GenieSpaceRecommendation,
  TrackedGenieSpace,
  SerializedSpace,
} from "@/lib/genie/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GenieSpacesTabProps {
  runId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenieSpacesTab({ runId }: GenieSpacesTabProps) {
  const [recommendations, setRecommendations] = useState<
    GenieSpaceRecommendation[]
  >([]);
  const [tracked, setTracked] = useState<TrackedGenieSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selection state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Detail sheet
  const [detailDomain, setDetailDomain] = useState<string | null>(null);

  // Deploy state
  const [deploying, setDeploying] = useState(false);
  const [deployProgress, setDeployProgress] = useState<string | null>(null);

  // Trash loading
  const [trashingDomain, setTrashingDomain] = useState<string | null>(null);

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
    } catch {
      setError("Failed to load Genie recommendations");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function getTracking(domain: string): TrackedGenieSpace | undefined {
    return tracked.find((t) => t.domain === domain && t.status !== "trashed");
  }

  function isDeployed(domain: string): boolean {
    return !!getTracking(domain);
  }

  // Selectable = not already deployed
  const selectableDomains = recommendations
    .filter((r) => !isDeployed(r.domain))
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

  async function handleBulkDeploy() {
    const toDeploy = recommendations.filter(
      (r) => selected.has(r.domain) && !isDeployed(r.domain)
    );
    if (toDeploy.length === 0) return;

    setDeploying(true);
    let successCount = 0;
    let failCount = 0;
    const BATCH_SIZE = 3;

    for (let i = 0; i < toDeploy.length; i += BATCH_SIZE) {
      const batch = toDeploy.slice(i, i + BATCH_SIZE);
      setDeployProgress(
        `Deploying ${Math.min(i + BATCH_SIZE, toDeploy.length)} of ${toDeploy.length}...`
      );

      const results = await Promise.allSettled(
        batch.map(async (rec) => {
          const res = await fetch("/api/genie-spaces", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: rec.title,
              description: rec.description,
              serializedSpace: rec.serializedSpace,
              runId,
              domain: rec.domain,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(
              data.error || `Failed to create space for ${rec.domain}`
            );
          }
        })
      );

      for (const r of results) {
        if (r.status === "fulfilled") successCount++;
        else failCount++;
      }
    }

    setDeploying(false);
    setDeployProgress(null);
    setSelected(new Set());
    await fetchRecommendations();

    if (failCount === 0) {
      toast.success(
        `Successfully deployed ${successCount} Genie space${successCount !== 1 ? "s" : ""}`
      );
    } else {
      toast.warning(
        `Deployed ${successCount}, failed ${failCount} Genie space${failCount !== 1 ? "s" : ""}`
      );
    }
  }

  async function handleTrash(domain: string) {
    const tracking = getTracking(domain);
    if (!tracking) return;

    setTrashingDomain(domain);
    try {
      const res = await fetch(`/api/genie-spaces/${tracking.spaceId}`, {
        method: "DELETE",
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
                    Tables
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    Use Cases
                  </th>
                  <th className="px-3 py-2.5 text-center font-medium">
                    SQL Examples
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
                          disabled={deployed}
                          aria-label={`Select ${rec.domain}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium">{rec.domain}</td>
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
                      <td className="px-3 py-2.5 text-center">
                        {rec.tableCount}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {rec.useCaseCount}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {rec.sqlExampleCount}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {deployed ? (
                          <Badge className="bg-green-500/10 text-green-600">
                            {tracking?.status === "updated"
                              ? "Updated"
                              : "Deployed"}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Not Deployed</Badge>
                        )}
                      </td>
                      <td
                        className="px-3 py-2.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {deployed && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                disabled={trashingDomain === rec.domain}
                                aria-label={`Trash ${rec.domain} space`}
                              >
                                <TrashIcon className="h-4 w-4" />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Trash Genie Space?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will move the &quot;{rec.title}&quot;
                                  Genie space to trash. This can be undone from
                                  the Databricks workspace.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleTrash(rec.domain)}
                                >
                                  Trash
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
              disabled={deploying}
              className="bg-green-600 hover:bg-green-700"
            >
              {deploying
                ? deployProgress ?? "Deploying..."
                : `Deploy Selected (${selected.size})`}
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
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {detailRec && detailParsed && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <GenieIcon className="h-5 w-5 text-violet-500" />
                  {detailRec.domain}
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

              <div className="mt-6 space-y-5">
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

                <Separator />

                {/* Expandable sections */}
                <Accordion
                  type="multiple"
                  defaultValue={["tables"]}
                  className="w-full"
                >
                  {/* Tables & Metric Views */}
                  <AccordionItem value="tables">
                    <AccordionTrigger className="text-xs font-medium">
                      Tables & Metric Views (
                      {detailRec.tableCount + detailRec.metricViewCount})
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="max-h-48 space-y-0.5 overflow-auto text-xs">
                        {detailRec.tables.map((t) => (
                          <div
                            key={t}
                            className="truncate font-mono text-muted-foreground"
                          >
                            {t}
                          </div>
                        ))}
                        {detailRec.metricViews.map((mv) => (
                          <div
                            key={mv}
                            className="truncate font-mono text-violet-500"
                          >
                            {mv} (metric view)
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  {/* Sample Questions */}
                  {detailParsed.config.sample_questions.length > 0 && (
                    <AccordionItem value="questions">
                      <AccordionTrigger className="text-xs font-medium">
                        Sample Questions (
                        {detailParsed.config.sample_questions.length})
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
                  {detailParsed.instructions.example_question_sqls.length >
                    0 && (
                    <AccordionItem value="sql">
                      <AccordionTrigger className="text-xs font-medium">
                        SQL Examples (
                        {
                          detailParsed.instructions.example_question_sqls.length
                        }
                        )
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="max-h-64 space-y-3 overflow-auto">
                          {detailParsed.instructions.example_question_sqls.map(
                            (ex) => (
                              <div key={ex.id}>
                                <p className="text-xs font-medium">
                                  {ex.question.join(" ")}
                                </p>
                                <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted/50 p-2 text-[10px] font-mono leading-relaxed">
                                  {ex.sql.join("\n")}
                                </pre>
                              </div>
                            )
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Knowledge Store */}
                  {(detailParsed.instructions.sql_snippets.measures.length >
                    0 ||
                    detailParsed.instructions.sql_snippets.filters.length > 0 ||
                    detailParsed.instructions.sql_snippets.expressions.length >
                      0) && (
                    <AccordionItem value="knowledge">
                      <AccordionTrigger className="text-xs font-medium">
                        Knowledge Store (
                        {detailParsed.instructions.sql_snippets.measures.length +
                          detailParsed.instructions.sql_snippets.filters.length +
                          detailParsed.instructions.sql_snippets.expressions
                            .length}
                        )
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3 text-xs">
                          {detailParsed.instructions.sql_snippets.measures
                            .length > 0 && (
                            <div>
                              <p className="mb-1 font-semibold text-muted-foreground">
                                Measures
                              </p>
                              {detailParsed.instructions.sql_snippets.measures.map(
                                (m) => (
                                  <div
                                    key={m.id}
                                    className="flex items-baseline gap-2 py-0.5"
                                  >
                                    <code className="rounded bg-muted px-1 font-mono text-[10px]">
                                      {m.alias}
                                    </code>
                                    <span className="text-muted-foreground">
                                      {m.sql.join(" ")}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          {detailParsed.instructions.sql_snippets.filters
                            .length > 0 && (
                            <div>
                              <p className="mb-1 font-semibold text-muted-foreground">
                                Filters
                              </p>
                              {detailParsed.instructions.sql_snippets.filters.map(
                                (f) => (
                                  <div
                                    key={f.id}
                                    className="flex items-baseline gap-2 py-0.5"
                                  >
                                    <code className="rounded bg-muted px-1 font-mono text-[10px]">
                                      {f.display_name}
                                    </code>
                                    <span className="text-muted-foreground">
                                      {f.sql.join(" ")}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                          {detailParsed.instructions.sql_snippets.expressions
                            .length > 0 && (
                            <div>
                              <p className="mb-1 font-semibold text-muted-foreground">
                                Dimensions
                              </p>
                              {detailParsed.instructions.sql_snippets.expressions.map(
                                (e) => (
                                  <div
                                    key={e.id}
                                    className="flex items-baseline gap-2 py-0.5"
                                  >
                                    <code className="rounded bg-muted px-1 font-mono text-[10px]">
                                      {e.alias}
                                    </code>
                                    <span className="text-muted-foreground">
                                      {e.sql.join(" ")}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Join Relationships */}
                  {detailParsed.instructions.join_specs.length > 0 && (
                    <AccordionItem value="joins">
                      <AccordionTrigger className="text-xs font-medium">
                        Join Relationships (
                        {detailParsed.instructions.join_specs.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-1 text-xs font-mono text-muted-foreground">
                          {detailParsed.instructions.join_specs.map((j) => (
                            <div key={j.id} className="truncate">
                              {j.sql.join(" ")}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}

                  {/* Instructions */}
                  {detailParsed.instructions.text_instructions.length > 0 && (
                    <AccordionItem value="instructions">
                      <AccordionTrigger className="text-xs font-medium">
                        Instructions
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2 text-xs text-muted-foreground">
                          {detailParsed.instructions.text_instructions.map(
                            (ti) => (
                              <p key={ti.id} className="whitespace-pre-line">
                                {ti.content.join("\n")}
                              </p>
                            )
                          )}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  )}
                </Accordion>
              </div>

              {/* Footer actions */}
              <SheetFooter className="mt-6">
                {detailTracking ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" className="w-full">
                        Delete Space
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Trash Genie Space?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will move the &quot;{detailRec.title}&quot; Genie
                          space to trash. This can be undone from the Databricks
                          workspace.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            handleTrash(detailRec.domain);
                            setDetailDomain(null);
                          }}
                        >
                          Trash
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setSelected(
                        (prev) => new Set([...prev, detailRec.domain])
                      );
                      setDetailDomain(null);
                      toast.info(
                        `"${detailRec.domain}" added to selection. Click Deploy Selected to create.`
                      );
                    }}
                  >
                    Select for Deploy
                  </Button>
                )}
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
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

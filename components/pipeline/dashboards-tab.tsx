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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import type {
  DashboardRecommendation,
  DashboardDesign,
  TrackedDashboard,
} from "@/lib/dashboard/types";
import { DashboardDeployModal } from "./dashboard-deploy-modal";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardsTabProps {
  runId: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardsTab({ runId }: DashboardsTabProps) {
  const [recommendations, setRecommendations] = useState<DashboardRecommendation[]>([]);
  const [tracked, setTracked] = useState<TrackedDashboard[]>([]);
  const [databricksHost, setDatabricksHost] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailDomain, setDetailDomain] = useState<string | null>(null);

  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [deployModalDomains, setDeployModalDomains] = useState<DashboardRecommendation[]>([]);

  const [regeneratingDomain, setRegeneratingDomain] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchRecommendations = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/runs/${runId}/dashboard-recommendations`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRecommendations(data.recommendations ?? []);
      setTracked(data.tracked ?? []);
      setDatabricksHost(data.databricksHost ?? null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard recommendations");
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

  function getTrackedStatus(domain: string): TrackedDashboard | undefined {
    return tracked.find(
      (t) => t.domain.toLowerCase() === domain.toLowerCase() && t.status !== "trashed"
    );
  }

  function toggleSelect(domain: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(domain)) next.delete(domain);
      else next.add(domain);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === recommendations.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(recommendations.map((r) => r.domain)));
    }
  }

  // -------------------------------------------------------------------------
  // Deploy
  // -------------------------------------------------------------------------

  function handleDeploySelected() {
    const selectedRecs = recommendations.filter((r) => selected.has(r.domain));
    if (selectedRecs.length === 0) {
      toast.error("No dashboards selected");
      return;
    }
    setDeployModalDomains(selectedRecs);
    setDeployModalOpen(true);
  }

  function handleDeploySingle(rec: DashboardRecommendation) {
    setDeployModalDomains([rec]);
    setDeployModalOpen(true);
  }

  // -------------------------------------------------------------------------
  // Regenerate
  // -------------------------------------------------------------------------

  async function handleRegenerateDomain(domain: string) {
    setRegeneratingDomain(domain);
    try {
      const res = await fetch(`/api/runs/${runId}/dashboard-engine/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domains: [domain] }),
      });
      if (!res.ok) throw new Error("Regeneration failed");
      toast.success(`Regenerating dashboard for ${domain}...`);

      // Poll for completion
      const poll = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/runs/${runId}/dashboard-engine/generate/status`);
          if (statusRes.ok) {
            const status = await statusRes.json();
            if (status.status !== "generating") {
              clearInterval(poll);
              setRegeneratingDomain(null);
              fetchRecommendations();
              if (status.status === "completed") {
                toast.success(`Dashboard for ${domain} regenerated`);
              } else {
                toast.error(`Dashboard regeneration failed: ${status.error ?? "unknown"}`);
              }
            }
          }
        } catch { /* ignore poll errors */ }
      }, 2000);
    } catch (err) {
      setRegeneratingDomain(null);
      toast.error(err instanceof Error ? err.message : "Regeneration failed");
    }
  }

  // -------------------------------------------------------------------------
  // Detail rec
  // -------------------------------------------------------------------------

  const detailRec = detailDomain
    ? recommendations.find((r) => r.domain === detailDomain)
    : null;

  const detailDesign: DashboardDesign | null = detailRec?.dashboardDesign ?? null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64 mt-2" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboards</CardTitle>
          <CardDescription className="text-red-500">{error}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (recommendations.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Dashboards</CardTitle>
          <CardDescription>
            No dashboard recommendations generated yet. Dashboard recommendations
            are created automatically when the pipeline completes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await fetch(`/api/runs/${runId}/dashboard-engine/generate`, { method: "POST" });
                toast.success("Dashboard generation started");
                const poll = setInterval(async () => {
                  const r = await fetch(`/api/runs/${runId}/dashboard-engine/generate/status`);
                  if (r.ok) {
                    const d = await r.json();
                    if (d.status !== "generating") {
                      clearInterval(poll);
                      fetchRecommendations();
                    }
                  }
                }, 3000);
              } catch {
                toast.error("Failed to start dashboard generation");
              }
            }}
          >
            Generate Dashboards
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>AI/BI Dashboard Recommendations</CardTitle>
            <CardDescription>
              {recommendations.length} dashboard{recommendations.length !== 1 ? "s" : ""} generated
              {" -- "}select and deploy to your Databricks workspace
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await fetch(`/api/runs/${runId}/dashboard-engine/generate`, { method: "POST" });
                  toast.success("Regenerating all dashboards...");
                  const poll = setInterval(async () => {
                    const r = await fetch(`/api/runs/${runId}/dashboard-engine/generate/status`);
                    if (r.ok) {
                      const d = await r.json();
                      if (d.status !== "generating") {
                        clearInterval(poll);
                        fetchRecommendations();
                      }
                    }
                  }, 3000);
                } catch {
                  toast.error("Failed to start regeneration");
                }
              }}
            >
              Regenerate All
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0}
              onClick={handleDeploySelected}
            >
              Deploy Selected ({selected.size})
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-2 py-2 text-sm font-medium text-muted-foreground border-b">
            <Checkbox
              checked={selected.size === recommendations.length && recommendations.length > 0}
              onCheckedChange={toggleSelectAll}
            />
            <span>Domain</span>
            <span className="text-center">Datasets</span>
            <span className="text-center">Widgets</span>
            <span className="text-center">Status</span>
            <span className="text-right">Actions</span>
          </div>

          {/* Table rows */}
          {recommendations.map((rec) => {
            const trackedDash = getTrackedStatus(rec.domain);
            const isDeployed = !!trackedDash;

            return (
              <div
                key={rec.domain}
                className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-4 px-2 py-3 items-center hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                onClick={() => setDetailDomain(rec.domain)}
              >
                <Checkbox
                  checked={selected.has(rec.domain)}
                  onCheckedChange={() => toggleSelect(rec.domain)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div>
                  <div className="font-medium text-sm">{rec.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {rec.subdomains.length > 0
                      ? rec.subdomains.join(", ")
                      : rec.domain}
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs">
                  {rec.datasetCount}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {rec.widgetCount}
                </Badge>
                <div>
                  {isDeployed ? (
                    <Badge variant="default" className="bg-green-600 text-xs">
                      Deployed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      Ready
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeploySingle(rec)}
                  >
                    {isDeployed ? "Update" : "Deploy"}
                  </Button>
                  {isDeployed && trackedDash?.dashboardUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      asChild
                    >
                      <a
                        href={trackedDash.dashboardUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={!!detailDomain} onOpenChange={(open) => !open && setDetailDomain(null)}>
        <SheetContent className="w-[600px] sm:max-w-[600px] overflow-y-auto">
          {detailRec && (
            <>
              <SheetHeader>
                <SheetTitle>{detailRec.title}</SheetTitle>
                <SheetDescription>{detailRec.description}</SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 bg-muted rounded-md text-center">
                    <div className="text-2xl font-bold">{detailRec.datasetCount}</div>
                    <div className="text-xs text-muted-foreground">Datasets</div>
                  </div>
                  <div className="p-3 bg-muted rounded-md text-center">
                    <div className="text-2xl font-bold">{detailRec.widgetCount}</div>
                    <div className="text-xs text-muted-foreground">Widgets</div>
                  </div>
                  <div className="p-3 bg-muted rounded-md text-center">
                    <div className="text-2xl font-bold">{detailRec.useCaseIds.length}</div>
                    <div className="text-xs text-muted-foreground">Use Cases</div>
                  </div>
                </div>

                <Separator />

                {/* Dashboard Design Detail */}
                {detailDesign && (
                  <Accordion type="multiple" defaultValue={["datasets", "widgets"]}>
                    {/* Datasets */}
                    <AccordionItem value="datasets">
                      <AccordionTrigger>
                        SQL Datasets ({detailDesign.datasets.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {detailDesign.datasets.map((ds) => (
                            <div key={ds.name} className="border rounded-md p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="font-medium text-sm">{ds.displayName}</span>
                                <Badge variant="outline" className="text-xs">{ds.purpose}</Badge>
                              </div>
                              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
                                {ds.sql}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Widgets */}
                    <AccordionItem value="widgets">
                      <AccordionTrigger>
                        Visualisations ({detailDesign.widgets.length})
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {detailDesign.widgets.map((w, i) => (
                            <div key={i} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                              <Badge variant="secondary" className="text-xs min-w-[60px] justify-center">
                                {w.type}
                              </Badge>
                              <div>
                                <div className="text-sm font-medium">{w.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  Dataset: {w.datasetName} | Fields: {w.fields.map((f) => f.name).join(", ")}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>

                    {/* Raw Lakeview JSON */}
                    <AccordionItem value="json">
                      <AccordionTrigger>Lakeview JSON</AccordionTrigger>
                      <AccordionContent>
                        <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap font-mono max-h-96">
                          {(() => {
                            try {
                              return JSON.stringify(JSON.parse(detailRec.serializedDashboard), null, 2);
                            } catch {
                              return detailRec.serializedDashboard;
                            }
                          })()}
                        </pre>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                )}
              </div>

              <SheetFooter className="mt-6 flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={regeneratingDomain === detailRec.domain}
                  onClick={() => handleRegenerateDomain(detailRec.domain)}
                >
                  {regeneratingDomain === detailRec.domain ? "Regenerating..." : "Regenerate"}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleDeploySingle(detailRec)}
                >
                  {getTrackedStatus(detailRec.domain) ? "Update Dashboard" : "Deploy Dashboard"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Deploy Modal */}
      <DashboardDeployModal
        open={deployModalOpen}
        onOpenChange={setDeployModalOpen}
        runId={runId}
        recommendations={deployModalDomains}
        databricksHost={databricksHost}
        onDeployComplete={() => {
          fetchRecommendations();
          setSelected(new Set());
        }}
      />
    </>
  );
}

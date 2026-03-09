"use client";

/**
 * Estate Overview page.
 *
 * Default view: aggregate estate built from the latest data per table
 * across all environment scans (pipeline runs + standalone).
 *
 * Users can also trigger new standalone scans and drill into
 * individual scan results.
 */

import React, { useCallback, useEffect, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LabelWithTip, InfoTip } from "@/components/ui/info-tip";
import { ENVIRONMENT } from "@/lib/help-text";
import { toast } from "sonner";
import {
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Globe,
  ArrowLeft,
  Plus,
  Workflow,
} from "lucide-react";
import dynamic from "next/dynamic";
import { CatalogBrowser } from "@/components/pipeline/catalog-browser";
import { loadSettings } from "@/lib/settings";
import type { ERDGraph } from "@/lib/domain/types";
import {
  SemanticSearchInput,
  type SemanticSearchResult,
} from "@/components/search/semantic-search-input";
import type {
  AggregateData,
  GovernanceQualityStats,
  ScanProgressData,
  SingleScanData,
  TableDetailRow,
  ViewMode,
} from "@/app/environment/types";
import { AggregateSummary } from "@/components/environment/aggregate-summary";
import { GovernanceQualityView } from "@/components/environment/governance-quality-view";
import { ScanProgressCard } from "@/components/environment/scan-progress-card";
import { SingleScanSummary } from "@/components/environment/single-scan-summary";
import { TableCoverageView } from "@/components/environment/table-coverage-view";

const ERDViewer = dynamic(
  () =>
    import("@/components/environment/erd-viewer").then((m) => ({
      default: m.ERDViewer,
    })),
  { ssr: false, loading: () => <Skeleton className="h-[600px] w-full" /> },
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EstatePage() {
  const searchParams = useSearchParams();
  const highlightFqn = useMemo(() => searchParams.get("highlight") ?? "", [searchParams]);

  const [viewMode, setViewMode] = useState<ViewMode>("aggregate");
  const [aggregate, setAggregate] = useState<AggregateData | null>(null);
  const [erdGraph, setErdGraph] = useState<ERDGraph | null>(null);
  const [selectedScan, setSelectedScan] = useState<SingleScanData | null>(null);
  const [selectedErdGraph, setSelectedErdGraph] = useState<ERDGraph | null>(null);
  const [governanceQuality, setGovernanceQuality] = useState<GovernanceQualityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [embeddingEnabled, setEmbeddingEnabled] = useState(false);
  const [semanticSourceIds, setSemanticSourceIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (highlightFqn) setSearchFilter(highlightFqn);
  }, [highlightFqn]);

  useEffect(() => {
    const settings = loadSettings();
    if (!settings.semanticSearchEnabled) return;
    fetch("/api/embeddings/status")
      .then((r) => r.json())
      .then((d) => setEmbeddingEnabled(d.enabled ?? false))
      .catch(() => {});
  }, []);

  const handleSemanticResults = React.useCallback((results: SemanticSearchResult[]) => {
    setSemanticSourceIds(new Set(results.map((r) => r.sourceId)));
  }, []);

  // New scan form
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgressData | null>(null);

  // Load aggregate estate data
  const fetchAggregate = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch("/api/environment/aggregate");
      if (!resp.ok) throw new Error("Failed to fetch aggregate");
      const data = await resp.json();
      setAggregate(data);
    } catch {
      // No scans yet — that's fine
      setAggregate(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchGovernanceQuality = useCallback(async () => {
    try {
      const resp = await fetch("/api/stats");
      if (!resp.ok) return;
      const data = await resp.json();
      if (data?.quality) {
        setGovernanceQuality(data.quality as GovernanceQualityStats);
      }
    } catch {
      // Non-fatal for estate page
    }
  }, []);

  const fetchAggregateErd = useCallback(async () => {
    try {
      const resp = await fetch("/api/environment/aggregate/erd?format=json");
      if (resp.ok) {
        setErdGraph(await resp.json());
      }
    } catch {
      // Non-fatal
    }
  }, []);

  // Load a single scan's detail
  const loadSingleScan = useCallback(async (scanId: string) => {
    try {
      const resp = await fetch(`/api/environment-scan/${scanId}`);
      if (!resp.ok) throw new Error("Not found");
      const scan = await resp.json();
      setSelectedScan(scan);
      setViewMode("single-scan");

      const erdResp = await fetch(`/api/environment-scan/${scanId}/erd?format=json`);
      if (erdResp.ok) {
        setSelectedErdGraph(await erdResp.json());
      }
    } catch {
      toast.error("Failed to load scan details");
    }
  }, []);

  // Back to aggregate
  const backToAggregate = useCallback(() => {
    setViewMode("aggregate");
    setSelectedScan(null);
    setSelectedErdGraph(null);
    setSearchFilter("");
  }, []);

  // Delete a scan
  const deleteScan = useCallback(
    async (scanId: string) => {
      try {
        const resp = await fetch(`/api/environment-scan/${scanId}`, { method: "DELETE" });
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body.error ?? "Delete failed");
        }
        toast.success("Scan deleted");
        if (selectedScan?.scanId === scanId) {
          setViewMode("aggregate");
          setSelectedScan(null);
          setSelectedErdGraph(null);
        }
        fetchAggregate();
        fetchAggregateErd();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to delete scan");
      }
    },
    [selectedScan, fetchAggregate, fetchAggregateErd],
  );

  // Derive the UC scope string from selected catalog browser sources
  const ucScope = selectedSources.join(", ");

  // Start a new scan
  const handleScan = useCallback(async () => {
    if (selectedSources.length === 0) {
      toast.error("Select at least one catalog or schema to scan.");
      return;
    }
    const scope = selectedSources.join(", ");
    setScanning(true);
    setScanProgress(null);
    try {
      const settings = loadSettings();
      const depthCfg = settings.discoveryDepthConfigs[settings.defaultDiscoveryDepth];
      const resp = await fetch("/api/environment-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ucMetadata: scope, lineageDepth: depthCfg.lineageDepth }),
      });
      if (!resp.ok) throw new Error("Failed to start scan");
      const data = await resp.json();
      toast.success(`Scan started: ${data.scanId.slice(0, 8)}...`);

      // Start polling for progress
      pollForScan(data.scanId);
    } catch {
      toast.error("Failed to start environment scan");
      setScanning(false);
    }
  }, [selectedSources]); // eslint-disable-line react-hooks/exhaustive-deps

  const pollForScan = useCallback(
    (scanId: string) => {
      let attempts = 0;
      const maxAttempts = 300; // 10 minutes at 2s intervals
      const interval = 2_000;
      let consecutiveMisses = 0;
      const maxConsecutiveMisses = 5;

      const poll = async () => {
        attempts++;
        try {
          // Poll progress endpoint for live status
          const progResp = await fetch(`/api/environment-scan/${scanId}/progress`);
          if (progResp.ok) {
            consecutiveMisses = 0;
            const prog: ScanProgressData = await progResp.json();
            setScanProgress(prog);

            // Check for completion
            if (prog.phase === "complete") {
              setScanning(false);
              setSelectedSources([]);
              setScanProgress(null);
              toast.success("Scan complete! Loading results...");
              fetchAggregate();
              fetchAggregateErd();
              loadSingleScan(scanId);
              return;
            }

            if (prog.phase === "failed") {
              setScanning(false);
              setScanProgress(null);
              toast.error(prog.message || "Scan failed.");
              return;
            }
          } else {
            // Progress endpoint 404 = scan may have completed, or failed
            // and the in-memory entry expired. Fall back to the persisted
            // scan record to check for results.
            const scanResp = await fetch(`/api/environment-scan/${scanId}`);
            if (scanResp.ok) {
              const scan = await scanResp.json();
              if (scan.tableCount > 0) {
                setScanning(false);
                setSelectedSources([]);
                setScanProgress(null);
                toast.success("Scan complete! Loading results...");
                fetchAggregate();
                fetchAggregateErd();
                loadSingleScan(scanId);
                return;
              }
            }

            // Neither endpoint knows about this scan -- it likely failed
            // without saving. Stop after a few consecutive misses to avoid
            // filling logs with 404s for 10 minutes.
            consecutiveMisses++;
            if (consecutiveMisses >= maxConsecutiveMisses) {
              setScanning(false);
              setScanProgress(null);
              toast.error("Scan failed — no progress or results found. Check the logs.");
              return;
            }
          }
        } catch {
          // Continue polling on transient network errors
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, interval);
        } else {
          setScanning(false);
          setScanProgress(null);
          toast.error("Scan timed out. Check the logs.");
        }
      };

      // Start polling immediately
      setTimeout(poll, 1_000);
    },
    [fetchAggregate, fetchAggregateErd, loadSingleScan],
  );

  // On mount: load aggregate data and resume any in-progress scan
  useEffect(() => {
    fetchAggregate();
    fetchAggregateErd();
    fetchGovernanceQuality();

    // Check for scans that are still running server-side (e.g. user
    // navigated away mid-scan and came back).
    let cancelled = false;
    (async () => {
      try {
        const resp = await fetch("/api/environment-scan/active");
        if (!resp.ok || cancelled) return;
        const { scans } = await resp.json();
        if (cancelled || !scans?.length) return;

        const active = scans[0];
        setScanning(true);
        setScanProgress(active);
        pollForScan(active.scanId);
      } catch {
        // Non-fatal -- just means no active scan to resume
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchAggregate, fetchAggregateErd, fetchGovernanceQuality, pollForScan]);

  const [exporting, setExporting] = useState(false);

  const downloadExcel = useCallback(async (url: string, filename: string) => {
    setExporting(true);
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
      toast.success("Environment report downloaded");
    } catch {
      toast.error("Failed to export report");
    } finally {
      setExporting(false);
    }
  }, []);

  const handleExport = useCallback(() => {
    if (viewMode === "single-scan" && selectedScan) {
      downloadExcel(
        `/api/environment-scan/${selectedScan.scanId}/export?format=excel`,
        `estate-report-${selectedScan.scanId.slice(0, 8)}.xlsx`,
      );
    } else {
      downloadExcel(
        `/api/environment/aggregate/export?format=excel`,
        `estate-report-aggregate.xlsx`,
      );
    }
  }, [viewMode, selectedScan, downloadExcel]);

  const humanSize = (bytes: string | number | null): string => {
    if (!bytes) return "—";
    const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
    if (isNaN(n) || n === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
    return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  const humanNumber = (value: string | number | null): string => {
    if (!value) return "—";
    const n = typeof value === "string" ? parseInt(value, 10) : value;
    if (isNaN(n) || n === 0) return "0";
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return n.toLocaleString();
  };

  const timeAgo = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Active data depends on view mode
  const activeDetails: TableDetailRow[] =
    viewMode === "single-scan" ? (selectedScan?.details ?? []) : (aggregate?.details ?? []);

  const filteredTables = activeDetails.filter((t) => {
    if (semanticSourceIds.size > 0) {
      return semanticSourceIds.has(t.tableFqn);
    }
    return (
      !searchFilter ||
      t.tableFqn.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (t.dataDomain ?? "").toLowerCase().includes(searchFilter.toLowerCase())
    );
  });

  const activeErd = viewMode === "single-scan" ? selectedErdGraph : erdGraph;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewMode === "single-scan" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={backToAggregate}
              className="shrink-0"
              aria-label="Back to estate overview"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            {viewMode === "aggregate" ? (
              <>
                <div className="flex items-center gap-2">
                  <Globe className="h-6 w-6 text-primary" />
                  <h1 className="text-2xl font-bold tracking-tight">Estate Overview</h1>
                  {aggregate && aggregate.stats.totalScans > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      Combined from {aggregate.stats.totalScans} scan
                      {aggregate.stats.totalScans !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Holistic view of your data estate — latest data per table from all discovery runs
                  and environment scans.
                </p>
              </>
            ) : viewMode === "single-scan" && selectedScan ? (
              <>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <h1 className="text-2xl font-bold tracking-tight">Scan: {selectedScan.ucPath}</h1>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {new Date(selectedScan.createdAt).toLocaleString()}
                  {selectedScan.runId && (
                    <> &middot; From pipeline run {selectedScan.runId.slice(0, 8)}</>
                  )}
                  {!selectedScan.runId && <> &middot; Standalone scan</>}
                </p>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(viewMode === "single-scan" || (aggregate && aggregate.stats.totalScans > 0)) && (
            <Button variant="outline" disabled={exporting} onClick={handleExport}>
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Environment Report
                </>
              )}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              viewMode === "new-scan" ? setViewMode("aggregate") : setViewMode("new-scan")
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            New Scan
          </Button>
        </div>
      </div>

      {/* New Scan Form with Catalog Browser (hidden while a scan is running) */}
      {viewMode === "new-scan" && !scanning && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Start a New Scan
            </CardTitle>
            <CardDescription>
              Browse your Unity Catalog and select catalogs, schemas, or individual tables to scan.
              Results are merged into the estate view.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <CatalogBrowser
              selectedSources={selectedSources}
              onSelectionChange={setSelectedSources}
            />

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {selectedSources.length > 0
                  ? `Scope: ${ucScope}`
                  : "Select at least one catalog or schema above."}
              </p>
              <Button onClick={handleScan} disabled={scanning || selectedSources.length === 0}>
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning...
                  </>
                ) : (
                  <>
                    <Workflow className="h-4 w-4 mr-2" /> Scan Environment
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live scan progress */}
      {scanning && scanProgress && <ScanProgressCard progress={scanProgress} />}

      {/* Loading state */}
      {loading && viewMode === "aggregate" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-96" />
        </div>
      ) : /* Empty state */
      viewMode === "aggregate" && (!aggregate || aggregate.stats.totalScans === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold">No estate data yet</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Run a discovery pipeline or start a standalone environment scan to populate the estate
              view.
            </p>
            <Button className="mt-6" onClick={() => setViewMode("new-scan")}>
              <Plus className="mr-2 h-4 w-4" />
              Start Your First Scan
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* Tabbed content (aggregate or single-scan) */
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="tables">Tables ({activeDetails.length})</TabsTrigger>
            <TabsTrigger value="erd" className="gap-1">
              ERD
              <InfoTip tip={ENVIRONMENT.erdView} />
            </TabsTrigger>
            {viewMode === "aggregate" && <TabsTrigger value="coverage">Table Coverage</TabsTrigger>}
            {viewMode === "aggregate" && <TabsTrigger value="governance">Governance</TabsTrigger>}
            {viewMode === "single-scan" && <TabsTrigger value="export">Export</TabsTrigger>}
          </TabsList>

          {/* Summary */}
          <TabsContent value="summary" className="space-y-4">
            {viewMode === "aggregate" && aggregate ? (
              <AggregateSummary
                stats={aggregate.stats}
                details={aggregate.details}
                insights={aggregate.insights ?? []}
                humanSize={humanSize}
                humanNumber={humanNumber}
                timeAgo={timeAgo}
                onViewScan={loadSingleScan}
                onDeleteScan={deleteScan}
              />
            ) : viewMode === "single-scan" && selectedScan ? (
              <SingleScanSummary
                scan={selectedScan}
                humanSize={humanSize}
                humanNumber={humanNumber}
              />
            ) : null}
          </TabsContent>

          {/* Tables */}
          <TabsContent value="tables" className="space-y-3">
            <SemanticSearchInput
              placeholder="Filter by table name or domain..."
              scope="estate"
              scanId={selectedScan?.scanId}
              onExactChange={setSearchFilter}
              onSemanticResults={handleSemanticResults}
              embeddingEnabled={embeddingEnabled}
              className="max-w-md"
            />
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <LabelWithTip
                        label="Table"
                        tip="Fully qualified table name (catalog.schema.table) with its description if one exists — either human-authored or AI-generated."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Domain"
                        tip="Business domain assigned by AI analysis. Groups tables by the business function they serve (e.g. Finance, Customer, Operations)."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Tier"
                        tip="Medallion architecture tier: bronze = raw ingested data, silver = cleansed and conformed, gold = analytics-ready for business users, system = internal/technical."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Size"
                        tip="Physical storage size of the table on disk. Views and inaccessible tables may show as '—'."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Rows"
                        tip="Total row count from Delta table statistics. Available when ANALYZE TABLE has been run, or estimated from the latest write operation metrics. '—' means stats are not yet computed."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Owner"
                        tip="The Unity Catalog owner of this table. Tables without owners lack clear accountability when issues arise."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Gov."
                        tip="Governance score (0-100) based on documentation, ownership, tagging, sensitivity labelling, and maintenance status. Higher is better."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Sensitivity"
                        tip="Data sensitivity classification determined by AI. 'Confidential' or 'restricted' indicates PII or regulated data requiring compliance controls."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Modified"
                        tip="When this table was last modified. Helps identify stale or abandoned datasets."
                      />
                    </TableHead>
                    <TableHead>
                      <LabelWithTip
                        label="Via"
                        tip="How this table was discovered. 'Selected' means it was within your chosen scan scope. 'Lineage' means it was found by following data dependencies from other tables."
                      />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTables.slice(0, 100).map((t) => (
                    <TableRow key={t.tableFqn}>
                      <TableCell className="font-mono text-xs">
                        <div>{t.tableFqn}</div>
                        {(t.comment || t.generatedDescription) && (
                          <div className="text-muted-foreground font-sans mt-0.5 truncate max-w-[300px]">
                            {t.comment || t.generatedDescription}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {t.dataDomain ? <Badge variant="secondary">{t.dataDomain}</Badge> : "—"}
                      </TableCell>
                      <TableCell>
                        {t.dataTier ? (
                          <Badge
                            variant="outline"
                            className={
                              t.dataTier === "gold"
                                ? "border-yellow-500 text-yellow-700"
                                : t.dataTier === "silver"
                                  ? "border-gray-400 text-gray-600"
                                  : t.dataTier === "bronze"
                                    ? "border-orange-500 text-orange-700"
                                    : "border-blue-400 text-blue-600"
                            }
                          >
                            {t.dataTier}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>{humanSize(t.sizeInBytes)}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {humanNumber(t.numRows)}
                      </TableCell>
                      <TableCell className="text-xs">{t.owner ?? "—"}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {t.governanceScore != null ? (
                          <span
                            className={
                              t.governanceScore >= 70
                                ? "text-green-600 font-semibold"
                                : t.governanceScore >= 40
                                  ? "text-amber-600 font-semibold"
                                  : "text-red-600 font-semibold"
                            }
                          >
                            {t.governanceScore.toFixed(0)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {t.sensitivityLevel === "confidential" ||
                        t.sensitivityLevel === "restricted" ? (
                          <Badge variant="destructive">{t.sensitivityLevel}</Badge>
                        ) : t.sensitivityLevel ? (
                          <Badge variant="secondary">{t.sensitivityLevel}</Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {t.lastModified ? timeAgo(t.lastModified) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={t.discoveredVia === "lineage" ? "outline" : "default"}
                          className="text-xs"
                        >
                          {t.discoveredVia}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredTables.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No tables found
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredTables.length > 100 && (
              <p className="text-xs text-muted-foreground">
                Showing 100 of {filteredTables.length} tables
              </p>
            )}
          </TabsContent>

          {/* ERD */}
          <TabsContent value="erd">
            {activeErd ? (
              <ERDViewer graph={activeErd} />
            ) : (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                <p>No ERD data available.</p>
              </div>
            )}
          </TabsContent>

          {/* Table Coverage (aggregate only) */}
          {viewMode === "aggregate" && (
            <TabsContent value="coverage" className="space-y-4">
              <TableCoverageView />
            </TabsContent>
          )}

          {viewMode === "aggregate" && (
            <TabsContent value="governance" className="space-y-4">
              <GovernanceQualityView quality={governanceQuality} />
            </TabsContent>
          )}

          {/* Export (single scan only) */}
          {viewMode === "single-scan" && selectedScan && (
            <TabsContent value="export" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileSpreadsheet className="h-5 w-5" />
                    Environment Report
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Download a comprehensive Excel report for this scan with executive summary,
                    table inventory, domains, data products, PII analysis, implicit relationships,
                    redundancy report, governance scorecard, table health, lineage, and more.
                  </p>
                  <Button disabled={exporting} onClick={handleExport}>
                    {exporting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Exporting...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Download Excel Report
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

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

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  Workflow,
  ShieldAlert,
  AlertTriangle,
  BarChart3,
  Globe,
  ChevronDown,
  Clock,
  ArrowLeft,
  Plus,
} from "lucide-react";
import dynamic from "next/dynamic";
import { CatalogBrowser } from "@/components/pipeline/catalog-browser";
import type { ERDGraph } from "@/lib/domain/types";

const ERDViewer = dynamic(
  () =>
    import("@/components/environment/erd-viewer").then((m) => ({
      default: m.ERDViewer,
    })),
  { ssr: false, loading: () => <Skeleton className="h-[600px] w-full" /> }
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoverageEntry {
  ucPath: string;
  scanId: string;
  runId: string | null;
  tableCount: number;
  scannedAt: string;
}

interface AggregateStats {
  totalTables: number;
  totalScans: number;
  totalSizeBytes: string;
  domainCount: number;
  piiTablesCount: number;
  avgGovernanceScore: number;
  oldestScanAt: string | null;
  newestScanAt: string | null;
  coverageByScope: CoverageEntry[];
}

interface TableDetailRow {
  tableFqn: string;
  tableType: string | null;
  dataDomain: string | null;
  dataSubdomain: string | null;
  dataTier: string | null;
  format: string | null;
  owner: string | null;
  sizeInBytes: string | null;
  numFiles: number | null;
  isManaged: boolean;
  comment: string | null;
  generatedDescription: string | null;
  sensitivityLevel: string | null;
  governancePriority: string | null;
  discoveredVia: string;
}

interface InsightRow {
  insightType: string;
  tableFqn: string | null;
  payloadJson: string;
  severity: string;
}

interface AggregateData {
  details: TableDetailRow[];
  insights: InsightRow[];
  stats: AggregateStats;
}

interface SingleScanData {
  scanId: string;
  ucPath: string;
  tableCount: number;
  totalSizeBytes: string;
  totalFiles: number;
  tablesWithStreaming: number;
  tablesWithCDF: number;
  tablesNeedingOptimize: number;
  tablesNeedingVacuum: number;
  lineageDiscoveredCount: number;
  domainCount: number;
  piiTablesCount: number;
  redundancyPairsCount: number;
  dataProductCount: number;
  avgGovernanceScore: number;
  scanDurationMs: number | null;
  createdAt: string;
  runId: string | null;
  details: TableDetailRow[];
}

interface ScanProgressData {
  scanId: string;
  phase: string;
  message: string;
  tablesFound: number;
  columnsFound: number;
  lineageTablesFound: number;
  lineageEdgesFound: number;
  enrichedCount: number;
  enrichTotal: number;
  llmPass: string | null;
  domainsFound: number;
  piiDetected: number;
  elapsedMs: number;
}

type ViewMode = "aggregate" | "single-scan" | "new-scan";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EstatePage() {
  const [viewMode, setViewMode] = useState<ViewMode>("aggregate");
  const [aggregate, setAggregate] = useState<AggregateData | null>(null);
  const [erdGraph, setErdGraph] = useState<ERDGraph | null>(null);
  const [selectedScan, setSelectedScan] = useState<SingleScanData | null>(null);
  const [selectedErdGraph, setSelectedErdGraph] = useState<ERDGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");

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

  useEffect(() => {
    fetchAggregate();
    fetchAggregateErd();
  }, [fetchAggregate, fetchAggregateErd]);

  // Load a single scan's detail
  const loadSingleScan = useCallback(async (scanId: string) => {
    try {
      const resp = await fetch(`/api/environment-scan/${scanId}`);
      if (!resp.ok) throw new Error("Not found");
      const scan = await resp.json();
      setSelectedScan(scan);
      setViewMode("single-scan");

      const erdResp = await fetch(
        `/api/environment-scan/${scanId}/erd?format=json`
      );
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

  // Derive the UC scope string from selected catalog browser sources
  const ucScope = selectedSources.join(", ");

  // Start a new scan
  const handleScan = useCallback(async () => {
    if (selectedSources.length === 0) {
      toast.error(
        "Select at least one catalog or schema to scan."
      );
      return;
    }
    const scope = selectedSources.join(", ");
    setScanning(true);
    setScanProgress(null);
    try {
      const resp = await fetch("/api/environment-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ucMetadata: scope }),
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

      const poll = async () => {
        attempts++;
        try {
          // Poll progress endpoint for live status
          const progResp = await fetch(
            `/api/environment-scan/${scanId}/progress`
          );
          if (progResp.ok) {
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
              toast.error(prog.message || "Scan failed.");
              return;
            }
          } else {
            // Progress endpoint 404 = scan may have completed before tracking started
            // Fall back to checking the scan result directly
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
          }
        } catch {
          // Continue polling on error
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
    [fetchAggregate, fetchAggregateErd, loadSingleScan]
  );

  // Export (single scan only)
  const handleExport = useCallback(async () => {
    if (!selectedScan) return;
    try {
      const resp = await fetch(
        `/api/environment-scan/${selectedScan.scanId}/export?format=excel`
      );
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estate-report-${selectedScan.scanId.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Estate report downloaded");
    } catch {
      toast.error("Failed to export report");
    }
  }, [selectedScan]);

  const humanSize = (bytes: string | number | null): string => {
    if (!bytes) return "—";
    const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
    if (isNaN(n) || n === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(
      Math.floor(Math.log(n) / Math.log(1024)),
      units.length - 1
    );
    return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
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
    viewMode === "single-scan"
      ? selectedScan?.details ?? []
      : aggregate?.details ?? [];

  const filteredTables = activeDetails.filter(
    (t) =>
      !searchFilter ||
      t.tableFqn.toLowerCase().includes(searchFilter.toLowerCase()) ||
      (t.dataDomain ?? "").toLowerCase().includes(searchFilter.toLowerCase())
  );

  const activeErd = viewMode === "single-scan" ? selectedErdGraph : erdGraph;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {viewMode === "single-scan" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={backToAggregate}
              className="shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            {viewMode === "aggregate" ? (
              <>
                <div className="flex items-center gap-2">
                  <Globe className="h-6 w-6 text-primary" />
                  <h1 className="text-2xl font-bold tracking-tight">
                    Estate Overview
                  </h1>
                  {aggregate && aggregate.stats.totalScans > 0 && (
                    <Badge variant="secondary" className="ml-2">
                      Combined from {aggregate.stats.totalScans} scan
                      {aggregate.stats.totalScans !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-muted-foreground">
                  Holistic view of your data estate — latest data per table
                  from all discovery runs and environment scans.
                </p>
              </>
            ) : viewMode === "single-scan" && selectedScan ? (
              <>
                <div className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-muted-foreground" />
                  <h1 className="text-2xl font-bold tracking-tight">
                    Scan: {selectedScan.ucPath}
                  </h1>
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

        <Button
          variant="outline"
          onClick={() =>
            viewMode === "new-scan"
              ? setViewMode("aggregate")
              : setViewMode("new-scan")
          }
        >
          <Plus className="h-4 w-4 mr-2" />
          New Scan
        </Button>
      </div>

      {/* New Scan Form with Catalog Browser */}
      {viewMode === "new-scan" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Start a New Scan
            </CardTitle>
            <CardDescription>
              Browse your Unity Catalog and select catalogs, schemas, or
              individual tables to scan. Results are merged into the estate view.
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
              <Button
                onClick={handleScan}
                disabled={scanning || selectedSources.length === 0}
              >
                {scanning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />{" "}
                    Scanning...
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
      {scanning && scanProgress && (
        <ScanProgressCard progress={scanProgress} />
      )}

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
      viewMode === "aggregate" &&
        (!aggregate || aggregate.stats.totalScans === 0) ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold">No estate data yet</h2>
            <p className="mt-2 max-w-md text-muted-foreground">
              Run a discovery pipeline or start a standalone environment scan
              to populate the estate view.
            </p>
            <Button
              className="mt-6"
              onClick={() => setViewMode("new-scan")}
            >
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
            <TabsTrigger value="tables">
              Tables ({activeDetails.length})
            </TabsTrigger>
            <TabsTrigger value="erd">ERD</TabsTrigger>
            {viewMode === "single-scan" && (
              <TabsTrigger value="export">Export</TabsTrigger>
            )}
          </TabsList>

          {/* Summary */}
          <TabsContent value="summary" className="space-y-4">
            {viewMode === "aggregate" && aggregate ? (
              <AggregateSummary
                stats={aggregate.stats}
                details={aggregate.details}
                insights={aggregate.insights ?? []}
                humanSize={humanSize}
                timeAgo={timeAgo}
                onViewScan={loadSingleScan}
              />
            ) : viewMode === "single-scan" && selectedScan ? (
              <SingleScanSummary
                scan={selectedScan}
                humanSize={humanSize}
              />
            ) : null}
          </TabsContent>

          {/* Tables */}
          <TabsContent value="tables" className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by table name or domain..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Sensitivity</TableHead>
                    <TableHead>Via</TableHead>
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
                        {t.dataDomain ? (
                          <Badge variant="secondary">{t.dataDomain}</Badge>
                        ) : (
                          "—"
                        )}
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
                      <TableCell className="text-xs">
                        {t.owner ?? "—"}
                      </TableCell>
                      <TableCell>
                        {t.sensitivityLevel === "confidential" ||
                        t.sensitivityLevel === "restricted" ? (
                          <Badge variant="destructive">
                            {t.sensitivityLevel}
                          </Badge>
                        ) : t.sensitivityLevel ? (
                          <Badge variant="secondary">
                            {t.sensitivityLevel}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            t.discoveredVia === "lineage"
                              ? "outline"
                              : "default"
                          }
                          className="text-xs"
                        >
                          {t.discoveredVia}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredTables.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center py-8 text-muted-foreground"
                      >
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

          {/* Export (single scan only) */}
          {viewMode === "single-scan" && (
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
                    Download a comprehensive Excel report for this scan with
                    executive summary, table inventory, domains, data products,
                    PII analysis, implicit relationships, redundancy report,
                    governance scorecard, table health, lineage, and more.
                  </p>
                  <Button onClick={handleExport}>
                    <Download className="h-4 w-4 mr-2" />
                    Download Excel Report
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

// ---------------------------------------------------------------------------
// Aggregate Summary
// ---------------------------------------------------------------------------

function AggregateSummary({
  stats,
  details,
  insights,
  humanSize,
  timeAgo,
  onViewScan,
}: {
  stats: AggregateStats;
  details: TableDetailRow[];
  insights: InsightRow[];
  humanSize: (bytes: string | number | null) => string;
  timeAgo: (iso: string) => string;
  onViewScan: (scanId: string) => void;
}) {
  const [coverageOpen, setCoverageOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <ExecutiveSummary
        stats={stats}
        details={details}
        insights={insights}
        humanSize={humanSize}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Tables"
          value={stats.totalTables}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          title="Total Size"
          value={humanSize(stats.totalSizeBytes)}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          title="Domains"
          value={stats.domainCount}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          title="PII Tables"
          value={stats.piiTablesCount}
          icon={<ShieldAlert className="h-4 w-4" />}
          alert={stats.piiTablesCount > 0}
        />
      </div>

      {stats.newestScanAt && (
        <p className="text-sm text-muted-foreground">
          Last updated {timeAgo(stats.newestScanAt)} &middot;{" "}
          {stats.totalScans} scan{stats.totalScans !== 1 ? "s" : ""} contributing
        </p>
      )}

      {/* Coverage panel */}
      <Collapsible open={coverageOpen} onOpenChange={setCoverageOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1">
            <ChevronDown
              className={`h-4 w-4 transition-transform ${coverageOpen ? "rotate-180" : ""}`}
            />
            Scan Coverage ({stats.coverageByScope.length})
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="pt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scope</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Tables</TableHead>
                      <TableHead>Scanned</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.coverageByScope.map((c) => (
                      <TableRow key={c.scanId}>
                        <TableCell className="font-mono text-xs">
                          {c.ucPath}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={c.runId ? "default" : "secondary"}
                            className="text-xs"
                          >
                            {c.runId
                              ? `Run ${c.runId.slice(0, 8)}`
                              : "Standalone"}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.tableCount}</TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {timeAgo(c.scannedAt)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onViewScan(c.scanId)}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single Scan Summary
// ---------------------------------------------------------------------------

function SingleScanSummary({
  scan,
  humanSize,
}: {
  scan: SingleScanData;
  humanSize: (bytes: string | number | null) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="Tables"
          value={scan.tableCount}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          title="Size"
          value={humanSize(scan.totalSizeBytes)}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          title="Lineage Discovered"
          value={scan.lineageDiscoveredCount}
          icon={<Workflow className="h-4 w-4" />}
        />
        <StatCard
          title="Domains"
          value={scan.domainCount}
          icon={<Database className="h-4 w-4" />}
        />
        <StatCard
          title="PII Tables"
          value={scan.piiTablesCount}
          icon={<ShieldAlert className="h-4 w-4" />}
          alert={scan.piiTablesCount > 0}
        />
        <StatCard
          title="Redundancy Pairs"
          value={scan.redundancyPairsCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          alert={scan.redundancyPairsCount > 0}
        />
        <StatCard
          title="Data Products"
          value={scan.dataProductCount}
          icon={<BarChart3 className="h-4 w-4" />}
        />
        <StatCard
          title="Avg Governance"
          value={`${scan.avgGovernanceScore.toFixed(0)}/100`}
          icon={<ShieldAlert className="h-4 w-4" />}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="With Streaming" value={scan.tablesWithStreaming} />
        <StatCard title="With CDF" value={scan.tablesWithCDF} />
        <StatCard
          title="Need OPTIMIZE"
          value={scan.tablesNeedingOptimize}
          alert={scan.tablesNeedingOptimize > 0}
        />
        <StatCard
          title="Need VACUUM"
          value={scan.tablesNeedingVacuum}
          alert={scan.tablesNeedingVacuum > 0}
        />
      </div>

      {scan.scanDurationMs && (
        <p className="text-sm text-muted-foreground">
          Scan completed in {(scan.scanDurationMs / 1000).toFixed(1)}s
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scan Progress Card
// ---------------------------------------------------------------------------

const PHASE_LABELS: Record<string, string> = {
  starting: "Initialising",
  "listing-tables": "Discovering Tables",
  "fetching-metadata": "Fetching Metadata",
  "walking-lineage": "Walking Lineage",
  enriching: "Enriching Tables",
  "fetching-tags": "Fetching Tags",
  "health-scoring": "Health Scoring",
  "llm-intelligence": "LLM Analysis",
  saving: "Saving Results",
  complete: "Complete",
  failed: "Failed",
};

const PHASE_ORDER = [
  "starting",
  "listing-tables",
  "fetching-metadata",
  "walking-lineage",
  "enriching",
  "fetching-tags",
  "health-scoring",
  "llm-intelligence",
  "saving",
  "complete",
];

function ScanProgressCard({ progress }: { progress: ScanProgressData }) {
  const currentPhaseIdx = PHASE_ORDER.indexOf(progress.phase);
  const totalPhases = PHASE_ORDER.length - 1; // exclude "complete"
  const pct = Math.max(
    5,
    Math.min(
      95,
      progress.phase === "enriching" && progress.enrichTotal > 0
        ? // During enrichment, interpolate within the enriching phase
          ((currentPhaseIdx + progress.enrichedCount / progress.enrichTotal) /
            totalPhases) *
          100
        : ((currentPhaseIdx + 0.5) / totalPhases) * 100
    )
  );

  const elapsed = progress.elapsedMs;
  const mins = Math.floor(elapsed / 60_000);
  const secs = Math.floor((elapsed % 60_000) / 1_000);
  const elapsedStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  return (
    <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/10">
      <CardContent className="pt-5 pb-4 space-y-4">
        {/* Phase + elapsed */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
            <span className="text-sm font-semibold">
              {PHASE_LABELS[progress.phase] ?? progress.phase}
            </span>
          </div>
          <Badge variant="secondary" className="text-xs tabular-nums">
            {elapsedStr}
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="h-2 w-full rounded-full bg-blue-100 dark:bg-blue-900/30 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Status message */}
        <p className="text-sm text-muted-foreground">{progress.message}</p>

        {/* Live counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {progress.tablesFound > 0 && (
            <MiniCounter
              label="Tables Found"
              value={progress.tablesFound}
              icon={<Database className="h-3.5 w-3.5" />}
            />
          )}
          {progress.columnsFound > 0 && (
            <MiniCounter
              label="Columns"
              value={progress.columnsFound}
              icon={<BarChart3 className="h-3.5 w-3.5" />}
            />
          )}
          {progress.lineageTablesFound > 0 && (
            <MiniCounter
              label="Lineage Tables"
              value={progress.lineageTablesFound}
              icon={<Workflow className="h-3.5 w-3.5" />}
            />
          )}
          {progress.lineageEdgesFound > 0 && (
            <MiniCounter
              label="Lineage Edges"
              value={progress.lineageEdgesFound}
              icon={<Workflow className="h-3.5 w-3.5" />}
            />
          )}
          {progress.enrichedCount > 0 && (
            <MiniCounter
              label="Enriched"
              value={`${progress.enrichedCount}/${progress.enrichTotal}`}
              icon={<Search className="h-3.5 w-3.5" />}
            />
          )}
          {progress.domainsFound > 0 && (
            <MiniCounter
              label="Domains"
              value={progress.domainsFound}
              icon={<Globe className="h-3.5 w-3.5" />}
            />
          )}
          {progress.piiDetected > 0 && (
            <MiniCounter
              label="PII Tables"
              value={progress.piiDetected}
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
              alert
            />
          )}
          {progress.llmPass && (
            <MiniCounter
              label="LLM Pass"
              value={progress.llmPass}
              icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniCounter({
  label,
  value,
  icon,
  alert,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs ${
        alert
          ? "bg-orange-100/60 text-orange-700 dark:bg-orange-950/20 dark:text-orange-400"
          : "bg-white/60 text-muted-foreground dark:bg-white/5"
      }`}
    >
      {icon}
      <div>
        <div className="font-semibold tabular-nums">{value}</div>
        <div className="text-[10px] text-muted-foreground/70">{label}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Executive Summary
// ---------------------------------------------------------------------------

function ExecutiveSummary({
  stats,
  details,
  insights,
  humanSize,
}: {
  stats: AggregateStats;
  details: TableDetailRow[];
  insights: InsightRow[];
  humanSize: (bytes: string | number | null) => string;
}) {
  // Derive signals from the data
  const tables = details.length;
  const views = details.filter((d) => d.tableType === "VIEW").length;
  const baseTables = tables - views;
  const domains = new Set(details.map((d) => d.dataDomain).filter(Boolean));
  const domainList = Array.from(domains).sort();

  const tiers = { bronze: 0, silver: 0, gold: 0, unclassified: 0 };
  for (const d of details) {
    if (d.dataTier === "bronze") tiers.bronze++;
    else if (d.dataTier === "silver") tiers.silver++;
    else if (d.dataTier === "gold") tiers.gold++;
    else tiers.unclassified++;
  }

  const piiTables = details.filter(
    (d) => d.sensitivityLevel === "confidential" || d.sensitivityLevel === "restricted"
  );
  const noOwner = details.filter((d) => !d.owner);
  const noDescription = details.filter((d) => !d.comment && !d.generatedDescription);
  const govCritical = details.filter((d) => d.governancePriority === "critical" || d.governancePriority === "high");

  const redundancies = insights.filter((i) => i.insightType === "redundancy");
  const implicitRels = insights.filter((i) => i.insightType === "implicit_relationship");
  const dataProducts = insights.filter((i) => i.insightType === "data_product");
  const govGaps = insights.filter((i) => i.insightType === "governance_gap");

  // Build narrative paragraphs
  const findings: Array<{ label: string; body: string; severity: "info" | "warn" | "critical" }> = [];

  // Estate composition
  findings.push({
    label: "Estate Composition",
    body: `Your data estate comprises ${tables} objects (${baseTables} tables, ${views} views) totalling ${humanSize(stats.totalSizeBytes)}, organised across ${domainList.length} business domain${domainList.length !== 1 ? "s" : ""}${domainList.length > 0 ? ` (${domainList.slice(0, 5).join(", ")}${domainList.length > 5 ? ` and ${domainList.length - 5} more` : ""})` : ""}. The Medallion architecture breakdown is: ${tiers.bronze} bronze, ${tiers.silver} silver, ${tiers.gold} gold${tiers.unclassified > 0 ? `, ${tiers.unclassified} unclassified` : ""}.`,
    severity: "info",
  });

  // PII / Sensitivity
  if (piiTables.length > 0) {
    const piiDomains = new Set(piiTables.map((d) => d.dataDomain).filter(Boolean));
    findings.push({
      label: "Sensitive Data Detected",
      body: `${piiTables.length} table${piiTables.length !== 1 ? "s" : ""} contain${piiTables.length === 1 ? "s" : ""} personally identifiable information (PII) or restricted data, spanning ${piiDomains.size} domain${piiDomains.size !== 1 ? "s" : ""}. These require access controls, encryption-at-rest review, and compliance tagging (GDPR, HIPAA, PCI-DSS as applicable). Unmanaged PII is a regulatory and reputational risk.`,
      severity: "critical",
    });
  }

  // Governance gaps
  if (govCritical.length > 0) {
    findings.push({
      label: "Governance Gaps",
      body: `${govCritical.length} table${govCritical.length !== 1 ? "s have" : " has"} critical or high governance gaps. ${noOwner.length} table${noOwner.length !== 1 ? "s lack" : " lacks"} an owner, and ${noDescription.length} have no documentation (neither human-authored nor auto-generated). Without clear ownership and documentation, troubleshooting, compliance audits, and onboarding new team members become significantly harder.`,
      severity: "warn",
    });
  } else if (noOwner.length > 0 || noDescription.length > 0) {
    findings.push({
      label: "Documentation & Ownership",
      body: `${noOwner.length > 0 ? `${noOwner.length} table${noOwner.length !== 1 ? "s" : ""} ${noOwner.length !== 1 ? "have" : "has"} no owner assigned. ` : ""}${noDescription.length > 0 ? `${noDescription.length} table${noDescription.length !== 1 ? "s" : ""} ${noDescription.length !== 1 ? "have" : "has"} no description. ` : ""}Proper metadata hygiene reduces incident response time and supports data mesh adoption.`,
      severity: "warn",
    });
  }

  // Redundancy
  if (redundancies.length > 0) {
    findings.push({
      label: "Redundancy Detected",
      body: `${redundancies.length} pair${redundancies.length !== 1 ? "s" : ""} of tables appear to contain overlapping or duplicate data. Redundant copies increase storage cost, create inconsistency risk when one copy is updated but not the other, and confuse consumers about which is the "source of truth."`,
      severity: "warn",
    });
  }

  // Implicit relationships
  if (implicitRels.length > 0) {
    findings.push({
      label: "Undocumented Relationships",
      body: `${implicitRels.length} implicit relationship${implicitRels.length !== 1 ? "s were" : " was"} discovered from column naming patterns but ${implicitRels.length !== 1 ? "are" : "is"} not declared as formal foreign keys. Formalising these in Unity Catalog improves query optimiser performance, makes lineage tracking more reliable, and helps analysts understand how data connects.`,
      severity: "info",
    });
  }

  // Data products
  if (dataProducts.length > 0) {
    findings.push({
      label: "Data Products Identified",
      body: `${dataProducts.length} logical data product${dataProducts.length !== 1 ? "s were" : " was"} identified — coherent groups of tables that serve a specific business function. Formalising these as named data products with SLAs and ownership accelerates self-service analytics and supports data mesh principles.`,
      severity: "info",
    });
  }

  // Views insight
  if (views > 0) {
    findings.push({
      label: "Views in the Estate",
      body: `${views} view${views !== 1 ? "s" : ""} ${views !== 1 ? "were" : "was"} found alongside base tables. Views are included in lineage tracking and domain classification. They often represent curated access layers or business-friendly abstractions — if they map to gold-tier data products, they should be documented and governed as first-class assets.`,
      severity: "info",
    });
  }

  // Overall gov score
  if (stats.avgGovernanceScore > 0) {
    const score = stats.avgGovernanceScore;
    const verdict = score >= 70 ? "healthy" : score >= 40 ? "needs attention" : "at risk";
    findings.push({
      label: "Overall Governance Score",
      body: `The average governance score across the estate is ${score.toFixed(0)}/100 (${verdict}). This score factors in documentation coverage, ownership assignment, sensitivity labelling, access controls, maintenance hygiene, and tagging completeness.${score < 70 ? " Prioritise the tables flagged as critical or high to raise the score." : ""}`,
      severity: score >= 70 ? "info" : score >= 40 ? "warn" : "critical",
    });
  }

  if (findings.length === 0) return null;

  const severityIcon = (sev: string) => {
    if (sev === "critical") return <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
    if (sev === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    return <BarChart3 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
  };

  // Count gov gap insights for severity breakdown
  const critCount = govGaps.filter((g) => g.severity === "critical").length;
  const highCount = govGaps.filter((g) => g.severity === "high").length;

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Executive Summary — Why This Matters
        </CardTitle>
        <CardDescription>
          Automated analysis of your data estate.{" "}
          {critCount + highCount > 0
            ? `${critCount + highCount} finding${critCount + highCount !== 1 ? "s" : ""} require${critCount + highCount === 1 ? "s" : ""} attention.`
            : "No critical findings."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {findings.map((f, idx) => (
            <div key={idx} className="flex gap-3">
              {severityIcon(f.severity)}
              <div>
                <p className="text-sm font-semibold">{f.label}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  icon,
  alert,
}: {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <Card
      className={
        alert
          ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/10"
          : ""
      }
    >
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
          {icon}
          {title}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

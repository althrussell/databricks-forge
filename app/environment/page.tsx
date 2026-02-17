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
  discoveredVia: string;
}

interface AggregateData {
  details: TableDetailRow[];
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
  const [ucScope, setUcScope] = useState("");
  const [scanning, setScanning] = useState(false);

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

  // Start a new scan
  const handleScan = useCallback(async () => {
    if (!ucScope.trim()) {
      toast.error(
        "Enter a Unity Catalog scope (e.g., my_catalog.my_schema)"
      );
      return;
    }
    setScanning(true);
    try {
      const resp = await fetch("/api/environment-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ucMetadata: ucScope }),
      });
      if (!resp.ok) throw new Error("Failed to start scan");
      const data = await resp.json();
      toast.success(`Scan started: ${data.scanId.slice(0, 8)}...`);

      // Poll for completion
      pollForScan(data.scanId);
    } catch {
      toast.error("Failed to start environment scan");
      setScanning(false);
    }
  }, [ucScope]);

  const pollForScan = useCallback(
    (scanId: string) => {
      let attempts = 0;
      const maxAttempts = 120;
      const interval = 5_000;

      const poll = async () => {
        attempts++;
        try {
          const resp = await fetch(`/api/environment-scan/${scanId}`);
          if (resp.ok) {
            const scan = await resp.json();
            if (scan.tableCount > 0) {
              setScanning(false);
              setUcScope("");
              toast.success("Scan complete! Refreshing estate view...");
              // Refresh aggregate + show the new scan
              fetchAggregate();
              fetchAggregateErd();
              loadSingleScan(scanId);
              return;
            }
          }
        } catch {
          // Continue polling
        }

        if (attempts < maxAttempts) {
          setTimeout(poll, interval);
        } else {
          setScanning(false);
          toast.error("Scan timed out. Check the logs.");
        }
      };

      setTimeout(poll, interval);
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

      {/* New Scan Form (collapsible) */}
      {viewMode === "new-scan" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Start a New Scan
            </CardTitle>
            <CardDescription>
              Scan additional catalogs or schemas to expand the estate view.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Input
                placeholder="Unity Catalog scope (e.g., my_catalog or my_catalog.my_schema)"
                value={ucScope}
                onChange={(e) => setUcScope(e.target.value)}
                disabled={scanning}
                className="flex-1"
              />
              <Button
                onClick={handleScan}
                disabled={scanning || !ucScope.trim()}
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
            <p className="text-xs text-muted-foreground mt-2">
              Supports: catalog, catalog.schema, or comma-separated scopes.
              Results are merged into the estate view.
            </p>
          </CardContent>
        </Card>
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
  humanSize,
  timeAgo,
  onViewScan,
}: {
  stats: AggregateStats;
  humanSize: (bytes: string | number | null) => string;
  timeAgo: (iso: string) => string;
  onViewScan: (scanId: string) => void;
}) {
  const [coverageOpen, setCoverageOpen] = useState(false);

  return (
    <div className="space-y-4">
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

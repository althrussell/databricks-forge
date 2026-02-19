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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  Database,
  Download,
  FileSpreadsheet,
  Info,
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
import { computeDataMaturity, type DataMaturityScore, type MaturityPillar } from "@/lib/domain/data-maturity";
import { loadSettings } from "@/lib/settings";
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
  totalRows: string;
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
  numRows: string | null;
  numFiles: number | null;
  isManaged: boolean;
  comment: string | null;
  generatedDescription: string | null;
  sensitivityLevel: string | null;
  governancePriority: string | null;
  governanceScore: number | null;
  lastModified: string | null;
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
  totalRows: string;
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
  insights: InsightRow[];
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
    <TooltipProvider>
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
            {viewMode === "aggregate" && (
              <TabsTrigger value="coverage">Table Coverage</TabsTrigger>
            )}
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
                humanNumber={humanNumber}
                timeAgo={timeAgo}
                onViewScan={loadSingleScan}
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
                    <TableHead>
                      <HeaderWithTip label="Table" tip="Fully qualified table name (catalog.schema.table) with its description if one exists — either human-authored or AI-generated." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Domain" tip="Business domain assigned by AI analysis. Groups tables by the business function they serve (e.g. Finance, Customer, Operations)." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Tier" tip="Medallion architecture tier: bronze = raw ingested data, silver = cleansed and conformed, gold = analytics-ready for business users, system = internal/technical." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Size" tip="Physical storage size of the table on disk. Views and inaccessible tables may show as '—'." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Rows" tip="Total row count from Delta table statistics. Available when ANALYZE TABLE has been run, or estimated from the latest write operation metrics. '—' means stats are not yet computed." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Owner" tip="The Unity Catalog owner of this table. Tables without owners lack clear accountability when issues arise." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Gov." tip="Governance score (0-100) based on documentation, ownership, tagging, sensitivity labelling, and maintenance status. Higher is better." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Sensitivity" tip="Data sensitivity classification determined by AI. 'Confidential' or 'restricted' indicates PII or regulated data requiring compliance controls." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Modified" tip="When this table was last modified. Helps identify stale or abandoned datasets." />
                    </TableHead>
                    <TableHead>
                      <HeaderWithTip label="Via" tip="How this table was discovered. 'Selected' means it was within your chosen scan scope. 'Lineage' means it was found by following data dependencies from other tables." />
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
                      <TableCell className="text-xs tabular-nums">
                        {humanNumber(t.numRows)}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.owner ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {t.governanceScore != null ? (
                          <span className={
                            t.governanceScore >= 70
                              ? "text-green-600 font-semibold"
                              : t.governanceScore >= 40
                                ? "text-amber-600 font-semibold"
                                : "text-red-600 font-semibold"
                          }>
                            {t.governanceScore.toFixed(0)}
                          </span>
                        ) : "—"}
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
                      <TableCell className="text-xs text-muted-foreground">
                        {t.lastModified ? timeAgo(t.lastModified) : "—"}
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
                        colSpan={10}
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

          {/* Table Coverage (aggregate only) */}
          {viewMode === "aggregate" && (
            <TabsContent value="coverage" className="space-y-4">
              <TableCoverageView />
            </TabsContent>
          )}

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
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Table Coverage View (links estate + discovery)
// ---------------------------------------------------------------------------

interface CoverageTableRow {
  tableFqn: string;
  domain: string | null;
  tier: string | null;
  sensitivityLevel: string | null;
  governanceScore: number | null;
  comment: string | null;
  generatedDescription: string | null;
  sizeInBytes: string | null;
  numRows: string | null;
  owner: string | null;
  useCases: Array<{
    id: string;
    name: string;
    type: string;
    domain: string;
    overallScore: number;
    runId: string;
  }>;
}

function TableCoverageView() {
  const [data, setData] = useState<{
    tables: CoverageTableRow[];
    stats: { totalTables: number; coveredTables: number; uncoveredTables: number; coveragePct: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "covered" | "uncovered">("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/environment/table-coverage");
        if (!res.ok) throw new Error("Failed to load");
        const json = await res.json();
        if (json.hasEstateData) {
          setData({ tables: json.tables, stats: json.stats });
        }
      } catch {
        // Silently handle
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!data || data.tables.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center text-muted-foreground">
          No estate data available. Run an environment scan first.
        </CardContent>
      </Card>
    );
  }

  const filtered = data.tables.filter((t) => {
    if (filter === "covered" && t.useCases.length === 0) return false;
    if (filter === "uncovered" && t.useCases.length > 0) return false;
    if (search && !t.tableFqn.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Table Coverage Analysis
          </CardTitle>
          <CardDescription>
            Links estate tables with discovered use cases. Uncovered tables are expansion signals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div>
              <p className="text-xs text-muted-foreground">Total Tables</p>
              <p className="text-xl font-bold">{data.stats.totalTables}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">With Use Cases</p>
              <p className="text-xl font-bold text-emerald-600">{data.stats.coveredTables}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Untapped (Expansion Signal)</p>
              <p className="text-xl font-bold text-orange-600">{data.stats.uncoveredTables}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Coverage</p>
              <p className="text-xl font-bold">{data.stats.coveragePct}%</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search tables..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          variant={filter === "covered" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("covered")}
        >
          With Use Cases
        </Button>
        <Button
          variant={filter === "uncovered" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("uncovered")}
        >
          Untapped
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[300px]">Table</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Governance</TableHead>
              <TableHead>Use Cases</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.slice(0, 100).map((t) => (
              <TableRow key={t.tableFqn}>
                <TableCell className="font-mono text-xs">
                  {t.tableFqn}
                  {t.sensitivityLevel === "confidential" || t.sensitivityLevel === "restricted" ? (
                    <Badge variant="destructive" className="ml-1 text-[10px]">PII</Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-xs">{t.domain ?? "—"}</TableCell>
                <TableCell className="text-xs">{t.tier ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  {t.governanceScore != null ? `${t.governanceScore}/100` : "—"}
                </TableCell>
                <TableCell>
                  {t.useCases.length > 0 ? (
                    <div className="space-y-0.5">
                      {t.useCases.slice(0, 3).map((uc) => (
                        <div key={uc.id} className="flex items-center gap-1">
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {uc.type}
                          </Badge>
                          <span className="truncate text-xs">{uc.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round(uc.overallScore * 100)}%
                          </span>
                        </div>
                      ))}
                      {t.useCases.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{t.useCases.length - 3} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-orange-600 font-medium">
                      No use cases — expansion signal
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length > 100 && (
          <div className="p-2 text-center text-sm text-muted-foreground">
            Showing 100 of {filtered.length} tables
          </div>
        )}
      </div>
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
  humanNumber,
  timeAgo,
  onViewScan,
}: {
  stats: AggregateStats;
  details: TableDetailRow[];
  insights: InsightRow[];
  humanSize: (bytes: string | number | null) => string;
  humanNumber: (value: string | number | null) => string;
  timeAgo: (iso: string) => string;
  onViewScan: (scanId: string) => void;
}) {
  const [coverageOpen, setCoverageOpen] = useState(false);

  // Compute Data Maturity Score
  const maturity = computeDataMaturity({
    tableCount: stats.totalTables,
    avgGovernanceScore: stats.avgGovernanceScore,
    piiTablesCount: stats.piiTablesCount,
    tablesWithDescription: details.filter((d) => d.comment || d.generatedDescription).length,
    tablesWithTags: 0, // Not available at aggregate level yet
    tablesWithOwner: details.filter((d) => d.owner).length,
    tablesWithTier: details.filter((d) => d.dataTier).length,
    tierCount: new Set(details.map((d) => d.dataTier).filter(Boolean)).size,
    redundancyPairsCount: stats.piiTablesCount, // approximation from aggregate stats
    dataProductCount: insights.filter((i) => i.insightType === "data_product").length,
    lineageEdgeCount: 0, // Not in aggregate stats currently
    lineageDiscoveredCount: 0,
    domainCount: stats.domainCount,
    tablesNeedingOptimize: 0,
    tablesNeedingVacuum: 0,
    tablesWithStreaming: 0,
    tablesWithCDF: 0,
    avgHealthScore: 50,
    tablesWithAutoOptimize: 0,
    tablesWithLiquidClustering: 0,
  });

  return (
    <div className="space-y-4">
      {/* Data Maturity Score */}
      <DataMaturityCard maturity={maturity} />

      {/* Executive Summary */}
      <ExecutiveSummary
        stats={stats}
        details={details}
        insights={insights}
        humanSize={humanSize}
      />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          title="Tables"
          value={stats.totalTables}
          icon={<Database className="h-4 w-4" />}
          tooltip="Total number of tables and views discovered across all scans, including tables found by following data lineage beyond your selected scope."
        />
        <StatCard
          title="Total Size"
          value={humanSize(stats.totalSizeBytes)}
          icon={<BarChart3 className="h-4 w-4" />}
          tooltip="Combined on-disk storage of all tables in the estate. Views and tables where size could not be determined show as 0 bytes."
        />
        <StatCard
          title="Total Rows"
          value={humanNumber(stats.totalRows)}
          icon={<BarChart3 className="h-4 w-4" />}
          tooltip="Combined row count across all tables where statistics are available. Sourced from table properties (ANALYZE TABLE) or Delta operation metrics. Tables without computed stats show 0."
        />
        <StatCard
          title="Domains"
          value={stats.domainCount}
          icon={<Database className="h-4 w-4" />}
          tooltip="Number of distinct business domains identified by AI analysis, such as Finance, Customer, Operations, or Marketing. Helps organise your data by business function."
        />
        <StatCard
          title="Avg Governance"
          value={`${stats.avgGovernanceScore.toFixed(0)}/100`}
          icon={<ShieldAlert className="h-4 w-4" />}
          tooltip="Average governance score across all tables (0 to 100). Factors include documentation coverage, ownership, sensitivity tagging, maintenance frequency, and access controls. Higher is better."
        />
        <StatCard
          title="PII Tables"
          value={stats.piiTablesCount}
          icon={<ShieldAlert className="h-4 w-4" />}
          alert={stats.piiTablesCount > 0}
          tooltip="Tables containing personally identifiable information (names, emails, phone numbers, etc.) that may require compliance with regulations like GDPR, CCPA, or HIPAA."
        />
      </div>

      {stats.newestScanAt && (
        <p className="text-sm text-muted-foreground">
          Last updated {timeAgo(stats.newestScanAt)} &middot;{" "}
          {stats.totalScans} scan{stats.totalScans !== 1 ? "s" : ""} contributing
        </p>
      )}

      {/* Scan Trends */}
      {stats.totalScans >= 2 && <ScanTrendsPanel />}

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
  humanNumber,
}: {
  scan: SingleScanData;
  humanSize: (bytes: string | number | null) => string;
  humanNumber: (value: string | number | null) => string;
}) {
  return (
    <div className="space-y-4">
      {/* Executive Summary (reuses the same component as aggregate) */}
      {scan.details.length > 0 && (
        <ExecutiveSummary
          stats={{
            totalTables: scan.tableCount,
            totalScans: 1,
            totalSizeBytes: scan.totalSizeBytes,
            totalRows: scan.totalRows ?? "0",
            domainCount: scan.domainCount,
            piiTablesCount: scan.piiTablesCount,
            avgGovernanceScore: scan.avgGovernanceScore,
            oldestScanAt: scan.createdAt,
            newestScanAt: scan.createdAt,
            coverageByScope: [],
          }}
          details={scan.details}
          insights={scan.insights ?? []}
          humanSize={humanSize}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <StatCard
          title="Tables"
          value={scan.tableCount}
          icon={<Database className="h-4 w-4" />}
          tooltip="Total tables and views found in this scan, including any discovered by following data lineage beyond your selected scope."
        />
        <StatCard
          title="Size"
          value={humanSize(scan.totalSizeBytes)}
          icon={<BarChart3 className="h-4 w-4" />}
          tooltip="Combined on-disk storage of all tables in this scan. Views typically show 0 bytes as they don't store data directly."
        />
        <StatCard
          title="Total Rows"
          value={humanNumber(scan.totalRows)}
          icon={<BarChart3 className="h-4 w-4" />}
          tooltip="Combined row count across all tables with available statistics. Sourced from Delta table properties or write operation metrics."
        />
        <StatCard
          title="Lineage Discovered"
          value={scan.lineageDiscoveredCount}
          icon={<Workflow className="h-4 w-4" />}
          tooltip="Tables found by walking data lineage — upstream sources and downstream consumers — that were outside your originally selected scope. Shows how your data connects to the wider estate."
        />
        <StatCard
          title="Domains"
          value={scan.domainCount}
          icon={<Database className="h-4 w-4" />}
          tooltip="Business domains identified by AI analysis (e.g. Finance, Customer, Operations). Groups your tables by the business function they serve."
        />
        <StatCard
          title="PII Tables"
          value={scan.piiTablesCount}
          icon={<ShieldAlert className="h-4 w-4" />}
          alert={scan.piiTablesCount > 0}
          tooltip="Tables containing personally identifiable information (names, emails, phone numbers, etc.) that may need compliance controls under GDPR, CCPA, or HIPAA."
        />
        <StatCard
          title="Redundancy Pairs"
          value={scan.redundancyPairsCount}
          icon={<AlertTriangle className="h-4 w-4" />}
          alert={scan.redundancyPairsCount > 0}
          tooltip="Pairs of tables with significant column overlap that may be duplicates, backups, or unnecessary copies. Redundancy wastes storage and risks inconsistent reporting."
        />
        <StatCard
          title="Data Products"
          value={scan.dataProductCount}
          icon={<BarChart3 className="h-4 w-4" />}
          tooltip="Logical data products identified by AI — cohesive groups of tables that together serve a business function (e.g. 'Customer 360', 'Sales Pipeline'). Formalising these improves reuse and governance."
        />
        <StatCard
          title="Avg Governance"
          value={`${scan.avgGovernanceScore.toFixed(0)}/100`}
          icon={<ShieldAlert className="h-4 w-4" />}
          tooltip="Average governance score across all tables (0 to 100). Factors include documentation coverage, ownership, sensitivity tagging, maintenance frequency, and access controls. Higher is better."
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="With Streaming"
          value={scan.tablesWithStreaming}
          tooltip="Tables that receive data via streaming writes (Structured Streaming, Auto Loader, etc.). These tables are continuously updated and may need different maintenance strategies."
        />
        <StatCard
          title="With CDF"
          value={scan.tablesWithCDF}
          tooltip="Tables with Change Data Feed enabled. CDF lets downstream consumers efficiently track row-level inserts, updates, and deletes — essential for incremental ETL pipelines."
        />
        <StatCard
          title="Need OPTIMIZE"
          value={scan.tablesNeedingOptimize}
          alert={scan.tablesNeedingOptimize > 0}
          tooltip="Tables that haven't been OPTIMIZEd in over 30 days. OPTIMIZE compacts small files into larger ones, which dramatically improves query performance and reduces costs."
        />
        <StatCard
          title="Need VACUUM"
          value={scan.tablesNeedingVacuum}
          alert={scan.tablesNeedingVacuum > 0}
          tooltip="Tables that haven't been VACUUMed in over 30 days. VACUUM removes old, unused data files left by previous writes, freeing up storage and reducing cloud costs."
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
              tooltip="Tables and views discovered so far in the selected Unity Catalog scope."
            />
          )}
          {progress.columnsFound > 0 && (
            <MiniCounter
              label="Columns"
              value={progress.columnsFound}
              icon={<BarChart3 className="h-3.5 w-3.5" />}
              tooltip="Total columns found across all discovered tables. Column names and types are used for AI analysis."
            />
          )}
          {progress.lineageTablesFound > 0 && (
            <MiniCounter
              label="Lineage Tables"
              value={progress.lineageTablesFound}
              icon={<Workflow className="h-3.5 w-3.5" />}
              tooltip="Additional tables discovered by following data lineage (upstream and downstream dependencies) beyond your original scope."
            />
          )}
          {progress.lineageEdgesFound > 0 && (
            <MiniCounter
              label="Lineage Edges"
              value={progress.lineageEdgesFound}
              icon={<Workflow className="h-3.5 w-3.5" />}
              tooltip="Data flow connections found between tables. Each edge represents one table feeding data into another via ETL, views, or streaming."
            />
          )}
          {progress.enrichedCount > 0 && (
            <MiniCounter
              label="Enriched"
              value={`${progress.enrichedCount}/${progress.enrichTotal}`}
              icon={<Search className="h-3.5 w-3.5" />}
              tooltip="Tables that have been deeply analysed with DESCRIBE DETAIL (size, format, files) and DESCRIBE HISTORY (write patterns, maintenance)."
            />
          )}
          {progress.domainsFound > 0 && (
            <MiniCounter
              label="Domains"
              value={progress.domainsFound}
              icon={<Globe className="h-3.5 w-3.5" />}
              tooltip="Business domains identified so far by the AI analysis pass (e.g. Finance, Customer, Operations)."
            />
          )}
          {progress.piiDetected > 0 && (
            <MiniCounter
              label="PII Tables"
              value={progress.piiDetected}
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
              alert
              tooltip="Tables flagged as containing personally identifiable or sensitive data based on column names and types."
            />
          )}
          {progress.llmPass && (
            <MiniCounter
              label="LLM Pass"
              value={progress.llmPass}
              icon={<Loader2 className="h-3.5 w-3.5 animate-spin" />}
              tooltip="The current AI analysis pass running. Passes include domain categorisation, PII detection, description generation, redundancy checks, relationship discovery, tier classification, data product identification, and governance scoring."
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
  tooltip,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  alert?: boolean;
  tooltip?: string;
}) {
  const inner = (
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

  if (!tooltip) return inner;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{inner}</div>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[260px]">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Header with tooltip (for table column headers)
// ---------------------------------------------------------------------------

function HeaderWithTip({ label, tip }: { label: string; tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 cursor-help">
          {label}
          <Info className="h-3 w-3 text-muted-foreground/50" />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[280px]">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Executive Summary
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Scan Trends Panel
// ---------------------------------------------------------------------------

interface TrendMetricRow {
  label: string;
  previous: number | string;
  current: number | string;
  changeLabel: string;
  direction: "up" | "down" | "stable";
  sentiment: "positive" | "negative" | "neutral";
}

function ScanTrendsPanel() {
  const [trends, setTrends] = useState<{
    metrics: TrendMetricRow[];
    newTables: string[];
    removedTables: string[];
    daysBetween: number;
    previous: { scanId: string; createdAt: string };
    current: { scanId: string; createdAt: string };
  } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/environment/trends");
        if (!res.ok) return;
        const json = await res.json();
        if (json.hasTrends) {
          setTrends(json.trends);
        }
      } catch {
        // silent
      }
    }
    load();
  }, []);

  if (!trends) return null;

  const sentimentColor = {
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-red-600 dark:text-red-400",
    neutral: "text-muted-foreground",
  };
  const directionIcon = {
    up: "\u2191",
    down: "\u2193",
    stable: "\u2192",
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
          Scan Trends ({trends.daysBetween} days between scans)
          {trends.newTables.length > 0 && (
            <Badge variant="secondary" className="ml-1 text-[10px]">
              +{trends.newTables.length} new tables
            </Badge>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Card className="mt-2">
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
              {trends.metrics.map((m) => (
                <div key={m.label} className="rounded-md border px-3 py-2">
                  <p className="text-[10px] text-muted-foreground">{m.label}</p>
                  <p className="text-sm font-medium">
                    {m.current}
                  </p>
                  <p className={`text-xs ${sentimentColor[m.sentiment]}`}>
                    {directionIcon[m.direction]} {m.changeLabel}
                  </p>
                </div>
              ))}
            </div>
            {(trends.newTables.length > 0 || trends.removedTables.length > 0) && (
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {trends.newTables.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-emerald-600">New Tables (+{trends.newTables.length})</p>
                    <div className="mt-1 max-h-32 overflow-y-auto">
                      {trends.newTables.slice(0, 10).map((t) => (
                        <p key={t} className="truncate font-mono text-[10px]">{t}</p>
                      ))}
                      {trends.newTables.length > 10 && (
                        <p className="text-[10px] text-muted-foreground">... and {trends.newTables.length - 10} more</p>
                      )}
                    </div>
                  </div>
                )}
                {trends.removedTables.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-red-600">Removed Tables (-{trends.removedTables.length})</p>
                    <div className="mt-1 max-h-32 overflow-y-auto">
                      {trends.removedTables.slice(0, 10).map((t) => (
                        <p key={t} className="truncate font-mono text-[10px]">{t}</p>
                      ))}
                      {trends.removedTables.length > 10 && (
                        <p className="text-[10px] text-muted-foreground">... and {trends.removedTables.length - 10} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Data Maturity Score Card
// ---------------------------------------------------------------------------

function PillarBar({ pillar, barColorClass }: { pillar: MaturityPillar; barColorClass: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{pillar.name}</p>
        <p className="text-sm font-bold">{pillar.score}</p>
      </div>
      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${barColorClass}`}
          style={{ width: `${pillar.score}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {pillar.indicators.map((ind) => (
          <p key={ind.label} className="text-xs text-muted-foreground">
            {ind.label}: <span className="font-medium text-foreground">{ind.value}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function DataMaturityCard({ maturity }: { maturity: DataMaturityScore }) {
  const levelColor: Record<string, string> = {
    Foundational: "text-red-600 dark:text-red-400",
    Developing: "text-orange-600 dark:text-orange-400",
    Established: "text-yellow-600 dark:text-yellow-400",
    Advanced: "text-blue-600 dark:text-blue-400",
    Leading: "text-emerald-600 dark:text-emerald-400",
  };
  const barColor: Record<string, string> = {
    Foundational: "bg-red-500",
    Developing: "bg-orange-500",
    Established: "bg-yellow-500",
    Advanced: "bg-blue-500",
    Leading: "bg-emerald-500",
  };

  const pillBarColor = barColor[maturity.level] ?? "bg-primary";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <BarChart3 className="h-4 w-4 text-primary" />
          Data Maturity Score
        </CardTitle>
        <CardDescription>
          Composite score across governance, architecture, operations, and analytics readiness
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-baseline gap-3">
          <span className="text-5xl font-bold tracking-tight">{maturity.overall}</span>
          <span className="text-lg text-muted-foreground">/100</span>
          <Badge
            variant="secondary"
            className={levelColor[maturity.level]}
          >
            {maturity.level}
          </Badge>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <PillarBar pillar={maturity.pillars.governance} barColorClass={pillBarColor} />
          <PillarBar pillar={maturity.pillars.architecture} barColorClass={pillBarColor} />
          <PillarBar pillar={maturity.pillars.operations} barColorClass={pillBarColor} />
          <PillarBar pillar={maturity.pillars.analyticsReadiness} barColorClass={pillBarColor} />
        </div>
      </CardContent>
    </Card>
  );
}

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
  // -------------------------------------------------------------------
  // Derive signals
  // -------------------------------------------------------------------
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
  const documented = tables - noDescription.length;
  const documentedPct = tables > 0 ? Math.round((documented / tables) * 100) : 0;

  const redundancies = insights.filter((i) => i.insightType === "redundancy");
  const implicitRels = insights.filter((i) => i.insightType === "implicit_relationship");
  const dataProductInsights = insights.filter((i) => i.insightType === "data_product");
  const govGaps = insights.filter((i) => i.insightType === "governance_gap");

  // Parse data product payloads for richer narrative
  const dataProducts: Array<{ productName: string; description: string; primaryDomain: string; maturityLevel: string; tables: string[] }> = [];
  for (const dp of dataProductInsights) {
    try {
      dataProducts.push(JSON.parse(dp.payloadJson));
    } catch { /* skip malformed */ }
  }
  const productisedProducts = dataProducts.filter((p) => p.maturityLevel === "productised");
  const curatedProducts = dataProducts.filter((p) => p.maturityLevel === "curated");
  const rawProducts = dataProducts.filter((p) => p.maturityLevel === "raw");

  // -------------------------------------------------------------------
  // Build findings — BUSINESS first, then TECHNICAL
  // -------------------------------------------------------------------
  type Finding = { label: string; body: string; severity: "info" | "warn" | "critical"; section: "business" | "technical" };
  const findings: Finding[] = [];

  // ═══════════════════════════════════════════════════════════════════
  // BUSINESS LAYER
  // ═══════════════════════════════════════════════════════════════════

  // 1. Strategic data landscape
  findings.push({
    label: "Your Data Landscape",
    body: `Your organisation manages ${tables} data assets across ${domainList.length} business domain${domainList.length !== 1 ? "s" : ""}${domainList.length > 0 ? ` — ${domainList.slice(0, 4).join(", ")}${domainList.length > 4 ? ` and ${domainList.length - 4} more` : ""}` : ""}. This represents ${humanSize(stats.totalSizeBytes)} of structured data that can fuel analytics, AI, and decision-making. ${tiers.gold > 0 ? `${tiers.gold} asset${tiers.gold !== 1 ? "s are" : " is"} already at gold (analytics-ready) tier, providing immediate value to business teams.` : "No assets have been classified as analytics-ready (gold tier) yet — this is a quick win to unlock."}`,
    severity: "info",
    section: "business",
  });

  // 2. Analytics readiness / self-service
  const selfServicePct = tables > 0 ? Math.round(((tiers.gold + tiers.silver) / tables) * 100) : 0;
  if (tables > 0) {
    const readinessVerdict = selfServicePct >= 60
      ? "Your estate is well-positioned for self-service analytics. Business teams can query and build dashboards on most data without engineering support."
      : selfServicePct >= 30
        ? "A moderate portion of data is ready for business consumption, but significant effort is needed to curate more datasets from bronze to silver/gold tiers to support self-service at scale."
        : "Most of your data is in raw (bronze) form. Business teams cannot easily consume it without significant transformation. Prioritising a curation pipeline would directly reduce time-to-insight for stakeholders.";
    findings.push({
      label: "Self-Service Readiness",
      body: `${selfServicePct}% of your data assets are at silver or gold tier, meaning they are curated and ready for business consumption. ${readinessVerdict}`,
      severity: selfServicePct >= 60 ? "info" : selfServicePct >= 30 ? "warn" : "critical",
      section: "business",
    });
  }

  // 3. Data products = business capabilities
  if (dataProducts.length > 0) {
    const productNames = dataProducts.slice(0, 3).map((p) => `"${p.productName}"`).join(", ");
    findings.push({
      label: "Business Data Products",
      body: `${dataProducts.length} data product${dataProducts.length !== 1 ? "s have" : " has"} been identified — reusable data assets that directly support business functions (${productNames}${dataProducts.length > 3 ? ` and ${dataProducts.length - 3} more` : ""}). ${productisedProducts.length > 0 ? `${productisedProducts.length} ${productisedProducts.length !== 1 ? "are" : "is"} already productised with defined consumers.` : ""} ${curatedProducts.length > 0 ? `${curatedProducts.length} ${curatedProducts.length !== 1 ? "are" : "is"} curated and near-ready for wider adoption.` : ""} ${rawProducts.length > 0 ? `${rawProducts.length} ${rawProducts.length !== 1 ? "are" : "is"} in early stages and would benefit from investment to become self-service ready.` : ""} Formalising these as named products with SLAs and owners accelerates time-to-value for downstream teams and AI initiatives.`,
      severity: "info",
      section: "business",
    });
  } else if (domainList.length > 0) {
    findings.push({
      label: "Data Product Opportunity",
      body: `No formal data products have been identified yet, but your data spans ${domainList.length} business domain${domainList.length !== 1 ? "s" : ""}. Each domain likely contains candidate data products — curated datasets that multiple teams could reuse. Identifying and productising these would reduce duplicated effort, improve consistency, and accelerate analytics delivery.`,
      severity: "warn",
      section: "business",
    });
  }

  // 4. Compliance & regulatory exposure
  if (piiTables.length > 0) {
    const piiPct = Math.round((piiTables.length / tables) * 100);
    const piiDomains = new Set(piiTables.map((d) => d.dataDomain).filter(Boolean));
    findings.push({
      label: "Regulatory & Privacy Exposure",
      body: `${piiPct}% of your data estate (${piiTables.length} asset${piiTables.length !== 1 ? "s" : ""}) contains personally identifiable or restricted information, touching ${piiDomains.size} business domain${piiDomains.size !== 1 ? "s" : ""}. This creates obligations under regulations like GDPR, CCPA, or HIPAA. Without proper access controls and classification, the business faces regulatory fines, brand damage, and potential loss of customer trust. Proactive governance here directly protects revenue and reputation.`,
      severity: "critical",
      section: "business",
    });
  } else {
    findings.push({
      label: "Privacy & Compliance",
      body: "No sensitive or PII data was detected in the scanned estate. This simplifies compliance obligations, but you should verify this covers all business-critical datasets by expanding scan scope if needed.",
      severity: "info",
      section: "business",
    });
  }

  // 5. Discoverability & time-to-insight
  findings.push({
    label: "Data Discoverability",
    body: `${documentedPct}% of your data assets have descriptions (either human-authored or auto-generated). ${documentedPct >= 70
      ? "Analysts and data scientists can find and understand most datasets quickly, reducing onboarding time and enabling faster project delivery."
      : documentedPct >= 40
        ? "Many datasets lack descriptions, which forces analysts to spend time asking data engineers what tables mean — a hidden cost that slows every analytics project."
        : "The majority of datasets have no documentation. This means every new analytics initiative starts with a discovery phase that could take days or weeks. Improving documentation coverage would directly reduce the time from business question to actionable insight."}${noOwner.length > 0 ? ` Additionally, ${noOwner.length} asset${noOwner.length !== 1 ? "s have" : " has"} no assigned owner — when something breaks, there is no clear point of accountability.` : ""}`,
    severity: documentedPct >= 70 ? "info" : "warn",
    section: "business",
  });

  // 6. Cost & efficiency
  if (redundancies.length > 0) {
    findings.push({
      label: "Wasted Spend & Inconsistency Risk",
      body: `${redundancies.length} pair${redundancies.length !== 1 ? "s" : ""} of datasets appear to contain overlapping or duplicate data. Beyond the storage cost of maintaining multiple copies, this creates a real business risk: different teams may make decisions based on different versions of the same data, leading to conflicting reports, eroded stakeholder trust, and costly reconciliation efforts.`,
      severity: "warn",
      section: "business",
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // TECHNICAL LAYER
  // ═══════════════════════════════════════════════════════════════════

  // Estate composition (compact)
  findings.push({
    label: "Estate Composition",
    body: `${baseTables} tables and ${views} views totalling ${humanSize(stats.totalSizeBytes)}. Medallion tiers: ${tiers.gold} gold, ${tiers.silver} silver, ${tiers.bronze} bronze${tiers.unclassified > 0 ? `, ${tiers.unclassified} unclassified` : ""}.`,
    severity: "info",
    section: "technical",
  });

  // Implicit relationships
  if (implicitRels.length > 0) {
    findings.push({
      label: "Undocumented Relationships",
      body: `${implicitRels.length} implicit relationship${implicitRels.length !== 1 ? "s were" : " was"} inferred from column naming patterns. Formalising these as foreign keys improves query performance, lineage accuracy, and analyst understanding of how data connects.`,
      severity: "info",
      section: "technical",
    });
  }

  // Governance score
  if (stats.avgGovernanceScore > 0) {
    const score = stats.avgGovernanceScore;
    const verdict = score >= 70 ? "healthy" : score >= 40 ? "needs attention" : "at risk";
    findings.push({
      label: "Governance Score",
      body: `Average governance score: ${score.toFixed(0)}/100 (${verdict}). ${govCritical.length > 0 ? `${govCritical.length} asset${govCritical.length !== 1 ? "s" : ""} flagged as critical or high priority.` : ""} Factors: documentation, ownership, sensitivity labelling, access controls, maintenance, and tagging.`,
      severity: score >= 70 ? "info" : score >= 40 ? "warn" : "critical",
      section: "technical",
    });
  }

  // Views
  if (views > 0) {
    findings.push({
      label: "Views in the Estate",
      body: `${views} view${views !== 1 ? "s" : ""} found. These are included in lineage tracking and domain classification. Views acting as curated access layers should be documented and governed as first-class assets.`,
      severity: "info",
      section: "technical",
    });
  }

  if (findings.length === 0) return null;

  const businessFindings = findings.filter((f) => f.section === "business");
  const technicalFindings = findings.filter((f) => f.section === "technical");

  const severityIcon = (sev: string) => {
    if (sev === "critical") return <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />;
    if (sev === "warn") return <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />;
    return <BarChart3 className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />;
  };

  const critCount = govGaps.filter((g) => g.severity === "critical").length;
  const highCount = govGaps.filter((g) => g.severity === "high").length;
  const actionCount = findings.filter((f) => f.severity === "critical" || f.severity === "warn").length;

  return (
    <Card className="border-primary/20 bg-primary/[0.02]">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          Executive Summary
        </CardTitle>
        <CardDescription>
          {actionCount > 0
            ? `${actionCount} finding${actionCount !== 1 ? "s" : ""} require${actionCount === 1 ? "s" : ""} attention. ${critCount + highCount > 0 ? `${critCount + highCount} governance gap${critCount + highCount !== 1 ? "s" : ""} at critical/high priority.` : ""}`
            : "Your data estate is in good shape. No critical findings."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Business perspective */}
        {businessFindings.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Business Perspective
            </h4>
            <div className="space-y-4">
              {businessFindings.map((f, idx) => (
                <div key={`biz-${idx}`} className="flex gap-3">
                  {severityIcon(f.severity)}
                  <div>
                    <p className="text-sm font-semibold">{f.label}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Divider */}
        {businessFindings.length > 0 && technicalFindings.length > 0 && (
          <div className="border-t" />
        )}

        {/* Technical findings */}
        {technicalFindings.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Technical Detail
            </h4>
            <div className="space-y-3">
              {technicalFindings.map((f, idx) => (
                <div key={`tech-${idx}`} className="flex gap-3">
                  {severityIcon(f.severity)}
                  <div>
                    <p className="text-sm font-semibold">{f.label}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
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
  tooltip,
}: {
  title: string;
  value: string | number;
  icon?: React.ReactNode;
  alert?: boolean;
  tooltip?: string;
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
          {tooltip && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[260px]">
                {tooltip}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

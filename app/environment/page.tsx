"use client";

/**
 * Standalone Environment Scan page.
 *
 * Provides a scope selector (catalog browser), scan trigger, and
 * tabbed results view (Summary / Tables / ERD / Export).
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import {
  Database,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  Search,
  Workflow,
  ShieldAlert,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import dynamic from "next/dynamic";
import type { ERDGraph } from "@/lib/domain/types";

// Lazy-load ERD viewer (heavy dependency: @xyflow/react)
const ERDViewer = dynamic(
  () => import("@/components/environment/erd-viewer").then((m) => ({ default: m.ERDViewer })),
  { ssr: false, loading: () => <Skeleton className="h-[600px] w-full" /> }
);

// ---------------------------------------------------------------------------
// Types (matching API responses)
// ---------------------------------------------------------------------------

interface ScanSummary {
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

interface ScanDetail extends ScanSummary {
  details: TableDetailRow[];
  histories: unknown[];
  lineage: unknown[];
  insights: unknown[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function EnvironmentPage() {
  const [ucScope, setUcScope] = useState("");
  const [scanning, setScanning] = useState(false);
  const [recentScans, setRecentScans] = useState<ScanSummary[]>([]);
  const [selectedScan, setSelectedScan] = useState<ScanDetail | null>(null);
  const [erdGraph, setErdGraph] = useState<ERDGraph | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");

  // Fetch recent scans on mount
  const fetchScans = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch("/api/environment-scan");
      if (!resp.ok) throw new Error("Failed to fetch scans");
      const data = await resp.json();
      setRecentScans(data.scans ?? []);
    } catch {
      toast.error("Failed to load environment scans");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchScans(); }, [fetchScans]);

  const pollForScan = useCallback(async (scanId: string) => {
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes
    const interval = 5_000;

    const poll = async () => {
      attempts++;
      try {
        const resp = await fetch(`/api/environment-scan/${scanId}`);
        if (resp.ok) {
          const scan = await resp.json();
          if (scan.tableCount > 0) {
            setSelectedScan(scan);
            setScanning(false);
            fetchScans();
            toast.success("Environment scan complete!");
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
  }, [fetchScans]);

  // Start a scan
  const handleScan = useCallback(async () => {
    if (!ucScope.trim()) {
      toast.error("Please enter a Unity Catalog scope (e.g., my_catalog.my_schema)");
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
  }, [ucScope, pollForScan]);

  // Load scan detail
  const loadScan = useCallback(async (scanId: string) => {
    try {
      const resp = await fetch(`/api/environment-scan/${scanId}`);
      if (!resp.ok) throw new Error("Not found");
      const scan = await resp.json();
      setSelectedScan(scan);

      // Load ERD data
      const erdResp = await fetch(`/api/environment-scan/${scanId}/erd?format=json`);
      if (erdResp.ok) {
        const erd = await erdResp.json();
        setErdGraph(erd);
      }
    } catch {
      toast.error("Failed to load scan details");
    }
  }, []);

  // Export Excel
  const handleExport = useCallback(async () => {
    if (!selectedScan) return;
    try {
      const resp = await fetch(`/api/environment-scan/${selectedScan.scanId}/export?format=excel`);
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `environment-report-${selectedScan.scanId.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Environment report downloaded");
    } catch {
      toast.error("Failed to export report");
    }
  }, [selectedScan]);

  const humanSize = (bytes: string | number | null): string => {
    if (!bytes) return "—";
    const n = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
    if (isNaN(n) || n === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1);
    return `${(n / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  };

  // Filter tables
  const filteredTables = selectedScan?.details.filter((t) =>
    !searchFilter || t.tableFqn.toLowerCase().includes(searchFilter.toLowerCase())
  ) ?? [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Environment Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Deep metadata analysis with lineage walking, LLM-powered domain categorisation, PII detection, and governance scoring.
        </p>
      </div>

      {/* Scan Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Start a New Scan
          </CardTitle>
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
            <Button onClick={handleScan} disabled={scanning || !ucScope.trim()}>
              {scanning ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Scanning...</>
              ) : (
                <><Workflow className="h-4 w-4 mr-2" /> Scan Environment</>
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Supports: catalog, catalog.schema, or comma-separated scopes. The scan walks lineage to discover related tables.
          </p>
        </CardContent>
      </Card>

      {/* Results */}
      {selectedScan ? (
        <Tabs defaultValue="summary" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="tables">Tables ({selectedScan.details.length})</TabsTrigger>
              <TabsTrigger value="erd">ERD</TabsTrigger>
              <TabsTrigger value="export">Export</TabsTrigger>
            </TabsList>
            <Button variant="ghost" size="sm" onClick={() => setSelectedScan(null)}>
              <RefreshCw className="h-4 w-4 mr-1" /> Back to scans
            </Button>
          </div>

          {/* Summary tab */}
          <TabsContent value="summary" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="Tables" value={selectedScan.tableCount} icon={<Database className="h-4 w-4" />} />
              <StatCard title="Size" value={humanSize(selectedScan.totalSizeBytes)} icon={<BarChart3 className="h-4 w-4" />} />
              <StatCard title="Lineage Discovered" value={selectedScan.lineageDiscoveredCount} icon={<Workflow className="h-4 w-4" />} />
              <StatCard title="Domains" value={selectedScan.domainCount} icon={<Database className="h-4 w-4" />} />
              <StatCard title="PII Tables" value={selectedScan.piiTablesCount} icon={<ShieldAlert className="h-4 w-4" />} alert={selectedScan.piiTablesCount > 0} />
              <StatCard title="Redundancy Pairs" value={selectedScan.redundancyPairsCount} icon={<AlertTriangle className="h-4 w-4" />} alert={selectedScan.redundancyPairsCount > 0} />
              <StatCard title="Data Products" value={selectedScan.dataProductCount} icon={<BarChart3 className="h-4 w-4" />} />
              <StatCard title="Avg Governance" value={`${selectedScan.avgGovernanceScore.toFixed(0)}/100`} icon={<ShieldAlert className="h-4 w-4" />} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard title="With Streaming" value={selectedScan.tablesWithStreaming} />
              <StatCard title="With CDF" value={selectedScan.tablesWithCDF} />
              <StatCard title="Need OPTIMIZE" value={selectedScan.tablesNeedingOptimize} alert={selectedScan.tablesNeedingOptimize > 0} />
              <StatCard title="Need VACUUM" value={selectedScan.tablesNeedingVacuum} alert={selectedScan.tablesNeedingVacuum > 0} />
            </div>

            {selectedScan.scanDurationMs && (
              <p className="text-sm text-muted-foreground">
                Scan completed in {(selectedScan.scanDurationMs / 1000).toFixed(1)}s
              </p>
            )}
          </TabsContent>

          {/* Tables tab */}
          <TabsContent value="tables" className="space-y-3">
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter tables..."
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
                      <TableCell className="font-mono text-xs">{t.tableFqn}</TableCell>
                      <TableCell>
                        {t.dataDomain ? (
                          <Badge variant="secondary">{t.dataDomain}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {t.dataTier ? (
                          <Badge variant="outline" className={
                            t.dataTier === "gold" ? "border-yellow-500 text-yellow-700" :
                            t.dataTier === "silver" ? "border-gray-400 text-gray-600" :
                            t.dataTier === "bronze" ? "border-orange-500 text-orange-700" :
                            "border-blue-400 text-blue-600"
                          }>{t.dataTier}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>{humanSize(t.sizeInBytes)}</TableCell>
                      <TableCell className="text-xs">{t.owner ?? "—"}</TableCell>
                      <TableCell>
                        {t.sensitivityLevel === "confidential" || t.sensitivityLevel === "restricted" ? (
                          <Badge variant="destructive">{t.sensitivityLevel}</Badge>
                        ) : t.sensitivityLevel ? (
                          <Badge variant="secondary">{t.sensitivityLevel}</Badge>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={t.discoveredVia === "lineage" ? "outline" : "default"} className="text-xs">
                          {t.discoveredVia}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredTables.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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

          {/* ERD tab */}
          <TabsContent value="erd">
            {erdGraph ? (
              <ERDViewer graph={erdGraph} />
            ) : (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                <p>No ERD data available. Load scan details to view the diagram.</p>
              </div>
            )}
          </TabsContent>

          {/* Export tab */}
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
                  Download a comprehensive 12-sheet Excel report with executive summary,
                  table inventory, domains, data products, PII analysis, implicit relationships,
                  redundancy report, governance scorecard, table health, lineage, history insights,
                  and tags/properties.
                </p>
                <Button onClick={handleExport}>
                  <Download className="h-4 w-4 mr-2" />
                  Download Excel Report
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        /* Recent scans list */
        <Card>
          <CardHeader>
            <CardTitle>Recent Scans</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : recentScans.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No scans yet. Start a new scan above.
              </p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scan ID</TableHead>
                      <TableHead>Scope</TableHead>
                      <TableHead>Tables</TableHead>
                      <TableHead>Domains</TableHead>
                      <TableHead>Governance</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentScans.map((s) => (
                      <TableRow key={s.scanId}>
                        <TableCell className="font-mono text-xs">{s.scanId.slice(0, 8)}</TableCell>
                        <TableCell>{s.ucPath}</TableCell>
                        <TableCell>{s.tableCount}</TableCell>
                        <TableCell>{s.domainCount}</TableCell>
                        <TableCell>
                          <Badge variant={s.avgGovernanceScore >= 70 ? "default" : s.avgGovernanceScore >= 40 ? "secondary" : "destructive"}>
                            {s.avgGovernanceScore.toFixed(0)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{new Date(s.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => loadScan(s.scanId)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
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
    <Card className={alert ? "border-orange-300 bg-orange-50/50 dark:bg-orange-950/10" : ""}>
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

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Database,
  RefreshCw,
  Loader2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

interface EmbeddingStats {
  enabled: boolean;
  tableExists: boolean;
  totalRecords: number;
  byScope?: Record<string, number>;
  byKind?: Record<string, number>;
}

export function EmbeddingStatus() {
  const [stats, setStats] = React.useState<EmbeddingStats | null>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [rebuilding, setRebuilding] = React.useState(false);
  const [rebuildResult, setRebuildResult] = React.useState<{ success: boolean; message?: string } | null>(null);
  const [loading, setLoading] = React.useState(true);

  const fetchStats = React.useCallback(async () => {
    try {
      const [statusResp, statsResp] = await Promise.all([
        fetch("/api/embeddings/status"),
        fetch("/api/search/stats").catch(() => null),
      ]);
      const statusData = await statusResp.json();
      const statsData = statsResp?.ok ? await statsResp.json() : null;

      setStats({
        enabled: statusData.enabled ?? false,
        tableExists: statusData.tableExists ?? false,
        totalRecords: statusData.totalRecords ?? 0,
        byScope: statusData.byScope ?? {},
        byKind: statsData?.byKind ?? statusData.byKind ?? {},
      });
    } catch {
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const resp = await fetch("/api/embeddings/backfill", { method: "POST" });
      const data = await resp.json();
      setRebuildResult({
        success: resp.ok,
        message: data.message ?? (resp.ok ? "Embeddings rebuilt successfully" : "Rebuild failed"),
      });
      if (resp.ok) fetchStats();
    } catch {
      setRebuildResult({ success: false, message: "Network error" });
    } finally {
      setRebuilding(false);
    }
  };

  if (loading) return null;

  if (!stats?.enabled) {
    return (
      <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 dark:bg-amber-950/30">
        <AlertCircle className="size-4 text-amber-600 dark:text-amber-400" />
        <span className="text-xs text-amber-700 dark:text-amber-300">
          Embedding endpoint not configured. Ask Forge works best with semantic search enabled.
        </span>
      </div>
    );
  }

  return (
    <div className="border-b bg-muted/30">
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <Database className="size-3.5" />
          <span className="font-medium">Knowledge Base</span>
          {stats.totalRecords > 0 ? (
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <CheckCircle2 className="size-2.5 text-green-500" />
              {stats.totalRecords.toLocaleString()} vectors
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-amber-600">
              No embeddings
            </Badge>
          )}
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
        </button>

        <div className="flex items-center gap-2">
          {rebuildResult && (
            <span className={`text-[10px] ${rebuildResult.success ? "text-green-600" : "text-red-600"}`}>
              {rebuildResult.message}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 text-[10px]"
            onClick={handleRebuild}
            disabled={rebuilding}
          >
            {rebuilding ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <RefreshCw className="size-3" />
            )}
            {rebuilding ? "Rebuilding..." : "Rebuild Embeddings"}
          </Button>
        </div>
      </div>

      {expanded && stats && (
        <div className="border-t px-4 py-3">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stats.byScope && Object.entries(stats.byScope).map(([scope, count]) => (
              <ScopeStat key={scope} scope={scope} count={count as number} />
            ))}
          </div>

          {stats.byKind && Object.keys(stats.byKind).length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[10px] font-medium text-muted-foreground">By Kind</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats.byKind).map(([kind, count]) => (
                  <Badge key={kind} variant="outline" className="gap-1 text-[10px]">
                    {kind.replace(/_/g, " ")}
                    <span className="font-semibold">{(count as number).toLocaleString()}</span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScopeStat({ scope, count }: { scope: string; count: number }) {
  const labels: Record<string, string> = {
    estate: "Estate",
    pipeline: "Pipeline",
    genie: "Genie",
    documents: "Documents",
    usecases: "Use Cases",
    insights: "Insights",
  };

  return (
    <div className="text-xs">
      <p className="text-muted-foreground">{labels[scope] ?? scope}</p>
      <p className="text-lg font-semibold">{count.toLocaleString()}</p>
    </div>
  );
}

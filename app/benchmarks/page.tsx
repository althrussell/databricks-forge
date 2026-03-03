"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface BenchmarkRow {
  benchmarkId: string;
  kind: string;
  title: string;
  summary: string;
  sourceType: string;
  sourceUrl: string;
  publisher: string;
  industry: string | null;
  lifecycleStatus: "draft" | "reviewed" | "published" | "deprecated";
  confidence: number;
  ttlDays: number;
  updatedAt: string;
}

const LIFECYCLE_OPTIONS: Array<BenchmarkRow["lifecycleStatus"]> = ["draft", "reviewed", "published", "deprecated"];

export default function BenchmarksPage() {
  const [rows, setRows] = useState<BenchmarkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("all");
  const [status, setStatus] = useState("all");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/benchmarks");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load benchmarks");
      setRows(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load benchmarks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (status !== "all" && r.lifecycleStatus !== status) return false;
      if (!q.trim()) return true;
      const needle = q.toLowerCase();
      return (
        r.title.toLowerCase().includes(needle) ||
        r.summary.toLowerCase().includes(needle) ||
        (r.industry ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, kind, status]);

  async function transition(row: BenchmarkRow, lifecycleStatus: BenchmarkRow["lifecycleStatus"]) {
    const res = await fetch(`/api/benchmarks/${row.benchmarkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lifecycle_status: lifecycleStatus }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Update failed");
    setRows((prev) => prev.map((r) => (r.benchmarkId === row.benchmarkId ? { ...r, lifecycleStatus } : r)));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Benchmark Catalog</h1>
        <p className="text-muted-foreground">
          Public-source benchmark governance with lifecycle states: draft, reviewed, published, deprecated.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Search and moderate benchmark records.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, summary, industry..." />
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger><SelectValue placeholder="Kind" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              <SelectItem value="kpi">KPI</SelectItem>
              <SelectItem value="benchmark_principle">Benchmark Principle</SelectItem>
              <SelectItem value="advisory_theme">Advisory Theme</SelectItem>
              <SelectItem value="platform_best_practice">Platform Best Practice</SelectItem>
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {LIFECYCLE_OPTIONS.map((s) => (
                <SelectItem value={s} key={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{loading ? "Loading..." : `${filtered.length} Records`}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {filtered.map((row) => (
            <div key={row.benchmarkId} className="rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {row.kind} • {row.publisher} • {row.industry || "global"} • confidence {(row.confidence * 100).toFixed(0)}%
                  </p>
                </div>
                <Badge variant="secondary">{row.lifecycleStatus}</Badge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{row.summary}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <a href={row.sourceUrl} className="text-xs text-blue-600 underline underline-offset-2" target="_blank" rel="noreferrer">
                  Source
                </a>
                <div className="flex gap-2">
                  {LIFECYCLE_OPTIONS.map((s) => (
                    <Button
                      key={s}
                      size="sm"
                      variant={row.lifecycleStatus === s ? "default" : "outline"}
                      onClick={async () => {
                        try {
                          await transition(row, s);
                          toast.success(`Status updated to ${s}`);
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Status update failed");
                        }
                      }}
                    >
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {!loading && filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No benchmark records found for the selected filters.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

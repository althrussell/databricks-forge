"use client";

/**
 * AI Comments page -- /environment/comments
 *
 * Three states:
 * 1. Setup -- scope selection + industry picker + generate button
 * 2. Generating -- progress stream
 * 3. Review -- three-panel table-by-table review with inline editing
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Sparkles,
  Loader2,
  MessageSquare,
  ChevronRight,
  History,
  Trash2,
  ArrowLeft,
} from "lucide-react";
import {
  CommentTableNav,
  type TableSummary,
} from "@/components/environment/comment-table-nav";
import {
  CommentReviewPanel,
  type Proposal,
} from "@/components/environment/comment-review-panel";
import { CommentActionBar } from "@/components/environment/comment-action-bar";

type PageState = "setup" | "generating" | "review" | "history";

interface CommentJob {
  id: string;
  status: string;
  tableCount: number;
  columnCount: number;
  appliedCount: number;
  industryId: string | null;
  createdAt: string;
}

export default function AICommentsPage() {
  // -- State --
  const [pageState, setPageState] = useState<PageState>("setup");
  const [jobs, setJobs] = useState<CommentJob[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [tableSummary, setTableSummary] = useState<TableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<Record<string, { canModify: boolean }>>({});
  const [applying, setApplying] = useState(false);
  const [loading, setLoading] = useState(true);

  // Setup state
  const [selectedCatalogs, setSelectedCatalogs] = useState<string[]>([]);
  const [availableCatalogs, setAvailableCatalogs] = useState<string[]>([]);
  const [industries, setIndustries] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedIndustry, setSelectedIndustry] = useState<string>("none");
  const [genProgress, setGenProgress] = useState<{ phase: string; pct: number; detail: string }>({
    phase: "",
    pct: 0,
    detail: "",
  });

  // SSE abort controller for generation cancellation
  const [genAbort, setGenAbort] = useState<AbortController | null>(null);

  // -- Load existing jobs + available catalogs + industries on mount --
  useEffect(() => {
    Promise.all([
      fetch("/api/environment/comments").then((r) => (r.ok ? r.json() : { jobs: [] })),
      fetch("/api/metadata?type=catalogs").then((r) => (r.ok ? r.json() : { catalogs: [] })),
      fetch("/api/industries").then((r) => (r.ok ? r.json() : { industries: [] })),
    ]).then(([jobsData, catData, indData]) => {
      setJobs(jobsData.jobs ?? []);
      setAvailableCatalogs(catData.catalogs?.map((c: { name: string }) => c.name ?? c) ?? []);
      setIndustries(indData.industries ?? []);
      setLoading(false);

      // Auto-resume if a job is in progress
      const active = (jobsData.jobs ?? []).find(
        (j: CommentJob) => j.status === "ready" || j.status === "generating",
      );
      if (active) {
        setActiveJobId(active.id);
        loadJobData(active.id);
        setPageState("review");
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // -- Load job data --
  const loadJobData = useCallback(async (jobId: string) => {
    try {
      const res = await fetch(`/api/environment/comments/${jobId}`);
      if (!res.ok) throw new Error("Failed to load job");
      const data = await res.json();
      setProposals(data.proposals ?? []);
      setTableSummary(data.tableSummary ?? []);

      // Select first table if none selected
      if (data.tableSummary?.length > 0) {
        setSelectedTable((prev) => prev ?? data.tableSummary[0].tableFqn);
      }

      // Check permissions for all tables
      const fqns = (data.tableSummary ?? []).map((t: TableSummary) => t.tableFqn);
      if (fqns.length > 0) {
        fetch("/api/environment/comments/check-permissions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableFqns: fqns }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((data) => {
            if (data?.permissions) setPermissions(data.permissions);
          })
          .catch(() => {});
      }
    } catch {
      toast.error("Failed to load job data");
    }
  }, []);

  // -- Generate comments --
  const handleGenerate = useCallback(async () => {
    if (selectedCatalogs.length === 0) {
      toast.error("Select at least one catalog");
      return;
    }

    const abort = new AbortController();
    setGenAbort(abort);
    setPageState("generating");
    setGenProgress({ phase: "starting", pct: 0, detail: "Starting generation..." });

    try {
      const res = await fetch("/api/environment/comments/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogs: selectedCatalogs,
          industryId: selectedIndustry === "none" ? undefined : selectedIndustry,
        }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error("Generation failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            const event = line.slice(7);
            const nextLine = lines[lines.indexOf(line) + 1];
            if (nextLine?.startsWith("data: ")) {
              try {
                const data = JSON.parse(nextLine.slice(6));
                if (event === "started") {
                  setActiveJobId(data.jobId);
                } else if (event === "progress") {
                  setGenProgress({
                    phase: data.phase,
                    pct: data.pct,
                    detail: data.detail ?? "",
                  });
                } else if (event === "complete") {
                  setActiveJobId(data.jobId);
                  await loadJobData(data.jobId);
                  setPageState("review");
                  toast.success("Generation complete", {
                    description: `${data.tableCount} tables, ${data.columnCount} columns`,
                  });
                } else if (event === "error") {
                  throw new Error(data.message);
                }
              } catch (_parseErr) {
                // SSE parse error, continue
              }
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        toast.info("Generation cancelled");
      } else {
        toast.error(err instanceof Error ? err.message : "Generation failed");
      }
      setPageState("setup");
    } finally {
      setGenAbort(null);
    }
  }, [selectedCatalogs, selectedIndustry, loadJobData]);

  // -- Update proposals --
  const handleUpdateProposals = useCallback(
    async (updates: Array<{ id: string; status: string; editedComment?: string | null }>) => {
      if (!activeJobId) return;
      try {
        const res = await fetch(`/api/environment/comments/${activeJobId}/proposals`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposals: updates }),
        });
        if (!res.ok) throw new Error("Failed to update");

        // Optimistically update local state
        setProposals((prev) =>
          prev.map((p) => {
            const upd = updates.find((u) => u.id === p.id);
            if (!upd) return p;
            return {
              ...p,
              status: upd.status,
              editedComment: upd.editedComment !== undefined ? upd.editedComment ?? null : p.editedComment,
            };
          }),
        );

        // Recompute table summary
        await loadJobData(activeJobId);
      } catch {
        toast.error("Failed to update proposals");
      }
    },
    [activeJobId, loadJobData],
  );

  // -- Apply --
  const handleApplyAll = useCallback(async () => {
    if (!activeJobId) return;
    setApplying(true);
    try {
      const res = await fetch(`/api/environment/comments/${activeJobId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Apply failed");

      toast.success(`Applied ${data.applied} comments`, {
        description: data.failed > 0 ? `${data.failed} failed` : undefined,
      });
      await loadJobData(activeJobId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  }, [activeJobId, loadJobData]);

  const handleApplyTable = useCallback(
    async (tableFqn: string) => {
      if (!activeJobId) return;
      const tableProposals = proposals.filter(
        (p) => p.tableFqn === tableFqn && p.status === "accepted",
      );
      if (tableProposals.length === 0) return;

      try {
        const res = await fetch(`/api/environment/comments/${activeJobId}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalIds: tableProposals.map((p) => p.id) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Apply failed");

        toast.success(`Applied ${data.applied} comments for ${tableFqn.split(".").pop()}`);
        await loadJobData(activeJobId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Apply failed");
      }
    },
    [activeJobId, proposals, loadJobData],
  );

  // -- Undo --
  const handleUndoAll = useCallback(async () => {
    if (!activeJobId) return;
    try {
      const res = await fetch(`/api/environment/comments/${activeJobId}/undo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Undo failed");

      toast.success(`Undone ${data.undone} comments`);
      await loadJobData(activeJobId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Undo failed");
    }
  }, [activeJobId, loadJobData]);

  const handleUndoTable = useCallback(
    async (tableFqn: string) => {
      if (!activeJobId) return;
      const applied = proposals.filter(
        (p) => p.tableFqn === tableFqn && p.status === "applied",
      );
      if (applied.length === 0) return;

      try {
        const res = await fetch(`/api/environment/comments/${activeJobId}/undo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalIds: applied.map((p) => p.id) }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Undo failed");

        toast.success(`Undone ${data.undone} comments`);
        await loadJobData(activeJobId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Undo failed");
      }
    },
    [activeJobId, proposals, loadJobData],
  );

  // -- Next table --
  const handleNextTable = useCallback(() => {
    if (!selectedTable) return;
    const idx = tableSummary.findIndex((t) => t.tableFqn === selectedTable);
    const nextIdx = idx + 1 < tableSummary.length ? idx + 1 : 0;
    setSelectedTable(tableSummary[nextIdx].tableFqn);
  }, [selectedTable, tableSummary]);

  // -- Resume a job from history --
  const handleResumeJob = useCallback(
    async (jobId: string) => {
      setActiveJobId(jobId);
      await loadJobData(jobId);
      setPageState("review");
    },
    [loadJobData],
  );

  // -- Delete job --
  const handleDeleteJob = useCallback(
    async (jobId: string) => {
      try {
        await fetch(`/api/environment/comments/${jobId}`, { method: "DELETE" });
        setJobs((prev) => prev.filter((j) => j.id !== jobId));
        toast.success("Job deleted");
      } catch {
        toast.error("Failed to delete job");
      }
    },
    [],
  );

  // -- Derived state --
  const currentTableProposals = useMemo(
    () => (selectedTable ? proposals.filter((p) => p.tableFqn === selectedTable) : []),
    [proposals, selectedTable],
  );

  const globalCounts = useMemo(() => {
    const c = { accepted: 0, applied: 0, failed: 0, total: proposals.length };
    for (const p of proposals) {
      if (p.status === "accepted") c.accepted++;
      else if (p.status === "applied") c.applied++;
      else if (p.status === "failed") c.failed++;
    }
    return c;
  }, [proposals]);

  // -- Render --
  return (
    <div className="mx-auto max-w-[1400px]">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Comments</h1>
          <p className="mt-1 text-muted-foreground">
            Generate and apply industry-aware descriptions for tables and columns in Unity Catalog.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pageState === "review" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setPageState("setup");
                setActiveJobId(null);
                setProposals([]);
                setTableSummary([]);
                setSelectedTable(null);
              }}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              New Job
            </Button>
          )}
          {pageState !== "history" && jobs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setPageState("history")}>
              <History className="mr-1 h-3.5 w-3.5" />
              History ({jobs.length})
            </Button>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* State: Setup                                                      */}
      {/* ---------------------------------------------------------------- */}
      {pageState === "setup" && !loading && (
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Select Catalogs</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Choose which Unity Catalog catalogs to scan for tables and columns.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {availableCatalogs.map((cat) => {
                    const selected = selectedCatalogs.includes(cat);
                    return (
                      <Badge
                        key={cat}
                        variant={selected ? "default" : "outline"}
                        className="cursor-pointer select-none text-xs"
                        onClick={() =>
                          setSelectedCatalogs((prev) =>
                            selected ? prev.filter((c) => c !== cat) : [...prev, cat],
                          )
                        }
                      >
                        {cat}
                        {selected && <span className="ml-1">x</span>}
                      </Badge>
                    );
                  })}
                  {availableCatalogs.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      No catalogs found. Ensure the SQL warehouse is running.
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2">Industry Context (optional)</h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Select an industry to enrich descriptions with domain-specific terminology.
                </p>
                <Select value={selectedIndustry} onValueChange={setSelectedIndustry}>
                  <SelectTrigger className="w-[300px]">
                    <SelectValue placeholder="No industry (generic descriptions)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No industry</SelectItem>
                    {industries.map((ind) => (
                      <SelectItem key={ind.id} value={ind.id}>
                        {ind.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2">
                <Button
                  onClick={handleGenerate}
                  disabled={selectedCatalogs.length === 0}
                  size="lg"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate AI Comments
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Empty state illustration */}
          {jobs.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <MessageSquare className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-4 font-medium">No comment jobs yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Select catalogs above and generate AI-powered descriptions for your tables and
                  columns. Review, edit, and apply them directly to Unity Catalog.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* State: Generating                                                 */}
      {/* ---------------------------------------------------------------- */}
      {pageState === "generating" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-4 font-medium">Generating AI comments...</p>
            <p className="mt-2 text-sm text-muted-foreground">{genProgress.detail}</p>
            {genProgress.pct > 0 && (
              <div className="mt-4 w-64">
                <div className="h-2 rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${genProgress.pct}%` }}
                  />
                </div>
                <p className="mt-1 text-center text-xs text-muted-foreground">
                  {genProgress.phase} -- {genProgress.pct}%
                </p>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="mt-4"
              onClick={() => genAbort?.abort()}
            >
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* State: Review (three-panel)                                       */}
      {/* ---------------------------------------------------------------- */}
      {pageState === "review" && (
        <div className="flex flex-col" style={{ height: "calc(100vh - 200px)" }}>
          <div className="flex flex-1 overflow-hidden rounded-lg border">
            {/* Left: table navigator */}
            <div className="w-64 shrink-0">
              <CommentTableNav
                tables={tableSummary}
                selectedTable={selectedTable}
                onSelectTable={setSelectedTable}
              />
            </div>

            {/* Center: review panel */}
            <div className="flex-1 overflow-hidden">
              {selectedTable && currentTableProposals.length > 0 ? (
                <CommentReviewPanel
                  tableFqn={selectedTable}
                  proposals={currentTableProposals}
                  permissions={permissions}
                  onUpdateProposals={handleUpdateProposals}
                  onApplyTable={handleApplyTable}
                  onUndoTable={handleUndoTable}
                  onNextTable={handleNextTable}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {tableSummary.length > 0
                    ? "Select a table from the left panel"
                    : "No proposals generated yet"}
                </div>
              )}
            </div>
          </div>

          {/* Bottom: action bar */}
          <CommentActionBar
            acceptedCount={globalCounts.accepted}
            appliedCount={globalCounts.applied}
            failedCount={globalCounts.failed}
            totalCount={globalCounts.total}
            applying={applying}
            onApplyAll={handleApplyAll}
            onUndoAll={handleUndoAll}
          />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* State: History                                                     */}
      {/* ---------------------------------------------------------------- */}
      {pageState === "history" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPageState("setup")}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Back
            </Button>
            <h2 className="text-lg font-semibold">Comment Job History</h2>
          </div>

          {jobs.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                No comment jobs found.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <Card key={job.id}>
                  <CardContent className="flex items-center gap-4 py-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {new Date(job.createdAt).toLocaleDateString()}{" "}
                          {new Date(job.createdAt).toLocaleTimeString()}
                        </span>
                        <Badge
                          variant={
                            job.status === "completed"
                              ? "default"
                              : job.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {job.status}
                        </Badge>
                        {job.industryId && (
                          <Badge variant="outline">{job.industryId}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {job.tableCount} tables, {job.columnCount} columns
                        {job.appliedCount > 0 && `, ${job.appliedCount} applied`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleResumeJob(job.id)}
                      >
                        <ChevronRight className="mr-1 h-3.5 w-3.5" />
                        Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteJob(job.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

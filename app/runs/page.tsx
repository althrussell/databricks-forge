"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  Trash2,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";
import type { PipelineRun } from "@/lib/domain/types";

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed:
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const PAGE_SIZE = 15;

export default function RunsPage() {
  const [runs, setRuns] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fetchingRef = useRef(false);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [page, setPage] = useState(0);

  const fetchRuns = useCallback(async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/runs?limit=200", {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = await res.json();
      setRuns(data.runs);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load runs");
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    fetchRuns();
    return () => abortRef.current?.abort();
  }, [fetchRuns]);

  useEffect(() => {
    const hasActiveRuns = runs.some(
      (r) => r.status === "running" || r.status === "pending"
    );
    if (!hasActiveRuns) return;
    const interval = setInterval(fetchRuns, 5000);
    return () => clearInterval(interval);
  }, [runs, fetchRuns]);

  async function handleDelete(runId: string, businessName: string) {
    try {
      const res = await fetch(`/api/runs/${runId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Failed to delete run");
      }
      setRuns((prev) => prev.filter((r) => r.runId !== runId));
      toast.success(`Deleted run for "${businessName}"`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete run");
    }
  }

  // Apply filters and sorting
  const filtered = runs
    .filter((run) => {
      if (statusFilter !== "all" && run.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          run.config.businessName.toLowerCase().includes(q) ||
          run.config.ucMetadata.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name")
        return a.config.businessName.localeCompare(b.config.businessName);
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Runs</h1>
          <p className="mt-1 text-muted-foreground">
            View and manage your discovery pipeline runs
          </p>
        </div>
        <div className="flex items-center gap-2">
          {runs.filter((r) => r.status === "completed").length >= 2 && (
            <Button variant="outline" asChild>
              <Link href="/runs/compare">Compare Runs</Link>
            </Button>
          )}
          <Button asChild>
            <Link href="/configure">New Discovery</Link>
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      {!loading && runs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by business name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={sortBy}
            onValueChange={(v) => setSortBy(v as typeof sortBy)}
          >
            <SelectTrigger className="w-[140px]">
              <ArrowUpDown className="mr-2 h-3 w-3" />
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Newest First</SelectItem>
              <SelectItem value="name">Name A-Z</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filtered.length} run{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">No runs yet</p>
          <Button asChild className="mt-4">
            <Link href="/configure">Start Your First Discovery</Link>
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">
            No runs match your filters
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Business Name</TableHead>
                  <TableHead>UC Metadata</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginated.map((run) => (
                  <TableRow key={run.runId}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/runs/${run.runId}`}
                        className="hover:underline"
                      >
                        {run.config.businessName}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate font-mono text-xs">
                      {run.config.ucMetadata}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={STATUS_STYLES[run.status] ?? ""}
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-[140px]">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={run.progressPct}
                          className="h-2 flex-1"
                        />
                        <span className="text-xs text-muted-foreground">
                          {run.progressPct}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                      {run.statusMessage ?? "\u2014"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(run.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/runs/${run.runId}`}>View</Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive"
                              disabled={run.status === "running"}
                            >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Delete</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete this run?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the pipeline run
                                for{" "}
                                <strong>{run.config.businessName}</strong> and
                                all associated use cases and exports. This
                                action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() =>
                                  handleDelete(
                                    run.runId,
                                    run.config.businessName
                                  )
                                }
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {currentPage + 1} of {totalPages}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage === 0}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages - 1}
                  onClick={() => setPage(currentPage + 1)}
                >
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

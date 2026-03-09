"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Sparkles,
  Wrench,
  XCircle,
  Clock,
} from "lucide-react";
import { OptimizationReview } from "@/components/genie/optimization-review";
import type { BenchmarkResult, SqlResultPreview } from "@/lib/genie/benchmark-runner";

interface BenchmarkQuestion {
  question: string;
  expectedSql: string | null;
}

interface LabeledResult extends BenchmarkResult {
  isCorrect?: boolean;
  feedbackText?: string;
  userExpectedSql?: string;
}

interface HistoryEntry {
  id: string;
  runAt: string;
  totalQuestions: number;
  passedCount: number;
  failedCount: number;
  errorCount: number;
  passRate: number;
  improvementsApplied: boolean;
  hasFeedback: boolean;
}

interface ImproveResult {
  updatedSerializedSpace: string;
  changes: Array<{
    section: string;
    description: string;
    added: number;
    modified: number;
  }>;
  strategiesRun: string[];
  originalSerializedSpace?: string;
}

function SqlPreviewTable({ preview, label }: { preview: SqlResultPreview; label: string }) {
  if (preview.error) {
    return (
      <div className="mt-1 text-xs text-red-500">
        {label}: {preview.error}
      </div>
    );
  }
  if (preview.columns.length === 0 || preview.rows.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{label}</span>
        <span>
          {preview.rowCount} row{preview.rowCount !== 1 ? "s" : ""}
          {preview.truncated ? " (truncated)" : ""}
        </span>
      </div>
      <div className="max-h-40 overflow-auto rounded border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {preview.columns.map((col) => (
                <th key={col.name} className="px-2 py-1 text-left font-medium">
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 10).map((row, ri) => (
              <tr key={ri} className="border-t">
                {row.map((cell, ci) => (
                  <td key={ci} className="max-w-[200px] truncate px-2 py-1">
                    {cell ?? "NULL"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function BenchmarkPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const router = useRouter();

  const [questions, setQuestions] = useState<BenchmarkQuestion[]>([]);
  const [results, setResults] = useState<LabeledResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [improveResult, setImproveResult] = useState<ImproveResult | null>(null);
  const [applying, setApplying] = useState(false);
  const [cloning, setCloning] = useState(false);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [rateLimitWarning, setRateLimitWarning] = useState(false);

  const selectedCount = useMemo(() => selectedIndices.size, [selectedIndices]);
  const allSelected = selectedCount === questions.length && questions.length > 0;

  const toggleSelection = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(questions.map((_, i) => i)));
    }
  };

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks`);
      if (!res.ok) throw new Error("Failed to load benchmarks");
      const data = await res.json();
      const qs: BenchmarkQuestion[] = data.questions ?? [];
      setQuestions(qs);
      setSelectedIndices(new Set(qs.map((_, i) => i)));
    } catch {
      toast.error("Failed to load benchmark questions");
    } finally {
      setLoading(false);
    }
  }, [spaceId]);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history ?? []);
      }
    } catch {
      // Non-critical
    } finally {
      setHistoryLoading(false);
    }
  }, [spaceId]);

  useEffect(() => {
    fetchQuestions();
    fetchHistory();
  }, [fetchQuestions, fetchHistory]);

  const runBenchmarks = async (overrideQuestions?: BenchmarkQuestion[]) => {
    const toRun = overrideQuestions ?? questions.filter((_, i) => selectedIndices.has(i));
    if (toRun.length === 0) return;
    setRunning(true);
    setResults([]);
    setRunProgress(0);
    setCurrentRunId(null);
    setRateLimitWarning(false);

    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions: toRun }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response stream");
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "result") {
              setResults((prev) => [...prev, event.result]);
              setRunProgress(event.index + 1);
            } else if (event.type === "rate_limited") {
              setRateLimitWarning(true);
            } else if (event.type === "complete") {
              setCurrentRunId(event.runId ?? null);
              fetchHistory();
            }
          } catch {
            // Ignore parse errors in SSE
          }
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Benchmark run failed");
    } finally {
      setRunning(false);
    }
  };

  const rerunFailed = () => {
    const failedQuestions = results
      .filter((r) => !r.passed)
      .map((r) => ({
        question: r.question,
        expectedSql: r.expectedSql,
      }));
    if (failedQuestions.length === 0) return;
    runBenchmarks(failedQuestions);
  };

  const setLabel = (index: number, isCorrect: boolean) => {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, isCorrect } : r)));
  };

  const setFeedbackText = (index: number, text: string) => {
    setResults((prev) => prev.map((r, i) => (i === index ? { ...r, feedbackText: text } : r)));
  };

  const submitFeedback = async () => {
    if (!currentRunId) return;
    setSubmittingFeedback(true);
    try {
      const feedback = results
        .filter((r) => r.isCorrect !== undefined)
        .map((r) => ({
          question: r.question,
          isCorrect: r.isCorrect!,
          feedbackText: r.feedbackText,
          expectedSql: r.userExpectedSql,
        }));

      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkRunId: currentRunId, feedback }),
      });

      if (!res.ok) throw new Error("Failed to submit feedback");
      toast.success("Feedback saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save feedback");
    } finally {
      setSubmittingFeedback(false);
    }
  };

  const runImprove = async () => {
    if (!currentRunId) return;
    setImproving(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/improve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkRunId: currentRunId }),
      });

      if (!res.ok) throw new Error("Failed to generate improvements");
      const data = await res.json();

      if (data.updatedSerializedSpace) {
        setImproveResult(data as ImproveResult);
      } else {
        toast.info(data.message ?? "No improvements identified");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Improvement failed");
    } finally {
      setImproving(false);
    }
  };

  const runOptimize = async () => {
    if (!currentRunId) return;
    setOptimizing(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ benchmarkRunId: currentRunId }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Optimization failed");
      }
      const data = await res.json();

      if (!data.suggestions || data.suggestions.length === 0) {
        toast.info("No optimization suggestions generated");
        return;
      }

      // Merge all suggestions to produce a preview, then show in OptimizationReview
      const mergeRes = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serializedSpace: data.originalSerializedSpace,
          suggestions: data.suggestions,
        }),
      });

      if (!mergeRes.ok) throw new Error("Failed to merge suggestions");
      const mergeData = await mergeRes.json();

      setImproveResult({
        updatedSerializedSpace: mergeData.mergedSerializedSpace,
        changes: data.suggestions.map(
          (s: { category: string; rationale: string; priority: string }) => ({
            section: s.category,
            description: s.rationale,
            added: 0,
            modified: 1,
          }),
        ),
        strategiesRun: ["llm_field_optimization"],
        originalSerializedSpace: data.originalSerializedSpace,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Optimization failed");
    } finally {
      setOptimizing(false);
    }
  };

  const handleApply = async (serializedSpace: string) => {
    setApplying(true);
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serializedSpace }),
      });
      if (!res.ok) throw new Error("Failed to apply improvements");
      toast.success("Improvements applied! Re-run benchmarks to verify.");
      setImproveResult(null);
      fetchHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setApplying(false);
    }
  };

  const handleCloneAndApply = async (serializedSpace: string) => {
    setCloning(true);
    try {
      const cloneRes = await fetch(`/api/genie-spaces/${spaceId}/clone`, {
        method: "POST",
      });
      if (!cloneRes.ok) throw new Error("Clone failed");
      const { clonedSpaceId } = await cloneRes.json();

      const applyRes = await fetch(`/api/genie-spaces/${clonedSpaceId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serializedSpace }),
      });
      if (!applyRes.ok) throw new Error("Apply to clone failed");

      toast.success("Cloned and applied improvements");
      setImproveResult(null);
      router.push(`/genie/${clonedSpaceId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clone and apply failed");
    } finally {
      setCloning(false);
    }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  const labeledIncorrect = results.filter((r) => r.isCorrect === false).length;
  const previousRun = history.length > 0 ? history[0] : null;

  // Show optimization review when improve results are ready
  if (improveResult) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-8">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setImproveResult(null)}>
            <ArrowLeft className="mr-1 size-4" />
            Back to Results
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">Review Improvements</h1>
        </div>
        <OptimizationReview
          changes={improveResult.changes ?? []}
          strategiesRun={improveResult.strategiesRun ?? []}
          currentSerializedSpace={improveResult.originalSerializedSpace ?? "{}"}
          updatedSerializedSpace={improveResult.updatedSerializedSpace}
          onApply={handleApply}
          onCloneAndApply={handleCloneAndApply}
          onCancel={() => setImproveResult(null)}
          applying={applying}
          cloning={cloning}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/genie/${spaceId}`}>
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Benchmark Test Runner</h1>
          <p className="text-sm text-muted-foreground">Space: {spaceId}</p>
        </div>
      </div>

      <Tabs defaultValue="run">
        <TabsList>
          <TabsTrigger value="run">
            <FlaskConical className="mr-1.5 size-4" />
            Run Benchmarks
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="mr-1.5 size-4" />
            History ({history.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="mt-4 space-y-4">
          {loading ? (
            <Skeleton className="h-48" />
          ) : questions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12">
                <FlaskConical className="mb-4 size-10 text-muted-foreground/50" />
                <h2 className="text-lg font-semibold">No benchmark questions</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  This space has no benchmark questions configured. Run a health check and use the
                  Fix workflow to generate them.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Controls */}
              <div className="flex items-center gap-3">
                <Button onClick={() => runBenchmarks()} disabled={running || selectedCount === 0}>
                  {running ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 size-4" />
                  )}
                  {running
                    ? `Running ${runProgress}/${selectedCount}...`
                    : selectedCount === questions.length
                      ? `Run All (${questions.length})`
                      : `Run Selected (${selectedCount}/${questions.length})`}
                </Button>
                {results.length > 0 && !running && failedCount > 0 && (
                  <Button variant="outline" onClick={rerunFailed} disabled={running}>
                    <RotateCcw className="mr-2 size-4" />
                    Re-run Failed ({failedCount})
                  </Button>
                )}
                {results.length > 0 && !running && (
                  <>
                    <Badge variant={passedCount === results.length ? "default" : "secondary"}>
                      {passedCount}/{results.length} passed (
                      {Math.round((passedCount / results.length) * 100)}%)
                    </Badge>
                    {previousRun && (
                      <span className="text-xs text-muted-foreground">
                        Previous: {previousRun.passRate}%
                        {Math.round((passedCount / results.length) * 100) >
                          previousRun.passRate && (
                          <span className="ml-1 text-green-600">
                            +
                            {Math.round((passedCount / results.length) * 100) -
                              previousRun.passRate}
                            %
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </div>

              {rateLimitWarning && !running && (
                <div className="rounded-md border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
                  Some questions hit Databricks API rate limits. Consider running fewer questions at
                  a time or waiting between runs.
                </div>
              )}

              {/* Question selection list */}
              {results.length === 0 && !running && (
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Questions</CardTitle>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={toggleAll}>
                        {allSelected ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    <CardDescription>
                      {selectedCount} of {questions.length} selected
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 p-4 pt-0">
                    {questions.map((q, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
                      >
                        <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                          <Checkbox
                            checked={selectedIndices.has(idx)}
                            onCheckedChange={() => toggleSelection(idx)}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm">{q.question}</div>
                            {q.expectedSql && (
                              <Badge variant="outline" className="mt-1 text-[10px]">
                                Has expected SQL
                              </Badge>
                            )}
                          </div>
                        </label>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 shrink-0 px-2"
                          disabled={running}
                          onClick={() =>
                            runBenchmarks([{ question: q.question, expectedSql: q.expectedSql }])
                          }
                          title={`Run "${q.question}"`}
                        >
                          <Play className="size-3" />
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Results table */}
              {results.length > 0 && (
                <div className="space-y-3">
                  {results.map((result, idx) => (
                    <Card key={idx}>
                      <CardContent className="space-y-3 p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            {result.passed ? (
                              <CheckCircle2 className="mt-0.5 size-5 text-green-500" />
                            ) : (
                              <XCircle className="mt-0.5 size-5 text-red-500" />
                            )}
                            <div>
                              <div className="text-sm font-medium">{result.question}</div>
                              {result.actualSql && (
                                <pre className="mt-1 max-h-24 overflow-auto rounded bg-muted/50 p-2 text-xs">
                                  {result.actualSql}
                                </pre>
                              )}
                              {result.error && (
                                <div className="mt-1 text-xs text-red-500">{result.error}</div>
                              )}
                              {result.actualSqlResult && (
                                <SqlPreviewTable
                                  preview={result.actualSqlResult}
                                  label="Genie Result"
                                />
                              )}
                              {result.expectedSqlResult && (
                                <SqlPreviewTable
                                  preview={result.expectedSqlResult}
                                  label="Expected Result"
                                />
                              )}
                            </div>
                          </div>

                          {/* Label buttons */}
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="sm"
                              variant={result.isCorrect === true ? "default" : "outline"}
                              className="h-7 px-2"
                              onClick={() => setLabel(idx, true)}
                            >
                              <ThumbsUp className="size-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant={result.isCorrect === false ? "destructive" : "outline"}
                              className="h-7 px-2"
                              onClick={() => setLabel(idx, false)}
                            >
                              <ThumbsDown className="size-3" />
                            </Button>
                          </div>
                        </div>

                        {result.isCorrect === false && (
                          <Textarea
                            placeholder="What was wrong? (optional)"
                            value={result.feedbackText ?? ""}
                            onChange={(e) => setFeedbackText(idx, e.target.value)}
                            className="text-xs"
                            rows={2}
                          />
                        )}
                      </CardContent>
                    </Card>
                  ))}

                  {/* Action buttons */}
                  <div className="flex gap-3 pt-2">
                    <Button
                      onClick={submitFeedback}
                      disabled={
                        submittingFeedback ||
                        !currentRunId ||
                        results.every((r) => r.isCorrect === undefined)
                      }
                      variant="outline"
                    >
                      {submittingFeedback ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Save Feedback
                    </Button>
                    {labeledIncorrect > 0 && currentRunId && (
                      <>
                        <Button onClick={runImprove} disabled={improving || optimizing}>
                          {improving ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Wrench className="mr-2 size-4" />
                          )}
                          Improve ({labeledIncorrect} issues)
                        </Button>
                        <Button
                          variant="outline"
                          onClick={runOptimize}
                          disabled={improving || optimizing}
                        >
                          {optimizing ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                          ) : (
                            <Sparkles className="mr-2 size-4" />
                          )}
                          Optimize (LLM)
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          {historyLoading ? (
            <Skeleton className="h-48" />
          ) : history.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sm text-muted-foreground">No benchmark runs yet.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {history.map((run) => (
                <Card key={run.id}>
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {new Date(run.runAt).toLocaleString()}
                      </CardTitle>
                      <div className="flex gap-2">
                        <Badge
                          variant={
                            run.passRate >= 80
                              ? "default"
                              : run.passRate >= 50
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {run.passRate}% pass rate
                        </Badge>
                        {run.improvementsApplied && (
                          <Badge variant="outline" className="text-xs">
                            Improved
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {run.passedCount}/{run.totalQuestions} passed
                      {run.errorCount > 0 && `, ${run.errorCount} errors`}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

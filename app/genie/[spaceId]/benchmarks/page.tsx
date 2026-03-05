"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  ThumbsDown,
  ThumbsUp,
  Wrench,
  XCircle,
  Clock,
} from "lucide-react";
import type { BenchmarkResult } from "@/lib/genie/benchmark-runner";

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

export default function BenchmarkPage() {
  const { spaceId } = useParams<{ spaceId: string }>();

  const [questions, setQuestions] = useState<BenchmarkQuestion[]>([]);
  const [results, setResults] = useState<LabeledResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [runProgress, setRunProgress] = useState(0);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [improving, setImproving] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);

  const fetchQuestions = useCallback(async () => {
    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks`);
      if (!res.ok) throw new Error("Failed to load benchmarks");
      const data = await res.json();
      setQuestions(data.questions ?? []);
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

  const runBenchmarks = async () => {
    if (questions.length === 0) return;
    setRunning(true);
    setResults([]);
    setRunProgress(0);
    setCurrentRunId(null);

    try {
      const res = await fetch(`/api/genie-spaces/${spaceId}/benchmarks/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
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

  const setLabel = (index: number, isCorrect: boolean) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, isCorrect } : r)),
    );
  };

  const setFeedbackText = (index: number, text: string) => {
    setResults((prev) =>
      prev.map((r, i) => (i === index ? { ...r, feedbackText: text } : r)),
    );
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
        const applyRes = await fetch(`/api/genie-spaces/${spaceId}/apply`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ serializedSpace: data.updatedSerializedSpace }),
        });

        if (!applyRes.ok) throw new Error("Failed to apply improvements");
        toast.success("Improvements applied! Re-run benchmarks to verify.");
        fetchHistory();
      } else {
        toast.info(data.message ?? "No improvements identified");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Improvement failed");
    } finally {
      setImproving(false);
    }
  };

  const passedCount = results.filter((r) => r.passed).length;
  const labeledIncorrect = results.filter((r) => r.isCorrect === false).length;
  const previousRun = history.length > 0 ? history[0] : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/genie">
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
                  This space has no benchmark questions configured. Run a health check
                  and use the Fix workflow to generate them.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Controls */}
              <div className="flex items-center gap-3">
                <Button onClick={runBenchmarks} disabled={running}>
                  {running ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 size-4" />
                  )}
                  {running ? `Running ${runProgress}/${questions.length}...` : `Run All (${questions.length})`}
                </Button>
                {results.length > 0 && !running && (
                  <>
                    <Badge variant={passedCount === results.length ? "default" : "secondary"}>
                      {passedCount}/{results.length} passed ({Math.round((passedCount / results.length) * 100)}%)
                    </Badge>
                    {previousRun && (
                      <span className="text-xs text-muted-foreground">
                        Previous: {previousRun.passRate}%
                        {Math.round((passedCount / results.length) * 100) > previousRun.passRate && (
                          <span className="ml-1 text-green-600">
                            +{Math.round((passedCount / results.length) * 100) - previousRun.passRate}%
                          </span>
                        )}
                      </span>
                    )}
                  </>
                )}
              </div>

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
                      disabled={submittingFeedback || !currentRunId || results.every((r) => r.isCorrect === undefined)}
                      variant="outline"
                    >
                      {submittingFeedback ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                      Save Feedback
                    </Button>
                    {labeledIncorrect > 0 && currentRunId && (
                      <Button onClick={runImprove} disabled={improving}>
                        {improving ? (
                          <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                          <Wrench className="mr-2 size-4" />
                        )}
                        Improve ({labeledIncorrect} issues)
                      </Button>
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
                        <Badge variant={run.passRate >= 80 ? "default" : run.passRate >= 50 ? "secondary" : "destructive"}>
                          {run.passRate}% pass rate
                        </Badge>
                        {run.improvementsApplied && (
                          <Badge variant="outline" className="text-xs">Improved</Badge>
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

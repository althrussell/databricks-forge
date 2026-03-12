/**
 * API: /api/genie-spaces/[spaceId]/benchmarks/run
 *
 * POST -- Start a benchmark run (fire-and-forget, returns jobId).
 * GET  -- Poll benchmark run status by jobId.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { startConversation } from "@/lib/dbx/genie";
import { executeSQL } from "@/lib/dbx/sql";
import { saveBenchmarkRun } from "@/lib/lakebase/space-health";
import { reviewBenchmarkExpectedSql } from "@/lib/genie/benchmark-runner";
import { isSafeId } from "@/lib/validation";
import { logger } from "@/lib/logger";
import type { BenchmarkResult, SqlResultPreview } from "@/lib/genie/benchmark-runner";

const DELAY_BETWEEN_QUESTIONS_MS = 5000;

let activeBenchmarkSpaceId: string | null = null;

function acquireLock(spaceId: string): boolean {
  if (activeBenchmarkSpaceId) return false;
  activeBenchmarkSpaceId = spaceId;
  return true;
}

function releaseLock(spaceId: string): void {
  if (activeBenchmarkSpaceId === spaceId) activeBenchmarkSpaceId = null;
}

function normalizeSql(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*([(),])\s*/g, "$1")
    .trim()
    .toLowerCase();
}

function sqlSimilarity(a: string, b: string): number {
  const na = normalizeSql(a);
  const nb = normalizeSql(b);
  if (na === nb) return 1.0;
  const tokensA = new Set(na.split(/\s+/));
  const tokensB = new Set(nb.split(/\s+/));
  const intersection = [...tokensA].filter((t) => tokensB.has(t));
  const union = new Set([...tokensA, ...tokensB]);
  return union.size > 0 ? intersection.length / union.size : 0;
}

const SIMILARITY_THRESHOLD = 0.6;
const MAX_PREVIEW_ROWS = 50;

const READ_ONLY_PATTERN = /^\s*(SELECT|WITH)\b/i;
const BLOCKED_PATTERN =
  /\b(DROP|DELETE|TRUNCATE|UPDATE|INSERT|ALTER|CREATE|GRANT|REVOKE|EXEC|EXECUTE|CALL)\b/i;

async function executeSqlPreview(sql: string): Promise<SqlResultPreview> {
  if (!READ_ONLY_PATTERN.test(sql) || BLOCKED_PATTERN.test(sql)) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      error: "Only read-only SELECT queries are allowed",
    };
  }
  try {
    const result = await executeSQL(sql, undefined, undefined, { waitTimeout: "30s" });
    const totalRows = result.rows.length;
    return {
      columns: result.columns.map((c) => ({ name: c.name, type: c.typeName })),
      rows: result.rows.slice(0, MAX_PREVIEW_ROWS),
      rowCount: totalRows,
      truncated: totalRows > MAX_PREVIEW_ROWS,
    };
  } catch (err) {
    logger.warn("SQL preview execution failed", {
      sql: sql.slice(0, 300),
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// Job tracker
// ---------------------------------------------------------------------------

interface BenchmarkJobStatus {
  jobId: string;
  spaceId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  total: number;
  completed: number;
  passed: number;
  failed: number;
  errorCount: number;
  currentQuestion: string | null;
  results: BenchmarkResult[];
  sqlReviewWarnings?: Array<{ id: string; verdict: string; score: number }>;
  runId?: string;
  error: string | null;
  startedAt: number;
  completedAt: number | null;
  abortController?: AbortController;
}

const benchmarkJobs = new Map<string, BenchmarkJobStatus>();
const JOB_TTL_MS = 30 * 60 * 1000;

function evictStale(): void {
  const now = Date.now();
  for (const [id, job] of benchmarkJobs) {
    if (job.completedAt && now - job.completedAt > JOB_TTL_MS) {
      benchmarkJobs.delete(id);
    } else if (!job.completedAt && now - job.startedAt > JOB_TTL_MS * 2) {
      benchmarkJobs.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// GET handler (poll)
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  await params;
  evictStale();

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId query parameter required" }, { status: 400 });
  }

  const job = benchmarkJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    total: job.total,
    completed: job.completed,
    passed: job.passed,
    failed: job.failed,
    errorCount: job.errorCount,
    currentQuestion: job.currentQuestion,
    results: job.results,
    sqlReviewWarnings: job.sqlReviewWarnings,
    runId: job.runId,
    error: job.error,
  });
}

// ---------------------------------------------------------------------------
// POST handler (fire-and-forget)
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  if (!isSafeId(spaceId)) {
    return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
  }

  const body = await request.json();
  const questions = body.questions as Array<{ question: string; expectedSql?: string }>;

  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: "questions array is required" }, { status: 400 });
  }

  if (!acquireLock(spaceId)) {
    return NextResponse.json(
      { error: "A benchmark run is already in progress. Please wait." },
      { status: 429 },
    );
  }

  const jobId = uuidv4();
  const abortController = new AbortController();

  benchmarkJobs.set(jobId, {
    jobId,
    spaceId,
    status: "running",
    total: questions.length,
    completed: 0,
    passed: 0,
    failed: 0,
    errorCount: 0,
    currentQuestion: null,
    results: [],
    error: null,
    startedAt: Date.now(),
    completedAt: null,
    abortController,
  });

  runBenchmark(jobId, spaceId, questions).catch((err) => {
    const job = benchmarkJobs.get(jobId);
    if (job && job.status === "running") {
      job.status = "failed";
      job.error = err instanceof Error ? err.message : String(err);
      job.completedAt = Date.now();
    }
    releaseLock(spaceId);
  });

  return NextResponse.json({ jobId, status: "running" });
}

// ---------------------------------------------------------------------------
// DELETE handler (cancel)
// ---------------------------------------------------------------------------

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  evictStale();

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId query parameter required" }, { status: 400 });
  }

  const job = benchmarkJobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });
  }

  if (job.status !== "running") {
    return NextResponse.json({ error: "Job is not running" }, { status: 409 });
  }

  job.abortController?.abort();
  job.status = "cancelled";
  job.currentQuestion = null;
  job.completedAt = Date.now();
  releaseLock(spaceId);

  logger.info("Benchmark run cancelled", { jobId, spaceId });
  return NextResponse.json({ success: true });
}

// ---------------------------------------------------------------------------
// Background benchmark logic
// ---------------------------------------------------------------------------

async function runBenchmark(
  jobId: string,
  spaceId: string,
  questions: Array<{ question: string; expectedSql?: string }>,
): Promise<void> {
  const job = benchmarkJobs.get(jobId);
  if (!job) return;

  try {
    const sqlReviews = await reviewBenchmarkExpectedSql(questions);
    if (sqlReviews.length > 0) {
      const warnings = sqlReviews
        .filter((r) => r.result.verdict === "fail" || r.result.verdict === "warn")
        .map((r) => ({ id: r.id, verdict: r.result.verdict, score: r.result.qualityScore }));
      if (warnings.length > 0) {
        job.sqlReviewWarnings = warnings;
      }
    }

    for (let i = 0; i < questions.length; i++) {
      if (job.abortController?.signal.aborted) break;

      const bench = questions[i];
      job.currentQuestion = bench.question;

      try {
        const msg = await startConversation(spaceId, bench.question, 90_000);
        const completed = msg.status === "COMPLETED";
        let passed = completed;

        if (completed && !msg.sql) {
          logger.warn("Genie returned COMPLETED but no SQL", {
            spaceId,
            question: bench.question.slice(0, 200),
          });
        }

        let similarity: number | undefined;
        let comparisonMethod: BenchmarkResult["comparisonMethod"] = "completion_only";
        let failureCategory: BenchmarkResult["failureCategory"];
        let failureReason: string | undefined;

        let actualSqlResult: SqlResultPreview | undefined;
        let expectedSqlResult: SqlResultPreview | undefined;

        if (completed && msg.sql) {
          actualSqlResult = await executeSqlPreview(msg.sql);
        }
        if (bench.expectedSql) {
          expectedSqlResult = await executeSqlPreview(bench.expectedSql);
        }

        if (completed && bench.expectedSql && msg.sql) {
          similarity = sqlSimilarity(bench.expectedSql, msg.sql);

          if (similarity >= 0.9) {
            passed = true;
            comparisonMethod = "sql_similarity";
          } else if (
            actualSqlResult &&
            expectedSqlResult &&
            !actualSqlResult.error &&
            !expectedSqlResult.error &&
            actualSqlResult.rowCount > 0 &&
            expectedSqlResult.rowCount > 0
          ) {
            comparisonMethod = "result";
            const colsMatch =
              actualSqlResult.columns.length === expectedSqlResult.columns.length;
            const rowMatch = actualSqlResult.rowCount === expectedSqlResult.rowCount;
            if (colsMatch && rowMatch) {
              passed = true;
            } else {
              passed = false;
              if (!colsMatch) {
                failureCategory = "wrong_column";
                failureReason = `Column count mismatch: expected ${expectedSqlResult.columns.length}, got ${actualSqlResult.columns.length}`;
              } else {
                failureCategory = "wrong_filter";
                failureReason = `Row count mismatch: expected ${expectedSqlResult.rowCount}, got ${actualSqlResult.rowCount}`;
              }
            }
          } else {
            comparisonMethod = "sql_similarity";
            passed = similarity >= SIMILARITY_THRESHOLD;
            if (!passed) {
              failureReason = `SQL similarity ${Math.round(similarity * 100)}% (threshold: ${Math.round(SIMILARITY_THRESHOLD * 100)}%)`;
              failureCategory = "unknown";
            }
          }
        } else if (!completed) {
          failureCategory = msg.error?.includes("timed out") ? "timeout" : "execution_error";
          failureReason = msg.error || `Genie returned status: ${msg.status}`;
        }

        const result: BenchmarkResult = {
          question: bench.question,
          expectedSql: bench.expectedSql ?? null,
          actualSql: msg.sql ?? null,
          status: msg.status,
          passed,
          error: msg.error,
          actualSqlResult,
          expectedSqlResult,
          sqlSimilarity: similarity,
          comparisonMethod,
          failureCategory: passed ? undefined : failureCategory,
          failureReason: passed ? undefined : failureReason,
        };
        job.results.push(result);
        job.completed = i + 1;
        if (passed) job.passed++;
        else job.failed++;
        if (msg.error) job.errorCount++;
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const result: BenchmarkResult = {
          question: bench.question,
          expectedSql: bench.expectedSql ?? null,
          actualSql: null,
          status: "FAILED",
          passed: false,
          error: errMsg.includes("(429)") || errMsg.includes("RESOURCE_EXHAUSTED")
            ? `Rate limited by Databricks API after retries. ${errMsg}`
            : errMsg,
        };
        job.results.push(result);
        job.completed = i + 1;
        job.failed++;
        job.errorCount++;
      }

      if (i < questions.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_QUESTIONS_MS));
      }
    }

    if (job.status === "cancelled") return;

    const passedCount = job.results.filter((r) => r.passed).length;
    const errorCount = job.results.filter((r) => r.error).length;

    try {
      const runId = await saveBenchmarkRun({
        spaceId,
        totalQuestions: job.results.length,
        passedCount,
        failedCount: job.results.length - passedCount,
        errorCount,
        resultsJson: JSON.stringify(job.results),
      });
      job.runId = runId;
    } catch (err) {
      logger.warn("Failed to persist benchmark run", { error: String(err) });
    }

    job.status = "completed";
    job.currentQuestion = null;
    job.completedAt = Date.now();
  } finally {
    releaseLock(spaceId);
  }
}

/**
 * API: /api/genie-spaces/[spaceId]/benchmarks/run
 *
 * POST -- Run benchmark questions via Genie Conversation API.
 *         Returns SSE stream with per-question progress.
 */

import { NextRequest } from "next/server";
import { startConversation } from "@/lib/dbx/genie";
import { executeSQL } from "@/lib/dbx/sql";
import { saveBenchmarkRun } from "@/lib/lakebase/space-health";
import { reviewBenchmarkExpectedSql } from "@/lib/genie/benchmark-runner";
import { isSafeId } from "@/lib/validation";
import { logger } from "@/lib/logger";
import type { BenchmarkResult, SqlResultPreview } from "@/lib/genie/benchmark-runner";

const DELAY_BETWEEN_QUESTIONS_MS = 5000;

// In-memory lock: one benchmark run at a time per workspace
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  const { spaceId } = await params;
  if (!isSafeId(spaceId)) {
    return new Response(JSON.stringify({ error: "Invalid spaceId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await request.json();
  const questions = body.questions as Array<{ question: string; expectedSql?: string }>;

  if (!Array.isArray(questions) || questions.length === 0) {
    return new Response(JSON.stringify({ error: "questions array is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!acquireLock(spaceId)) {
    return new Response(
      JSON.stringify({ error: "A benchmark run is already in progress. Please wait." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const results: BenchmarkResult[] = [];

      function send(data: Record<string, unknown>) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Client disconnected
        }
      }

      try {
        // Pre-run review: flag low-quality expectedSql before benchmarking
        const sqlReviews = await reviewBenchmarkExpectedSql(questions);
        if (sqlReviews.length > 0) {
          const warnings = sqlReviews
            .filter((r) => r.result.verdict === "fail" || r.result.verdict === "warn")
            .map((r) => ({ id: r.id, verdict: r.result.verdict, score: r.result.qualityScore }));
          if (warnings.length > 0) {
            send({ type: "sql_review", warnings });
          }
        }

        send({ type: "start", total: questions.length });

        for (let i = 0; i < questions.length; i++) {
          const bench = questions[i];
          send({ type: "progress", index: i, question: bench.question, status: "running" });

          try {
            const msg = await startConversation(spaceId, bench.question, 90_000);
            const completed = msg.status === "COMPLETED";
            let passed = completed;

            if (completed && !msg.sql) {
              logger.warn("Genie returned COMPLETED but no SQL", {
                spaceId,
                question: bench.question.slice(0, 200),
              });
            } else if (msg.sql) {
              logger.info("Genie SQL received", {
                spaceId,
                question: bench.question.slice(0, 100),
                sqlPreview: msg.sql.slice(0, 200),
              });
            }

            if (completed && bench.expectedSql && msg.sql) {
              const sim = sqlSimilarity(bench.expectedSql, msg.sql);
              passed = sim >= SIMILARITY_THRESHOLD;
            }

            let actualSqlResult: SqlResultPreview | undefined;
            let expectedSqlResult: SqlResultPreview | undefined;

            if (completed && msg.sql) {
              actualSqlResult = await executeSqlPreview(msg.sql);
            }
            if (bench.expectedSql) {
              expectedSqlResult = await executeSqlPreview(bench.expectedSql);
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
            };
            results.push(result);
            send({ type: "result", index: i, result });
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            const isRateLimited = errMsg.includes("(429)") || errMsg.includes("RESOURCE_EXHAUSTED");

            if (isRateLimited) {
              send({ type: "rate_limited", index: i, question: bench.question });
            }

            const result: BenchmarkResult = {
              question: bench.question,
              expectedSql: bench.expectedSql ?? null,
              actualSql: null,
              status: "FAILED",
              passed: false,
              error: isRateLimited
                ? `Rate limited by Databricks API after retries. ${errMsg}`
                : errMsg,
            };
            results.push(result);
            send({ type: "result", index: i, result });
          }

          if (i < questions.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, DELAY_BETWEEN_QUESTIONS_MS));
          }
        }

        const passed = results.filter((r) => r.passed).length;
        const errorCount = results.filter((r) => r.error).length;

        // Persist benchmark run
        try {
          const runId = await saveBenchmarkRun({
            spaceId,
            totalQuestions: results.length,
            passedCount: passed,
            failedCount: results.length - passed,
            errorCount,
            resultsJson: JSON.stringify(results),
          });

          send({
            type: "complete",
            runId,
            total: results.length,
            passed,
            failed: results.length - passed,
            errorCount,
          });
        } catch (err) {
          logger.warn("Failed to persist benchmark run", { error: String(err) });
          send({
            type: "complete",
            total: results.length,
            passed,
            failed: results.length - passed,
            errorCount,
          });
        }
      } finally {
        releaseLock(spaceId);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

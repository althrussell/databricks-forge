/**
 * Benchmark Runner -- executes benchmark questions against a deployed
 * Genie Space via the Conversation API, optionally executes both expected
 * and actual SQL to compare results, and uses an LLM judge for semantic
 * equivalence when result sets differ.
 */

import { startConversation, type GenieConversationMessage } from "@/lib/dbx/genie";
import { reviewBatch, type BatchReviewItem, type BatchReviewResult } from "@/lib/ai/sql-reviewer";
import { isReviewEnabled, resolveEndpoint } from "@/lib/dbx/client";
import { executeSQL, type SqlResult } from "@/lib/dbx/sql";
import { cachedChatCompletion } from "@/lib/toolkit/llm-cache";
import { createConcurrencyLimiter } from "@/lib/toolkit/concurrency";
import { parseLLMJson } from "@/lib/genie/passes/parse-llm-json";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FailureCategory =
  | "wrong_join"
  | "wrong_filter"
  | "wrong_aggregation"
  | "wrong_column"
  | "missing_data"
  | "wrong_sort"
  | "extra_data"
  | "timeout"
  | "execution_error"
  | "unknown";

export interface SqlResultPreview {
  columns: Array<{ name: string; type: string }>;
  rows: string[][];
  rowCount: number;
  truncated: boolean;
  error?: string;
}

export interface BenchmarkResult {
  question: string;
  expectedSql: string | null;
  actualSql: string | null;
  status: GenieConversationMessage["status"];
  passed: boolean;
  error?: string;
  actualSqlResult?: SqlResultPreview;
  expectedSqlResult?: SqlResultPreview;
  failureCategory?: FailureCategory;
  failureReason?: string;
  comparisonMethod?: "result" | "sql_similarity" | "completion_only";
  sqlSimilarity?: number;
}

export interface BenchmarkRunSummary {
  spaceId: string;
  total: number;
  passed: number;
  failed: number;
  errorCount: number;
  results: BenchmarkResult[];
  expectedSqlReview?: BatchReviewResult[];
  failureCategoryCounts?: Record<FailureCategory, number>;
}

export interface BenchmarkRunOptions {
  timeoutPerQuestion?: number;
  executeResults?: boolean;
  maxResultRows?: number;
  questionDelayMs?: number;
  /** Max concurrent Genie conversations (default 1 = sequential). Set >1 for concurrent execution. */
  concurrency?: number;
}

// ---------------------------------------------------------------------------
// Pre-run SQL review
// ---------------------------------------------------------------------------

/**
 * Pre-run review of benchmark expectedSql to ensure the benchmark suite
 * itself is high quality. Returns review results per benchmark.
 * Only runs when the review endpoint is configured.
 */
export async function reviewBenchmarkExpectedSql(
  benchmarks: Array<{ question: string; expectedSql?: string }>,
): Promise<BatchReviewResult[]> {
  if (!isReviewEnabled("benchmark-review")) return [];

  const items: BatchReviewItem[] = benchmarks
    .filter((b) => b.expectedSql && b.expectedSql.trim().length > 10)
    .map((b, i) => ({
      id: `bench-${i}`,
      sql: b.expectedSql!,
      context: `Expected answer for: ${b.question}`,
    }));

  if (items.length === 0) return [];

  const results = await reviewBatch(items, "benchmark-review");
  const failCount = results.filter((r) => r.result.verdict === "fail").length;

  logger.info("Benchmark expectedSql review complete", {
    reviewed: items.length,
    failCount,
    avgScore: Math.round(results.reduce((s, r) => s + r.result.qualityScore, 0) / results.length),
  });

  return results;
}

// ---------------------------------------------------------------------------
// SQL text similarity (fast pre-check)
// ---------------------------------------------------------------------------

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

const HIGH_SIMILARITY_THRESHOLD = 0.95;
const _LOW_SIMILARITY_THRESHOLD = 0.3;

// ---------------------------------------------------------------------------
// SQL execution for result comparison
// ---------------------------------------------------------------------------

const RESULT_PREVIEW_LIMIT = 50;

async function executeSqlForPreview(sql: string, maxRows: number): Promise<SqlResultPreview> {
  try {
    const wrappedSql = `SELECT * FROM (${sql.replace(/;\s*$/, "")}) __bench LIMIT ${maxRows + 1}`;
    const result: SqlResult = await executeSQL(wrappedSql, undefined, undefined, {
      waitTimeout: "30s",
      submitTimeoutMs: 35_000,
    });

    const truncated = result.rows.length > maxRows;
    const rows = truncated ? result.rows.slice(0, maxRows) : result.rows;

    return {
      columns: result.columns.map((c) => ({ name: c.name, type: c.typeName })),
      rows,
      rowCount: truncated ? result.totalRowCount : rows.length,
      truncated,
    };
  } catch (err) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
      truncated: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function resultSetsMatch(expected: SqlResultPreview, actual: SqlResultPreview): boolean {
  if (expected.error || actual.error) return false;

  const eCols = expected.columns.map((c) => c.name.toLowerCase()).sort();
  const aCols = actual.columns.map((c) => c.name.toLowerCase()).sort();
  if (eCols.length !== aCols.length || !eCols.every((c, i) => c === aCols[i])) return false;

  if (expected.rowCount !== actual.rowCount) return false;

  const eColOrder = expected.columns.map((c) => c.name.toLowerCase());
  const aColMap = new Map(actual.columns.map((c, i) => [c.name.toLowerCase(), i]));

  const normalizeCell = (v: string | null): string =>
    (v ?? "").trim().toLowerCase().replace(/\.0+$/, "");

  const eRows = expected.rows.map((r) => eColOrder.map((_, ci) => normalizeCell(r[ci])).join("|"));
  const aRows = actual.rows.map((r) =>
    eColOrder.map((col) => normalizeCell(r[aColMap.get(col) ?? 0])).join("|"),
  );

  eRows.sort();
  aRows.sort();
  return eRows.every((row, i) => row === aRows[i]);
}

// ---------------------------------------------------------------------------
// LLM judge for semantic equivalence
// ---------------------------------------------------------------------------

interface JudgeVerdict {
  equivalent: boolean;
  failureCategory: FailureCategory;
  reason: string;
}

async function llmJudgeResults(
  question: string,
  expectedSql: string,
  actualSql: string,
  expectedResult: SqlResultPreview,
  actualResult: SqlResultPreview,
): Promise<JudgeVerdict> {
  const formatPreview = (p: SqlResultPreview): string => {
    if (p.error) return `Execution error: ${p.error}`;
    const cols = p.columns.map((c) => c.name).join(", ");
    const sampleRows = p.rows
      .slice(0, 10)
      .map((r) => r.join(", "))
      .join("\n");
    return `Columns: ${cols}\nRow count: ${p.rowCount}\nSample rows:\n${sampleRows}`;
  };

  const messages = [
    {
      role: "system" as const,
      content: `You are an expert SQL benchmark judge. Compare the expected and actual query results for a business question. Determine if the actual result is semantically equivalent to the expected result (same data, possibly in different order or with minor formatting differences).

If NOT equivalent, categorize the failure as exactly one of:
- wrong_join: Incorrect table relationships causing wrong rows
- wrong_filter: Missing or incorrect WHERE conditions
- wrong_aggregation: Wrong aggregate function or GROUP BY
- wrong_column: Wrong columns selected or calculated
- missing_data: Actual result is missing rows present in expected
- wrong_sort: Data is correct but wrong ordering (only if order matters for the question)
- extra_data: Actual result has additional unexpected rows

Return JSON: { "equivalent": boolean, "failureCategory": string, "reason": string }`,
    },
    {
      role: "user" as const,
      content: `Question: ${question}

Expected SQL: ${expectedSql}
Expected Result:
${formatPreview(expectedResult)}

Actual SQL: ${actualSql}
Actual Result:
${formatPreview(actualResult)}

Are these results semantically equivalent?`,
    },
  ];

  try {
    const result = await cachedChatCompletion({
      endpoint: resolveEndpoint("lightweight"),
      messages,
      temperature: 0,
      maxTokens: 512,
      responseFormat: "json_object",
    });

    const parsed = parseLLMJson(result.content ?? "", "benchmark-judge") as Record<string, unknown>;
    return {
      equivalent: parsed.equivalent === true,
      failureCategory: (parsed.failureCategory as FailureCategory) || "unknown",
      reason: String(parsed.reason ?? ""),
    };
  } catch (err) {
    logger.warn("LLM judge failed, falling back to result comparison", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { equivalent: false, failureCategory: "unknown", reason: "LLM judge unavailable" };
  }
}

// ---------------------------------------------------------------------------
// Failure category inference from text patterns (when no result execution)
// ---------------------------------------------------------------------------

function inferFailureCategory(
  question: string,
  expectedSql: string | null,
  actualSql: string | null,
  feedbackText?: string,
): FailureCategory {
  const context = [question, expectedSql, actualSql, feedbackText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/join|relationship|foreign\s*key|cross/.test(context)) return "wrong_join";
  if (
    /where|filter|condition|between|like|in\s*\(/.test(context) &&
    /wrong|missing|incorrect/.test(context)
  )
    return "wrong_filter";
  if (
    /sum|count|avg|average|aggregate|group\s*by|total/.test(context) &&
    /wrong|incorrect/.test(context)
  )
    return "wrong_aggregation";
  if (/column|field|select/.test(context) && /wrong|missing|incorrect/.test(context))
    return "wrong_column";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Main benchmark runner
// ---------------------------------------------------------------------------

/**
 * Run benchmark questions against a deployed Genie Space.
 *
 * Three-tier comparison strategy:
 * 1. If SQL similarity > 0.95, pass immediately (identical queries).
 * 2. If `executeResults` is true and expected SQL exists, execute both
 *    queries and compare result sets. If results differ, invoke an LLM
 *    judge for semantic equivalence and failure categorization.
 * 3. Fall back to SQL text similarity with a threshold of 0.6.
 */
export async function runBenchmarks(
  spaceId: string,
  benchmarks: Array<{ question: string; expectedSql?: string }>,
  options: BenchmarkRunOptions | number = {},
): Promise<BenchmarkRunSummary> {
  const opts: BenchmarkRunOptions =
    typeof options === "number" ? { timeoutPerQuestion: options } : options;
  const timeoutPerQuestion = opts.timeoutPerQuestion ?? 90_000;
  const executeResults = opts.executeResults ?? true;
  const maxResultRows = opts.maxResultRows ?? RESULT_PREVIEW_LIMIT;
  const questionDelayMs = opts.questionDelayMs ?? 1_000;
  const concurrency = opts.concurrency ?? 1;

  /**
   * Evaluate a single benchmark question and return the result.
   */
  async function evaluateOne(bench: {
    question: string;
    expectedSql?: string;
  }): Promise<BenchmarkResult> {
    try {
      const msg = await startConversation(spaceId, bench.question, timeoutPerQuestion);
      const completed = msg.status === "COMPLETED";

      if (!completed) {
        return {
          question: bench.question,
          expectedSql: bench.expectedSql ?? null,
          actualSql: msg.sql ?? null,
          status: msg.status,
          passed: false,
          error: msg.error,
          failureCategory: msg.status === "FAILED" ? "execution_error" : "timeout",
          failureReason: msg.error ?? `Genie returned status: ${msg.status}`,
          comparisonMethod: "completion_only",
        };
      }

      if (!bench.expectedSql || !msg.sql) {
        return {
          question: bench.question,
          expectedSql: bench.expectedSql ?? null,
          actualSql: msg.sql ?? null,
          status: msg.status,
          passed: true,
          comparisonMethod: "completion_only",
        };
      }

      const sim = sqlSimilarity(bench.expectedSql, msg.sql);

      if (sim >= HIGH_SIMILARITY_THRESHOLD) {
        return {
          question: bench.question,
          expectedSql: bench.expectedSql,
          actualSql: msg.sql,
          status: msg.status,
          passed: true,
          sqlSimilarity: sim,
          comparisonMethod: "sql_similarity",
        };
      }

      if (executeResults) {
        const [expectedResult, actualResult] = await Promise.all([
          executeSqlForPreview(bench.expectedSql, maxResultRows),
          executeSqlForPreview(msg.sql, maxResultRows),
        ]);

        if (!expectedResult.error && !actualResult.error) {
          if (resultSetsMatch(expectedResult, actualResult)) {
            return {
              question: bench.question,
              expectedSql: bench.expectedSql,
              actualSql: msg.sql,
              status: msg.status,
              passed: true,
              actualSqlResult: actualResult,
              expectedSqlResult: expectedResult,
              sqlSimilarity: sim,
              comparisonMethod: "result",
            };
          }

          const verdict = await llmJudgeResults(
            bench.question,
            bench.expectedSql,
            msg.sql,
            expectedResult,
            actualResult,
          );

          return {
            question: bench.question,
            expectedSql: bench.expectedSql,
            actualSql: msg.sql,
            status: msg.status,
            passed: verdict.equivalent,
            actualSqlResult: actualResult,
            expectedSqlResult: expectedResult,
            failureCategory: verdict.equivalent ? undefined : verdict.failureCategory,
            failureReason: verdict.equivalent ? undefined : verdict.reason,
            sqlSimilarity: sim,
            comparisonMethod: "result",
          };
        }

        return {
          question: bench.question,
          expectedSql: bench.expectedSql,
          actualSql: msg.sql,
          status: msg.status,
          passed: sim >= 0.6,
          actualSqlResult: actualResult,
          expectedSqlResult: expectedResult,
          failureCategory:
            sim < 0.6
              ? inferFailureCategory(bench.question, bench.expectedSql, msg.sql)
              : undefined,
          failureReason:
            sim < 0.6
              ? `Result execution failed; SQL similarity ${Math.round(sim * 100)}%`
              : undefined,
          sqlSimilarity: sim,
          comparisonMethod: "sql_similarity",
        };
      }

      const passed = sim >= 0.6;
      return {
        question: bench.question,
        expectedSql: bench.expectedSql,
        actualSql: msg.sql,
        status: msg.status,
        passed,
        failureCategory: !passed
          ? inferFailureCategory(bench.question, bench.expectedSql, msg.sql)
          : undefined,
        sqlSimilarity: sim,
        comparisonMethod: "sql_similarity",
      };
    } catch (err) {
      return {
        question: bench.question,
        expectedSql: bench.expectedSql ?? null,
        actualSql: null,
        status: "FAILED",
        passed: false,
        error: err instanceof Error ? err.message : String(err),
        failureCategory: "execution_error",
        comparisonMethod: "completion_only",
      };
    }
  }

  // Run benchmarks either sequentially (legacy) or concurrently
  let results: BenchmarkResult[];

  if (concurrency > 1) {
    const limit = createConcurrencyLimiter(concurrency);
    results = await Promise.all(benchmarks.map((bench) => limit(() => evaluateOne(bench))));
  } else {
    results = [];
    for (let i = 0; i < benchmarks.length; i++) {
      if (i > 0 && questionDelayMs > 0) {
        await new Promise((r) => setTimeout(r, questionDelayMs));
      }
      results.push(await evaluateOne(benchmarks[i]));
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const errorCount = results.filter((r) => r.error).length;

  const failureCategoryCounts = {} as Record<FailureCategory, number>;
  for (const r of results) {
    if (r.failureCategory) {
      failureCategoryCounts[r.failureCategory] =
        (failureCategoryCounts[r.failureCategory] ?? 0) + 1;
    }
  }

  logger.info("Benchmark run complete", {
    spaceId,
    total: results.length,
    passed,
    failed: results.length - passed,
    errorCount,
    failureCategoryCounts,
    comparisonMethods: {
      result: results.filter((r) => r.comparisonMethod === "result").length,
      sql_similarity: results.filter((r) => r.comparisonMethod === "sql_similarity").length,
      completion_only: results.filter((r) => r.comparisonMethod === "completion_only").length,
    },
  });

  return {
    spaceId,
    total: results.length,
    passed,
    failed: results.length - passed,
    errorCount,
    results,
    failureCategoryCounts,
  };
}

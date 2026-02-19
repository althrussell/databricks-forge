/**
 * Benchmark Runner -- executes benchmark questions against a deployed
 * Genie Space via the Conversation API and reports accuracy.
 */

import {
  startConversation,
  type GenieConversationMessage,
} from "@/lib/dbx/genie";
import { logger } from "@/lib/logger";

export interface BenchmarkResult {
  question: string;
  expectedSql: string | null;
  actualSql: string | null;
  status: GenieConversationMessage["status"];
  passed: boolean;
  error?: string;
}

export interface BenchmarkRunSummary {
  spaceId: string;
  total: number;
  passed: number;
  failed: number;
  errorCount: number;
  results: BenchmarkResult[];
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

/**
 * Run benchmark questions against a deployed Genie Space.
 *
 * Each benchmark is sent as a new conversation. If expected SQL is provided,
 * the generated SQL is compared using token-level Jaccard similarity.
 * A benchmark passes if the conversation completes and either no expected SQL
 * exists (we just check for completion) or similarity >= threshold.
 */
export async function runBenchmarks(
  spaceId: string,
  benchmarks: Array<{ question: string; expectedSql?: string }>,
  timeoutPerQuestion = 90_000
): Promise<BenchmarkRunSummary> {
  const results: BenchmarkResult[] = [];

  for (const bench of benchmarks) {
    try {
      const msg = await startConversation(
        spaceId,
        bench.question,
        timeoutPerQuestion
      );

      const completed = msg.status === "COMPLETED";
      let passed = completed;

      if (completed && bench.expectedSql && msg.sql) {
        const sim = sqlSimilarity(bench.expectedSql, msg.sql);
        passed = sim >= SIMILARITY_THRESHOLD;
      }

      results.push({
        question: bench.question,
        expectedSql: bench.expectedSql ?? null,
        actualSql: msg.sql ?? null,
        status: msg.status,
        passed,
        error: msg.error,
      });
    } catch (err) {
      results.push({
        question: bench.question,
        expectedSql: bench.expectedSql ?? null,
        actualSql: null,
        status: "FAILED",
        passed: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const errorCount = results.filter((r) => r.error).length;

  logger.info("Benchmark run complete", {
    spaceId,
    total: results.length,
    passed,
    failed: results.length - passed,
    errorCount,
  });

  return {
    spaceId,
    total: results.length,
    passed,
    failed: results.length - passed,
    errorCount,
    results,
  };
}

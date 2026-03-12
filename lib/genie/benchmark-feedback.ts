/**
 * Benchmark Feedback Analysis -- maps labeled benchmark failures
 * and result-based failure categories to health check IDs for
 * targeted improvement via the fix router.
 */

import type { FailureCategory } from "./benchmark-runner";

export interface FeedbackEntry {
  question: string;
  isCorrect: boolean;
  feedbackText?: string;
  expectedSql?: string;
  failureCategory?: FailureCategory;
}

/**
 * Maps result-based failure categories to the health check IDs that
 * trigger the relevant Genie Engine fix strategies.
 */
const FAILURE_CATEGORY_TO_CHECK_IDS: Record<FailureCategory, string[]> = {
  wrong_join: ["join-specs-for-multi-table"],
  wrong_filter: ["filters-defined", "text-instruction-exists"],
  wrong_aggregation: ["measures-defined"],
  wrong_column: ["columns-have-descriptions", "text-instruction-exists"],
  missing_data: ["filters-defined", "example-sqls-minimum"],
  wrong_sort: ["text-instruction-exists"],
  extra_data: ["filters-defined"],
  timeout: ["example-sqls-minimum"],
  execution_error: ["example-sqls-minimum"],
  unknown: ["measures-defined", "filters-defined", "example-sqls-minimum"],
};

/**
 * Analyze benchmark feedback to determine which fix strategies to run.
 *
 * Two-tier analysis:
 * 1. If feedback entries have `failureCategory` from result-based benchmark
 *    scoring, map categories directly to fix strategies (precise).
 * 2. Fall back to text-pattern matching on feedback text and expected SQL
 *    (heuristic, used when result comparison is unavailable).
 */
export function analyzeFeedbackForFixes(feedback: FeedbackEntry[]): string[] {
  const failures = feedback.filter((f) => !f.isCorrect);
  if (failures.length === 0) return [];

  const checkIds = new Set<string>();

  // Tier 1: Use failure categories from result-based scoring
  const categorizedFailures = failures.filter((f) => f.failureCategory);
  if (categorizedFailures.length > 0) {
    for (const f of categorizedFailures) {
      const ids = FAILURE_CATEGORY_TO_CHECK_IDS[f.failureCategory!] ?? [];
      for (const id of ids) checkIds.add(id);
    }

    if (failures.length >= 3) checkIds.add("text-instruction-exists");
    if (failures.length >= 5) checkIds.add("benchmarks-exist");

    if (checkIds.size > 0) return [...checkIds];
  }

  // Tier 2: Text-pattern heuristic fallback
  const hasJoinIssues = failures.some(
    (f) =>
      f.feedbackText?.toLowerCase().includes("join") ||
      f.expectedSql?.toLowerCase().includes("join"),
  );
  if (hasJoinIssues) checkIds.add("join-specs-for-multi-table");

  const hasTimeIssues = failures.some(
    (f) =>
      f.feedbackText?.toLowerCase().includes("time") ||
      f.feedbackText?.toLowerCase().includes("date") ||
      f.feedbackText?.toLowerCase().includes("period"),
  );
  if (hasTimeIssues) checkIds.add("filters-defined");

  const hasMeasureIssues = failures.some(
    (f) =>
      f.feedbackText?.toLowerCase().includes("sum") ||
      f.feedbackText?.toLowerCase().includes("count") ||
      f.feedbackText?.toLowerCase().includes("average") ||
      f.feedbackText?.toLowerCase().includes("aggregate"),
  );
  if (hasMeasureIssues) checkIds.add("measures-defined");

  const hasExpectedSql = failures.some((f) => f.expectedSql);
  if (hasExpectedSql) checkIds.add("example-sqls-minimum");

  if (failures.length >= 3) checkIds.add("text-instruction-exists");

  if (checkIds.size === 0) {
    checkIds.add("measures-defined");
    checkIds.add("filters-defined");
    checkIds.add("example-sqls-minimum");
  }

  return [...checkIds];
}

/**
 * Summarize failure categories from a benchmark run into a human-readable
 * description for display in the UI.
 */
export function summarizeFailureCategories(
  counts: Record<FailureCategory, number> | undefined,
): string[] {
  if (!counts) return [];
  const labels: Record<FailureCategory, string> = {
    wrong_join: "Incorrect table joins",
    wrong_filter: "Missing or wrong filters",
    wrong_aggregation: "Wrong aggregation logic",
    wrong_column: "Wrong columns selected",
    missing_data: "Missing expected rows",
    wrong_sort: "Incorrect ordering",
    extra_data: "Unexpected extra rows",
    timeout: "Genie timed out",
    execution_error: "SQL execution errors",
    unknown: "Unclassified failures",
  };

  return Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, count]) => `${labels[cat as FailureCategory]}: ${count}`);
}

/**
 * Compute pass rate delta between two benchmark runs.
 */
export function computePassRateDelta(
  current: { passed: number; total: number },
  previous: { passed: number; total: number },
): number {
  const currentRate = current.total > 0 ? (current.passed / current.total) * 100 : 0;
  const previousRate = previous.total > 0 ? (previous.passed / previous.total) * 100 : 0;
  return Math.round(currentRate - previousRate);
}

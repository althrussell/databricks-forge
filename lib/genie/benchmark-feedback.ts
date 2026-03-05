/**
 * Benchmark Feedback Analysis -- maps labeled benchmark failures
 * to health check IDs for targeted improvement.
 */

export interface FeedbackEntry {
  question: string;
  isCorrect: boolean;
  feedbackText?: string;
  expectedSql?: string;
}

/**
 * Analyze benchmark feedback to determine which fix strategies to run.
 * Detects common failure patterns (join issues, time handling, aggregation)
 * and maps them to specific health check IDs that trigger the relevant
 * engine passes via the fix router.
 */
export function analyzeFeedbackForFixes(feedback: FeedbackEntry[]): string[] {
  const failures = feedback.filter((f) => !f.isCorrect);
  if (failures.length === 0) return [];

  const checkIds: string[] = [];

  const hasJoinIssues = failures.some(
    (f) =>
      f.feedbackText?.toLowerCase().includes("join") ||
      f.expectedSql?.toLowerCase().includes("join"),
  );
  if (hasJoinIssues) checkIds.push("join-specs-for-multi-table");

  const hasTimeIssues = failures.some(
    (f) =>
      f.feedbackText?.toLowerCase().includes("time") ||
      f.feedbackText?.toLowerCase().includes("date") ||
      f.feedbackText?.toLowerCase().includes("period"),
  );
  if (hasTimeIssues) checkIds.push("filters-defined");

  const hasMeasureIssues = failures.some(
    (f) =>
      f.feedbackText?.toLowerCase().includes("sum") ||
      f.feedbackText?.toLowerCase().includes("count") ||
      f.feedbackText?.toLowerCase().includes("average") ||
      f.feedbackText?.toLowerCase().includes("aggregate"),
  );
  if (hasMeasureIssues) checkIds.push("measures-defined");

  const hasExpectedSql = failures.some((f) => f.expectedSql);
  if (hasExpectedSql) checkIds.push("example-sqls-minimum");

  if (failures.length >= 3) checkIds.push("text-instruction-exists");

  if (checkIds.length === 0) {
    checkIds.push("measures-defined", "filters-defined", "example-sqls-minimum");
  }

  return [...new Set(checkIds)];
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

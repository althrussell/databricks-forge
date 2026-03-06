/**
 * Genie Space Health Check -- deterministic scorer.
 *
 * Pure function: takes a parsed serialized_space JSON object and optional
 * user overrides, returns a SpaceHealthReport with per-category and overall
 * scores, individual check results, and quick wins.
 *
 * No LLM calls, no side effects, no network IO.
 */

import {
  runEvaluator,
  clearPendingSqlQualityChecks,
  resolveSqlQualityChecks,
} from "./health-checks/evaluators";
import { resolveRegistry } from "./health-checks/registry";
import type {
  CategoryScore,
  CheckResult,
  Finding,
  Grade,
  Severity,
  SpaceHealthReport,
  UserCheckOverride,
  UserCustomCheck,
} from "./health-checks/types";
import type { SpaceJson } from "@/lib/genie/types";

const MAX_QUICK_WINS = 5;

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function computeGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * Run the full health check against a parsed serialized space JSON.
 *
 * @param space - The parsed `serialized_space` JSON (v2 format)
 * @param overrides - Optional user overrides for built-in check thresholds
 * @param customChecks - Optional user-defined custom checks
 * @param categoryWeights - Optional category weight overrides (must sum to 100)
 */
export function runHealthCheck(
  space: SpaceJson,
  overrides?: UserCheckOverride[],
  customChecks?: UserCustomCheck[],
  categoryWeights?: Record<string, number>,
): SpaceHealthReport {
  const registry = resolveRegistry(overrides, customChecks, categoryWeights);

  clearPendingSqlQualityChecks();

  const results: CheckResult[] = [];
  for (const check of registry.checks) {
    if (check.enabled === false) continue;
    const result = runEvaluator(space, check);
    if (result) results.push(result);
  }

  const categories: Record<string, CategoryScore> = {};
  for (const [catId, catDef] of Object.entries(registry.categories)) {
    const catChecks = results.filter((r) => r.category === catId);
    const passed = catChecks.filter((r) => r.passed).length;
    const total = catChecks.length;
    categories[catId] = {
      label: catDef.label,
      weight: catDef.weight,
      score: total > 0 ? Math.round((passed / total) * 100) : 100,
      passed,
      total,
    };
  }

  const totalWeight = Object.values(categories).reduce((sum, c) => sum + c.weight, 0);
  const overallScore =
    totalWeight > 0
      ? Math.round(
          Object.values(categories).reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight,
        )
      : 0;

  const failedChecks = results.filter((r) => !r.passed);
  const fixableCount = failedChecks.filter((r) => r.fixable).length;

  const quickWins = failedChecks
    .map((r) => {
      const checkDef = registry.checks.find((c) => c.id === r.id);
      if (!checkDef?.quick_win) return null;
      return { text: checkDef.quick_win, severity: r.severity };
    })
    .filter((qw): qw is { text: string; severity: Severity } => qw != null)
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .slice(0, MAX_QUICK_WINS)
    .map((qw) => qw.text);

  const findings: Finding[] = failedChecks
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
    .map((check) => {
      const checkDef = registry.checks.find((c) => c.id === check.id);
      const fixHint = check.fixable && check.fixStrategy
        ? ` (auto-fixable via ${check.fixStrategy.replace(/_/g, " ")})`
        : "";
      return {
        category: check.severity === "critical" ? "warning" as const : "suggestion" as const,
        severity: check.severity,
        description: check.description + (check.detail ? `: ${check.detail}` : ""),
        recommendation: (checkDef?.quick_win ?? `Address the "${check.description}" check`) + fixHint,
        reference: check.id,
      };
    });

  return {
    overallScore,
    grade: computeGrade(overallScore),
    categories,
    checks: results,
    quickWins,
    fixableCount,
    findings,
  };
}

/**
 * Resolve async SQL quality checks and merge results into an existing report.
 * Call after runHealthCheck() when the review endpoint is configured.
 * This mutates the report in place, updating check results and recalculating scores.
 */
export async function enrichReportWithSqlQuality(
  space: SpaceJson,
  report: SpaceHealthReport,
): Promise<SpaceHealthReport> {
  const asyncResults = await resolveSqlQualityChecks(space);
  if (asyncResults.length === 0) return report;

  for (const asyncResult of asyncResults) {
    const idx = report.checks.findIndex((c) => c.id === asyncResult.id);
    if (idx >= 0) {
      report.checks[idx] = asyncResult;
    } else {
      report.checks.push(asyncResult);
    }
  }

  // Recalculate category scores
  for (const [catId, catScore] of Object.entries(report.categories)) {
    const catChecks = report.checks.filter((r) => r.category === catId);
    const passed = catChecks.filter((r) => r.passed).length;
    const total = catChecks.length;
    catScore.passed = passed;
    catScore.total = total;
    catScore.score = total > 0 ? Math.round((passed / total) * 100) : 100;
  }

  // Recalculate overall score
  const totalWeight = Object.values(report.categories).reduce((sum, c) => sum + c.weight, 0);
  report.overallScore =
    totalWeight > 0
      ? Math.round(
          Object.values(report.categories).reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight,
        )
      : 0;
  report.grade = computeGrade(report.overallScore);

  return report;
}

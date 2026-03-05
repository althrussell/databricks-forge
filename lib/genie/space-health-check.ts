/**
 * Genie Space Health Check -- deterministic scorer.
 *
 * Pure function: takes a parsed serialized_space JSON object and optional
 * user overrides, returns a SpaceHealthReport with per-category and overall
 * scores, individual check results, and quick wins.
 *
 * No LLM calls, no side effects, no network IO.
 */

import { runEvaluator } from "./health-checks/evaluators";
import { resolveRegistry } from "./health-checks/registry";
import type {
  CategoryScore,
  CheckResult,
  Grade,
  Severity,
  SpaceHealthReport,
  UserCheckOverride,
  UserCustomCheck,
} from "./health-checks/types";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  space: Record<string, any>,
  overrides?: UserCheckOverride[],
  customChecks?: UserCustomCheck[],
  categoryWeights?: Record<string, number>,
): SpaceHealthReport {
  const registry = resolveRegistry(overrides, customChecks, categoryWeights);

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

  return {
    overallScore,
    grade: computeGrade(overallScore),
    categories,
    checks: results,
    quickWins,
    fixableCount,
  };
}

/**
 * Deterministic evaluator functions for the Genie Space Health Check engine.
 *
 * Each evaluator is a pure function that inspects a serialized space JSON
 * against a check definition and returns a pass/fail result.
 */

import type { CheckDefinition, CheckResult } from "./types";
import {
  reviewBatch as defaultReviewBatch,
  type BatchReviewItem,
  type BatchReviewResult,
} from "@/lib/ai/sql-reviewer";
import { isReviewEnabled as defaultIsReviewEnabled } from "@/lib/dbx/client";
import type { SpaceJson } from "@/lib/genie/types";

// ---------------------------------------------------------------------------
// Injectable dependencies for portability
// ---------------------------------------------------------------------------

export type ReviewBatchFn = (
  items: BatchReviewItem[],
  surface?: string,
  schemaContext?: string,
) => Promise<BatchReviewResult[]>;

export type IsReviewEnabledFn = (surface?: string) => boolean;

let _reviewBatchFn: ReviewBatchFn = defaultReviewBatch;
let _isReviewEnabledFn: IsReviewEnabledFn = defaultIsReviewEnabled;

/**
 * Override the SQL review implementation used by the health check engine.
 * Call before `runHealthCheck()` + `enrichReportWithSqlQuality()` to
 * inject an alternative review backend or a test stub.
 */
export function setHealthCheckReviewFn(fn: ReviewBatchFn): void {
  _reviewBatchFn = fn;
}

/**
 * Override the review-enabled gate function.
 */
export function setHealthCheckReviewEnabledFn(fn: IsReviewEnabledFn): void {
  _isReviewEnabledFn = fn;
}

/**
 * Reset to default Databricks implementations.
 */
export function resetHealthCheckDeps(): void {
  _reviewBatchFn = defaultReviewBatch;
  _isReviewEnabledFn = defaultIsReviewEnabled;
}

/**
 * Resolve a dot-notation path (with optional `[*]` array wildcards) against
 * the space JSON. Returns an array of resolved values.
 */
export function resolvePath(obj: SpaceJson, path: string): unknown[] {
  if (!path || !obj) return [];

  const segments = path.split(".");
  let current: unknown[] = [obj];

  for (const seg of segments) {
    const next: unknown[] = [];
    const arrayMatch = seg.match(/^(.+)\[\*\]$/);

    for (const item of current) {
      if (item == null || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;

      if (arrayMatch) {
        const key = arrayMatch[1];
        const arr = record[key];
        if (Array.isArray(arr)) {
          next.push(...arr);
        }
      } else {
        if (seg in record) {
          next.push(record[seg]);
        }
      }
    }
    current = next;
  }

  return current;
}

function resolveArray(obj: SpaceJson, path: string): unknown[] {
  const values = resolvePath(obj, path);
  if (values.length === 1 && Array.isArray(values[0])) {
    return values[0] as unknown[];
  }
  return values;
}

function collectAllIds(space: SpaceJson): string[] {
  const ids: string[] = [];

  const walk = (obj: unknown) => {
    if (obj == null) return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    if (typeof obj === "object") {
      const record = obj as Record<string, unknown>;
      if ("id" in record && typeof record.id === "string") {
        ids.push(record.id);
      }
      for (const val of Object.values(record)) {
        walk(val);
      }
    }
  };

  walk(space);
  return ids;
}

function hasNonEmptyField(item: unknown, field: string): boolean {
  if (item == null || typeof item !== "object") return false;
  const record = item as Record<string, unknown>;
  const val = record[field];
  if (val == null) return false;
  if (typeof val === "boolean") return val === true;
  if (typeof val === "string") return val.trim().length > 0;
  if (Array.isArray(val))
    return val.length > 0 && val.some((v) => v != null && String(v).trim().length > 0);
  return true;
}

function buildResult(check: CheckDefinition, passed: boolean, detail?: string): CheckResult {
  return {
    id: check.id,
    category: check.category,
    description: check.description,
    passed,
    severity: check.severity,
    detail,
    fixable: check.fixable,
    fixStrategy: check.fix_strategy,
  };
}

// ---------------------------------------------------------------------------
// Evaluator implementations
// ---------------------------------------------------------------------------

function evaluateCount(space: SpaceJson, check: CheckDefinition): CheckResult {
  const arr = resolveArray(space, check.path!);
  const count = arr.length;
  const min = (check.params.min as number | undefined) ?? 0;
  const max = check.params.max as number | undefined;

  const passesMin = count >= min;
  const passesMax = max == null || count <= max;
  const passed = passesMin && passesMax;

  let detail = `Found ${count}`;
  if (!passesMin) detail += `, need at least ${min}`;
  if (!passesMax) detail += `, exceeds maximum of ${max}`;

  return buildResult(check, passed, detail);
}

function evaluateRange(space: SpaceJson, check: CheckDefinition): CheckResult {
  const arr = resolveArray(space, check.path!);
  const count = arr.length;
  const min = (check.params.min as number | undefined) ?? 0;
  const max = (check.params.max as number | undefined) ?? Infinity;
  const warnAbove = check.params.warn_above as number | undefined;

  const inRange = count >= min && count <= max;
  const belowWarn = warnAbove == null || count <= warnAbove;
  const passed = inRange && belowWarn;

  let detail = `Found ${count} (range: ${min}-${max})`;
  if (warnAbove != null && count > warnAbove) detail += `, exceeds recommended ${warnAbove}`;
  if (!inRange) detail += ` -- outside allowed range`;

  return buildResult(check, passed, detail);
}

function evaluateExists(space: SpaceJson, check: CheckDefinition): CheckResult {
  const values = resolvePath(space, check.path!);
  const passed = values.length > 0 && values.some((v) => v != null);
  return buildResult(check, passed, passed ? "Present" : "Missing");
}

function evaluateLength(space: SpaceJson, check: CheckDefinition): CheckResult {
  const values = resolvePath(space, check.path!);
  const min = (check.params.min as number | undefined) ?? 0;
  const max = check.params.max as number | undefined;

  let totalLength = 0;
  for (const v of values) {
    if (typeof v === "string") totalLength += v.length;
    else if (Array.isArray(v)) totalLength += v.join(" ").length;
  }

  const passesMin = totalLength >= min;
  const passesMax = max == null || totalLength <= max;
  const passed = passesMin && passesMax;

  return buildResult(check, passed, `Length: ${totalLength} chars`);
}

function evaluateRatio(space: SpaceJson, check: CheckDefinition): CheckResult {
  const arr = resolveArray(space, check.path!);
  const field = check.field!;
  const minRatio = (check.params.min_ratio as number) ?? 0;

  if (arr.length === 0) {
    return buildResult(check, true, "No items to evaluate (vacuously passes)");
  }

  const withField = arr.filter((item) => hasNonEmptyField(item, field)).length;
  const ratio = withField / arr.length;
  const passed = ratio >= minRatio;

  return buildResult(
    check,
    passed,
    `${withField}/${arr.length} (${Math.round(ratio * 100)}%) have ${field}, need ${Math.round(minRatio * 100)}%`,
  );
}

function evaluateNestedRatio(space: SpaceJson, check: CheckDefinition): CheckResult {
  const resolved = resolvePath(space, check.path!);
  const field = check.field!;
  const minRatio = (check.params.min_ratio as number) ?? 0;

  // Flatten: resolvePath may return arrays of arrays for paths like
  // `tables[*].column_configs` -- we need the individual items.
  const items: unknown[] = [];
  for (const val of resolved) {
    if (Array.isArray(val)) items.push(...val);
    else items.push(val);
  }

  if (items.length === 0) {
    return buildResult(check, true, "No items to evaluate (vacuously passes)");
  }

  const withField = items.filter((item) => hasNonEmptyField(item, field)).length;
  const ratio = withField / items.length;
  const passed = ratio >= minRatio;

  return buildResult(
    check,
    passed,
    `${withField}/${items.length} (${Math.round(ratio * 100)}%) have ${field}, need ${Math.round(minRatio * 100)}%`,
  );
}

function evaluatePattern(space: SpaceJson, check: CheckDefinition): CheckResult {
  const regexStr = check.params.regex as string;
  const regex = new RegExp(regexStr);

  const values =
    check.path === "__all_ids__"
      ? collectAllIds(space)
      : resolvePath(space, check.path!).filter((v): v is string => typeof v === "string");

  if (values.length === 0) {
    return buildResult(check, true, "No values to check");
  }

  const invalid = (values as string[]).filter((v) => !regex.test(v));
  const passed = invalid.length === 0;

  return buildResult(
    check,
    passed,
    passed
      ? `All ${values.length} values match pattern`
      : `${invalid.length} invalid: ${invalid
          .slice(0, 3)
          .map((v) => `"${v}"`)
          .join(", ")}${invalid.length > 3 ? "..." : ""}`,
  );
}

function evaluateUnique(space: SpaceJson, check: CheckDefinition): CheckResult {
  const values =
    check.path === "__all_ids__"
      ? collectAllIds(space)
      : resolvePath(space, check.path!).filter((v): v is string => typeof v === "string");

  if (values.length === 0) {
    return buildResult(check, true, "No values to check");
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const v of values as string[]) {
    if (seen.has(v)) duplicates.push(v);
    else seen.add(v);
  }

  const passed = duplicates.length === 0;
  return buildResult(
    check,
    passed,
    passed
      ? `All ${values.length} values unique`
      : `${duplicates.length} duplicate(s): ${[...new Set(duplicates)]
          .slice(0, 3)
          .map((v) => `"${v}"`)
          .join(", ")}`,
  );
}

function evaluateNoEmptyField(space: SpaceJson, check: CheckDefinition): CheckResult {
  const paths = check.paths ?? (check.path ? [check.path] : []);
  let emptyCount = 0;
  let totalChecked = 0;

  for (const p of paths) {
    const items = resolvePath(space, p);
    for (const item of items) {
      totalChecked++;
      if (item == null) {
        emptyCount++;
      } else if (Array.isArray(item)) {
        if (item.length === 0 || item.every((v) => !v || String(v).trim() === "")) emptyCount++;
      } else if (typeof item === "string" && item.trim() === "") {
        emptyCount++;
      }
    }
  }

  const passed = emptyCount === 0;
  return buildResult(
    check,
    passed,
    passed ? `All ${totalChecked} SQL fields populated` : `${emptyCount} empty SQL field(s) found`,
  );
}

function evaluateConditionalCount(space: SpaceJson, check: CheckDefinition): CheckResult {
  const conditionPath = check.condition_path!;
  const conditionMin = check.condition_min ?? 1;

  const conditionArr = resolveArray(space, conditionPath);
  if (conditionArr.length < conditionMin) {
    return buildResult(
      check,
      true,
      `Condition not met (${conditionArr.length} < ${conditionMin}), skipped`,
    );
  }

  return evaluateCount(space, check);
}

/**
 * LLM qualitative evaluator -- returns a placeholder result.
 * Actual LLM evaluation is handled by runLlmQualitativeChecks() in synthesis.ts.
 * This is registered so the evaluator name is valid and registry validation passes.
 * When deep analysis is not requested, qualitative checks are skipped.
 */
function evaluateLlmQualitative(_space: SpaceJson, check: CheckDefinition): CheckResult {
  return buildResult(check, true, "Qualitative check (requires deep analysis mode)");
}

function evaluateJsonpath(space: SpaceJson, check: CheckDefinition): CheckResult {
  const path = check.path;
  if (!path) return buildResult(check, false, "No path specified for jsonpath evaluator");

  const values = resolvePath(space, path);
  const minCount = (check.params.min as number | undefined) ?? 1;

  if (values.length >= minCount) {
    return buildResult(check, true, `JSONPath resolved ${values.length} value(s)`);
  }
  return buildResult(
    check,
    false,
    `JSONPath resolved ${values.length} value(s), need at least ${minCount}`,
  );
}

/**
 * SQL quality evaluator -- reviews SQL snippets at the specified paths
 * via the dedicated review endpoint. Returns pass when the average quality
 * score meets the configured min_score threshold.
 *
 * Since this requires an async LLM call, it stores a pending promise.
 * The health check runner resolves async evaluator results separately.
 * As a synchronous fallback (when the review endpoint is not configured),
 * it returns a pass-through result.
 */
let _pendingSqlQualityChecks: Array<{
  check: CheckDefinition;
  items: BatchReviewItem[];
}> = [];

export function clearPendingSqlQualityChecks() {
  _pendingSqlQualityChecks = [];
}

export async function resolveSqlQualityChecks(_space: SpaceJson): Promise<CheckResult[]> {
  const pending = [..._pendingSqlQualityChecks];
  _pendingSqlQualityChecks = [];
  if (pending.length === 0) return [];

  const results: CheckResult[] = [];
  for (const { check, items } of pending) {
    if (items.length === 0) {
      results.push(buildResult(check, true, "No SQL snippets to review"));
      continue;
    }

    const batchResults = await _reviewBatchFn(items, "health-check-sql-quality");
    const scores = batchResults.map((r) => r.result.qualityScore);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const failCount = batchResults.filter((r) => r.result.verdict === "fail").length;
    const minScore = (check.params.min_score as number) ?? 60;
    const passed = avgScore >= minScore && failCount === 0;

    results.push(
      buildResult(
        check,
        passed,
        `Avg quality: ${Math.round(avgScore)}/100 across ${items.length} snippets (${failCount} failures, threshold: ${minScore})`,
      ),
    );
  }
  return results;
}

function evaluateSqlQuality(space: SpaceJson, check: CheckDefinition): CheckResult {
  if (!_isReviewEnabledFn("health-check-sql-quality")) {
    return buildResult(check, true, "SQL quality review not enabled (no review endpoint)");
  }

  const paths = check.paths ?? (check.path ? [check.path] : []);
  const items: BatchReviewItem[] = [];
  let idx = 0;
  for (const p of paths) {
    const values = resolvePath(space, p);
    for (const v of values) {
      if (typeof v === "string" && v.trim().length > 5) {
        items.push({ id: `sql-${idx++}`, sql: v });
      }
    }
  }

  _pendingSqlQualityChecks.push({ check, items });
  return buildResult(check, true, `Queued ${items.length} SQL snippets for review (async)`);
}

// ---------------------------------------------------------------------------
// Evaluator registry
// ---------------------------------------------------------------------------

const EVALUATORS: Record<string, (space: SpaceJson, check: CheckDefinition) => CheckResult> = {
  count: evaluateCount,
  range: evaluateRange,
  exists: evaluateExists,
  length: evaluateLength,
  ratio: evaluateRatio,
  nested_ratio: evaluateNestedRatio,
  pattern: evaluatePattern,
  unique: evaluateUnique,
  no_empty_field: evaluateNoEmptyField,
  conditional_count: evaluateConditionalCount,
  jsonpath: evaluateJsonpath,
  llm_qualitative: evaluateLlmQualitative,
  sql_quality: evaluateSqlQuality,
};

/**
 * Run a single check against a serialized space JSON.
 * Returns null if the evaluator type is unrecognized.
 */
export function runEvaluator(space: SpaceJson, check: CheckDefinition): CheckResult | null {
  const evaluator = EVALUATORS[check.evaluator];
  if (!evaluator) return null;
  return evaluator(space, check);
}

/** Returns the set of registered evaluator type names. */
export function getRegisteredEvaluators(): Set<string> {
  return new Set(Object.keys(EVALUATORS));
}

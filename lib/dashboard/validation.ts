/**
 * Dashboard SQL Validation — EXPLAIN-based dry-run and metric view checks.
 *
 * Runs EXPLAIN on each dataset SQL to catch runtime planning errors
 * (bad column references, missing tables, syntax errors) that schema
 * allowlist validation alone cannot detect.
 *
 * Also provides deterministic validation that SQL querying metric views
 * uses the required MEASURE() syntax with aliases and GROUP BY.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";
import type { MetricViewForDashboard } from "./types";

/**
 * Validate dashboard dataset SQL via EXPLAIN dry-run.
 * Returns null on success, or the error message on failure.
 */
export async function validateDatasetSql(sql: string, datasetName: string): Promise<string | null> {
  try {
    await executeSQL(`EXPLAIN ${sql}`);
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("Dashboard SQL EXPLAIN failed", {
      dataset: datasetName,
      error: msg,
    });
    return msg;
  }
}

// ---------------------------------------------------------------------------
// Metric View SQL Validation
// ---------------------------------------------------------------------------

export interface MetricViewValidationResult {
  valid: boolean;
  issues: string[];
}

/**
 * Detect which metric view FQN (if any) is referenced in a SQL string's
 * FROM clause. Returns the FQN lowercased, or null if none found.
 */
function detectMetricViewInSql(
  sql: string,
  metricViewFqns: Set<string>,
): string | null {
  const upper = sql.toUpperCase();
  for (const fqn of metricViewFqns) {
    const fqnUpper = fqn.toUpperCase();
    const fromIdx = upper.indexOf(fqnUpper);
    if (fromIdx !== -1) return fqn;
  }
  return null;
}

/**
 * Validate that SQL querying a metric view follows the required syntax:
 *
 * 1. Measure columns must be wrapped in MEASURE(col) AS col
 * 2. Every MEASURE() call must have an explicit AS alias
 * 3. GROUP BY (or GROUP BY ALL) must be present
 * 4. No SELECT * on metric views
 *
 * Returns { valid: true, issues: [] } when no metric view is referenced
 * or all checks pass. Issues are descriptive strings for logging.
 */
export function validateMetricViewSql(
  sql: string,
  metricViewFqns: Set<string>,
  metricViewMeasures: Map<string, string[]>,
): MetricViewValidationResult {
  const issues: string[] = [];

  const matchedFqn = detectMetricViewInSql(sql, metricViewFqns);
  if (!matchedFqn) return { valid: true, issues: [] };

  const sqlUpper = sql.toUpperCase();

  // Check 1: No SELECT *
  if (/\bSELECT\s+\*/i.test(sql)) {
    issues.push("SELECT * is not supported on metric views");
  }

  // Check 2: GROUP BY must be present
  if (!sqlUpper.includes("GROUP BY")) {
    issues.push("Missing GROUP BY (use GROUP BY ALL) when querying a metric view with MEASURE()");
  }

  // Check 3: Measure columns should appear inside MEASURE() calls with AS aliases
  const measures = metricViewMeasures.get(matchedFqn.toLowerCase()) ?? [];
  if (measures.length > 0) {
    const measureCallRegex = /\bMEASURE\s*\(\s*(\w+)\s*\)/gi;
    const foundMeasureCalls = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = measureCallRegex.exec(sql)) !== null) {
      foundMeasureCalls.add(m[1].toLowerCase());
    }

    for (const measure of measures) {
      const measureLower = measure.toLowerCase();
      if (!foundMeasureCalls.has(measureLower)) {
        const bareRefRegex = new RegExp(`\\b${measure}\\b`, "i");
        if (bareRefRegex.test(sql)) {
          issues.push(
            `Measure "${measure}" referenced without MEASURE() wrapper -- use MEASURE(${measure}) AS ${measure}`,
          );
        }
      }
    }

    // Check 4: Every MEASURE() call should have an AS alias
    const measureWithAliasRegex = /\bMEASURE\s*\([^)]+\)\s+AS\s+/gi;
    const aliasedCount = (sql.match(measureWithAliasRegex) ?? []).length;
    const totalMeasureCalls = foundMeasureCalls.size;
    if (totalMeasureCalls > 0 && aliasedCount < totalMeasureCalls) {
      issues.push(
        `${totalMeasureCalls - aliasedCount} MEASURE() call(s) missing AS alias -- use MEASURE(col) AS col`,
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Dashboard SQL Validation — EXPLAIN-based dry-run for dataset queries.
 *
 * Runs EXPLAIN on each dataset SQL to catch runtime planning errors
 * (bad column references, missing tables, syntax errors) that schema
 * allowlist validation alone cannot detect.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";

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

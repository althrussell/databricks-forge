/**
 * SQL proposer for the Ask Forge assistant.
 *
 * CRITICAL CONSTRAINT: This is a thin wrapper that delegates to the existing
 * SQL generation engine. It does NOT define new SQL prompts. All SQL quality
 * comes from:
 *   - USE_CASE_SQL_GEN_PROMPT template (lib/ai/templates.ts)
 *   - DATABRICKS_SQL_RULES (lib/ai/sql-rules.ts)
 *   - cleanSqlResponse + attemptSqlFix (lib/pipeline/steps/sql-generation.ts)
 *
 * The assistant's LLM response may already include SQL in markdown code blocks.
 * This module handles the "Run SQL" and "Fix SQL" flows after the user clicks
 * those CTAs.
 */

import { executeSQL, type SqlResult } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";

export interface SqlExecutionResult {
  success: boolean;
  result?: SqlResult;
  error?: string;
  durationMs: number;
}

/**
 * Execute SQL proposed by the assistant against the configured warehouse.
 * Wraps executeSQL with error handling and timing.
 */
export async function executeSql(sql: string): Promise<SqlExecutionResult> {
  const start = Date.now();
  try {
    const result = await executeSQL(sql, undefined, undefined, {
      waitTimeout: "30s",
    });
    return {
      success: true,
      result,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn("[assistant/sql] Execution failed", { error: msg });
    return {
      success: false,
      error: msg,
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Validate SQL by running EXPLAIN (dry-run).
 */
export async function validateSql(sql: string): Promise<string | null> {
  try {
    await executeSQL(`EXPLAIN ${sql}`);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * Extract SQL code blocks from a markdown response.
 */
export function extractSqlBlocks(markdown: string): string[] {
  const blocks: string[] = [];
  const regex = /```sql\s*\n([\s\S]*?)```/gi;
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    const sql = match[1].trim();
    if (sql) blocks.push(sql);
  }
  return blocks;
}

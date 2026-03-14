/**
 * Data Engine Pass 3: Fact Generation
 *
 * Generates CREATE TABLE AS SELECT (CTAS) SQL for each fact table,
 * referencing seed/dimension tables via FK lookups, with narrative
 * patterns embedded as temporal and distributional SQL expressions.
 */

import { resolveEndpoint } from "@/lib/dbx/client";
import { buildTableCommentDDL, buildBatchColumnCommentDDL } from "@/lib/ai/comment-applier";
import type { LLMClient } from "@/lib/ports/llm-client";
import type { SqlExecutor } from "@/lib/ports/sql-executor";
import type { Logger } from "@/lib/ports/logger";
import type { TableDesign, TablePhase, DataNarrative } from "../../types";
import { FACT_TABLE_PROMPT } from "../prompts";

const MAX_RETRIES = 2;
const DATE_RANGE_DAYS = 180;

export async function runFactGeneration(
  table: TableDesign,
  catalog: string,
  schema: string,
  dimensionTables: TableDesign[],
  narratives: DataNarrative[],
  research: { customerName: string; industryId: string; nomenclature: Record<string, string> },
  opts: {
    llm: LLMClient;
    sql: SqlExecutor;
    logger: Logger;
    signal?: AbortSignal;
    onPhase?: (phase: TablePhase) => void;
    reviewAndFixSql?: (sql: string, error: string, context?: string) => Promise<string>;
  },
): Promise<{ rowCount: number; error?: string }> {
  const { llm, sql, logger: log, signal, onPhase, reviewAndFixSql } = opts;

  onPhase?.("generating-sql");

  const relatedNarratives = narratives.filter((n) =>
    n.affectedTables.includes(table.name),
  );

  const dimensionContext = dimensionTables
    .map((d) => `${d.name}: ${d.columns.map((c) => `${c.name} ${c.dataType}`).join(", ")}`)
    .join("\n");

  const prompt = FACT_TABLE_PROMPT
    .replace("{catalog}", catalog)
    .replace("{schema}", schema)
    .replace("{table_name}", table.name)
    .replace("{description}", table.description)
    .replace("{columns_json}", JSON.stringify(table.columns))
    .replace(/{row_target}/g, String(table.rowTarget))
    .replace("{dimension_tables_context}", dimensionContext)
    .replace("{narrative_context}", JSON.stringify(relatedNarratives))
    .replace("{customer_name}", research.customerName)
    .replace("{industry_name}", research.industryId)
    .replace("{nomenclature}", JSON.stringify(research.nomenclature))
    .replace("{date_range}", String(DATE_RANGE_DAYS));

  const endpoint = resolveEndpoint("sql");

  const response = await llm.chat({
    endpoint,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    maxTokens: 16_384,
    signal,
  });

  let sqlText = response.content.trim();
  sqlText = sqlText.replace(/^```(?:sql)?\n?/i, "").replace(/\n?```$/i, "");

  onPhase?.("executing");

  let retries = 0;
  let currentSql = sqlText;

  while (retries <= MAX_RETRIES) {
    try {
      await sql.execute(currentSql, catalog, schema);
      break;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      log.warn("Fact SQL failed", { table: table.name, retry: retries, error });

      if (retries >= MAX_RETRIES) {
        onPhase?.("failed");
        return { rowCount: 0, error };
      }

      onPhase?.("retrying");
      retries++;

      if (error.includes("TABLE_OR_VIEW_NOT_FOUND")) {
        log.info("Re-generating SQL from scratch due to missing table", { table: table.name });
        const retryResponse = await llm.chat({
          endpoint,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
          maxTokens: 16_384,
          signal,
        });
        currentSql = retryResponse.content.trim();
        currentSql = currentSql.replace(/^```(?:sql)?\n?/i, "").replace(/\n?```$/i, "");
      } else if (reviewAndFixSql) {
        currentSql = await reviewAndFixSql(currentSql, error, `Fact table: ${table.name}`);
      }
    }
  }

  // Apply table and column comments
  await applyComments(table, catalog, schema, sql, log);

  onPhase?.("completed");
  return { rowCount: table.rowTarget };
}

async function applyComments(
  table: TableDesign,
  catalog: string,
  schema: string,
  sql: SqlExecutor,
  log: Logger,
): Promise<void> {
  const fqn = `${catalog}.${schema}.${table.name}`;
  try {
    if (table.description) {
      await sql.execute(buildTableCommentDDL(fqn, table.description));
    }
    const columnsWithComments = table.columns
      .filter((c) => c.description)
      .map((c) => ({ columnName: c.name, comment: c.description }));
    if (columnsWithComments.length > 0) {
      await sql.execute(buildBatchColumnCommentDDL(fqn, columnsWithComments));
    }
  } catch (err) {
    log.warn("Failed to apply comments (non-fatal)", {
      table: table.name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

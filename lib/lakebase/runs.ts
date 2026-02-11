/**
 * CRUD operations for the inspire_runs Lakebase table.
 */

import { executeSQL, executeSQLMapped, type SqlColumn } from "@/lib/dbx/sql";
import { LAKEBASE_SCHEMA } from "./schema";
import type {
  PipelineRun,
  PipelineRunConfig,
  PipelineStep,
  RunStatus,
  BusinessContext,
} from "@/lib/domain/types";

const TABLE = `${LAKEBASE_SCHEMA}.inspire_runs`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function rowToRun(row: string[], columns: SqlColumn[]): PipelineRun {
  const col = (name: string) => {
    const idx = columns.findIndex((c) => c.name === name);
    return idx >= 0 ? row[idx] : null;
  };

  const parsePriorities = (val: string | null) => {
    if (!val) return [];
    try {
      return JSON.parse(val);
    } catch {
      return val.split(",").map((s) => s.trim());
    }
  };

  const parseLanguages = (val: string | null) => {
    if (!val) return ["English"];
    try {
      return JSON.parse(val);
    } catch {
      return [val];
    }
  };

  const parseGenerationOptions = (val: string | null) => {
    if (!val) return ["SQL Code"];
    try {
      return JSON.parse(val);
    } catch {
      return [val];
    }
  };

  let businessContext: BusinessContext | null = null;
  const bcRaw = col("business_context");
  if (bcRaw) {
    try {
      businessContext = JSON.parse(bcRaw);
    } catch {
      businessContext = null;
    }
  }

  return {
    runId: col("run_id") ?? "",
    config: {
      businessName: col("business_name") ?? "",
      ucMetadata: col("uc_metadata") ?? "",
      operation: (col("operation") as PipelineRunConfig["operation"]) ?? "Discover Usecases",
      businessDomains: col("business_domains") ?? "",
      businessPriorities: parsePriorities(col("business_priorities")),
      strategicGoals: col("strategic_goals") ?? "",
      generationOptions: parseGenerationOptions(col("generation_options")),
      generationPath: col("generation_path") ?? "./inspire_gen/",
      languages: parseLanguages(col("languages")),
      aiModel: col("ai_model") ?? "databricks-claude-sonnet-4-5",
    },
    status: (col("status") as RunStatus) ?? "pending",
    currentStep: (col("current_step") as PipelineStep) ?? null,
    progressPct: parseInt(col("progress_pct") ?? "0", 10),
    businessContext,
    errorMessage: col("error_message") ?? null,
    createdAt: col("created_at") ?? new Date().toISOString(),
    completedAt: col("completed_at") ?? null,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createRun(
  runId: string,
  config: PipelineRunConfig
): Promise<void> {
  const sql = `
    INSERT INTO ${TABLE}
      (run_id, business_name, uc_metadata, operation, business_priorities,
       strategic_goals, business_domains, ai_model, languages,
       generation_options, generation_path, status, progress_pct)
    VALUES
      ('${escapeSQL(runId)}',
       '${escapeSQL(config.businessName)}',
       '${escapeSQL(config.ucMetadata)}',
       '${escapeSQL(config.operation)}',
       '${escapeSQL(JSON.stringify(config.businessPriorities))}',
       '${escapeSQL(config.strategicGoals)}',
       '${escapeSQL(config.businessDomains)}',
       '${escapeSQL(config.aiModel)}',
       '${escapeSQL(JSON.stringify(config.languages))}',
       '${escapeSQL(JSON.stringify(config.generationOptions))}',
       '${escapeSQL(config.generationPath)}',
       'pending',
       0)
  `;
  await executeSQL(sql);
}

export async function getRunById(runId: string): Promise<PipelineRun | null> {
  const sql = `SELECT * FROM ${TABLE} WHERE run_id = '${escapeSQL(runId)}'`;
  const rows = await executeSQLMapped(sql, rowToRun);
  return rows.length > 0 ? rows[0] : null;
}

export async function listRuns(
  limit = 50,
  offset = 0
): Promise<PipelineRun[]> {
  const sql = `
    SELECT * FROM ${TABLE}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return executeSQLMapped(sql, rowToRun);
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  currentStep: PipelineStep | null,
  progressPct: number,
  errorMessage?: string
): Promise<void> {
  const parts: string[] = [
    `status = '${escapeSQL(status)}'`,
    `current_step = ${currentStep ? `'${escapeSQL(currentStep)}'` : "NULL"}`,
    `progress_pct = ${progressPct}`,
  ];

  if (errorMessage !== undefined) {
    parts.push(`error_message = '${escapeSQL(errorMessage)}'`);
  }

  if (status === "completed" || status === "failed") {
    parts.push(`completed_at = current_timestamp()`);
  }

  const sql = `
    UPDATE ${TABLE}
    SET ${parts.join(", ")}
    WHERE run_id = '${escapeSQL(runId)}'
  `;
  await executeSQL(sql);
}

export async function updateRunBusinessContext(
  runId: string,
  context: BusinessContext
): Promise<void> {
  const sql = `
    UPDATE ${TABLE}
    SET business_context = '${escapeSQL(JSON.stringify(context))}'
    WHERE run_id = '${escapeSQL(runId)}'
  `;
  await executeSQL(sql);
}

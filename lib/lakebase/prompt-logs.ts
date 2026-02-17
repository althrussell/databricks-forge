/**
 * CRUD operations for the prompt audit log — backed by Lakebase (Prisma).
 *
 * Each LLM call during a pipeline run is recorded with the rendered prompt,
 * raw response, execution metadata, and timing. Used for debugging, auditing,
 * and prompt regression detection.
 */

import { getPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Token usage statistics from Model Serving. */
export interface PromptTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface PromptLogEntry {
  logId: string;
  runId: string;
  step: string;
  promptKey: string;
  promptVersion: string;
  model: string;
  temperature: number;
  renderedPrompt: string;
  rawResponse: string | null;
  honestyScore: number | null;
  durationMs: number | null;
  /** Token usage from FMAPI (prompt, completion, total). Null if unavailable. */
  tokenUsage: PromptTokenUsage | null;
  success: boolean;
  errorMessage: string | null;
}

// ---------------------------------------------------------------------------
// Insert (fire-and-forget safe)
// ---------------------------------------------------------------------------

/**
 * Insert a prompt log entry. Designed to be called fire-and-forget so logging
 * failures never block the pipeline. Errors are caught and logged.
 */
export async function insertPromptLog(entry: PromptLogEntry): Promise<void> {
  try {
    const prisma = await getPrisma();
    await prisma.forgePromptLog.create({
      data: {
        logId: entry.logId,
        runId: entry.runId,
        step: entry.step,
        promptKey: entry.promptKey,
        promptVersion: entry.promptVersion,
        model: entry.model,
        temperature: entry.temperature,
        renderedPrompt: entry.renderedPrompt,
        rawResponse: entry.rawResponse,
        honestyScore: entry.honestyScore,
        durationMs: entry.durationMs,
        promptTokens: entry.tokenUsage?.promptTokens ?? null,
        completionTokens: entry.tokenUsage?.completionTokens ?? null,
        totalTokens: entry.tokenUsage?.totalTokens ?? null,
        success: entry.success,
        errorMessage: entry.errorMessage,
      },
    });
  } catch (error) {
    logger.warn("Failed to insert prompt log entry", {
      logId: entry.logId,
      runId: entry.runId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get all prompt log entries for a run, ordered by creation time.
 */
export async function getPromptLogsByRunId(runId: string): Promise<PromptLogEntry[]> {
  const prisma = await getPrisma();
  const rows = await prisma.forgePromptLog.findMany({
    where: { runId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(dbRowToPromptLog);
}

/**
 * Get prompt log entries for a specific pipeline step within a run.
 */
export async function getPromptLogsByStep(
  runId: string,
  step: string
): Promise<PromptLogEntry[]> {
  const prisma = await getPrisma();
  const rows = await prisma.forgePromptLog.findMany({
    where: { runId, step },
    orderBy: { createdAt: "asc" },
  });
  return rows.map(dbRowToPromptLog);
}

/**
 * Get summary stats for a run's LLM calls, including token usage.
 */
export async function getPromptLogStats(runId: string): Promise<{
  totalCalls: number;
  successCount: number;
  failureCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
}> {
  const prisma = await getPrisma();
  const rows = await prisma.forgePromptLog.findMany({
    where: { runId },
    select: {
      success: true,
      durationMs: true,
      promptTokens: true,
      completionTokens: true,
      totalTokens: true,
    },
  });

  const totalCalls = rows.length;
  const successCount = rows.filter((r) => r.success).length;
  const failureCount = totalCalls - successCount;
  const durations = rows.map((r) => r.durationMs ?? 0);
  const totalDurationMs = durations.reduce((a, b) => a + b, 0);
  const avgDurationMs = totalCalls > 0 ? Math.round(totalDurationMs / totalCalls) : 0;
  const totalPromptTokens = rows.reduce((a, r) => a + (r.promptTokens ?? 0), 0);
  const totalCompletionTokens = rows.reduce((a, r) => a + (r.completionTokens ?? 0), 0);
  const totalTokens = rows.reduce((a, r) => a + (r.totalTokens ?? 0), 0);

  return {
    totalCalls,
    successCount,
    failureCount,
    totalDurationMs,
    avgDurationMs,
    totalPromptTokens,
    totalCompletionTokens,
    totalTokens,
  };
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function dbRowToPromptLog(row: {
  logId: string;
  runId: string;
  step: string;
  promptKey: string;
  promptVersion: string;
  model: string;
  temperature: number;
  renderedPrompt: string;
  rawResponse: string | null;
  honestyScore: number | null;
  durationMs: number | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  success: boolean;
  errorMessage: string | null;
}): PromptLogEntry {
  const tokenUsage: PromptTokenUsage | null =
    row.promptTokens !== null || row.completionTokens !== null || row.totalTokens !== null
      ? {
          promptTokens: row.promptTokens ?? 0,
          completionTokens: row.completionTokens ?? 0,
          totalTokens: row.totalTokens ?? 0,
        }
      : null;

  return {
    logId: row.logId,
    runId: row.runId,
    step: row.step,
    promptKey: row.promptKey,
    promptVersion: row.promptVersion,
    model: row.model,
    temperature: row.temperature,
    renderedPrompt: row.renderedPrompt,
    rawResponse: row.rawResponse,
    honestyScore: row.honestyScore,
    durationMs: row.durationMs,
    tokenUsage,
    success: row.success,
    errorMessage: row.errorMessage,
  };
}

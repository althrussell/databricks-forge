/**
 * In-memory status tracker for Data Engine jobs,
 * with write-through persistence to Lakebase.
 *
 * Extends the Genie Engine pattern with per-table phase tracking.
 */

import { isAuthErrorMessage } from "@/lib/lakebase/auth-errors";
import { upsertJobStatus, getPersistedJobStatus } from "@/lib/lakebase/background-jobs";
import type { TablePhase, TableGenerationStatus } from "../types";
import type { DataJobStatus } from "./types";

const jobs = new Map<string, DataJobStatus>();
const controllers = new Map<string, AbortController>();
const JOB_TTL_MS = 30 * 60 * 1000;

function evictStaleJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const completedAt =
      job.status === "completed" || job.status === "failed" ? Date.now() : null;
    if (completedAt && Date.now() - completedAt > JOB_TTL_MS) {
      jobs.delete(id);
    }
  }
}

export async function startDataJob(sessionId: string): Promise<AbortController> {
  controllers.get(sessionId)?.abort();

  const controller = new AbortController();
  controllers.set(sessionId, controller);

  jobs.set(sessionId, {
    sessionId,
    status: "generating",
    message: "Starting data generation...",
    percent: 0,
    totalTables: 0,
    completedTables: 0,
    tableStatuses: [],
    error: undefined,
  });

  await upsertJobStatus(sessionId, "demo-data", "generating", "Starting data generation...", 0, {
    startedAt: new Date(),
  });

  return controller;
}

export function getDataJobController(sessionId: string): AbortController | null {
  return controllers.get(sessionId) ?? null;
}

export function initTableList(
  sessionId: string,
  tables: Array<{ tableName: string }>,
): void {
  const job = jobs.get(sessionId);
  if (!job || job.status !== "generating") return;
  job.totalTables = tables.length;
  job.tableStatuses = tables.map((t) => ({
    tableName: t.tableName,
    phase: "pending" as TablePhase,
    rowCount: 0,
    retryCount: 0,
  }));
}

export function updateTablePhase(
  sessionId: string,
  tableName: string,
  phase: TablePhase,
  rowCount?: number,
): void {
  const job = jobs.get(sessionId);
  if (!job || job.status !== "generating") return;
  const entry = job.tableStatuses.find((t) => t.tableName === tableName);
  if (!entry) return;
  entry.phase = phase;
  if (rowCount !== undefined) entry.rowCount = rowCount;
  if (phase === "retrying") entry.retryCount++;
  if (phase === "completed") {
    job.completedTables = job.tableStatuses.filter((t) => t.phase === "completed").length;
    job.percent = Math.round((job.completedTables / job.totalTables) * 100);
  }
}

export function updateDataJob(sessionId: string, message: string, percent: number): void {
  const job = jobs.get(sessionId);
  if (job && job.status === "generating") {
    job.message = message;
    job.percent = Math.min(100, Math.max(0, percent));
  }
}

export async function completeDataJob(sessionId: string): Promise<void> {
  const job = jobs.get(sessionId);
  if (job && job.status === "generating") {
    job.status = "completed";
    job.message = `Complete: ${job.completedTables} tables generated`;
    job.percent = 100;

    await upsertJobStatus(sessionId, "demo-data", "completed", job.message, 100, {
      completedAt: new Date(),
    });
  }
  controllers.delete(sessionId);
}

export async function failDataJob(sessionId: string, error: string): Promise<void> {
  const job = jobs.get(sessionId);
  if (job && job.status === "generating") {
    job.status = "failed";
    job.message = "Data generation failed";
    job.error = error;

    await upsertJobStatus(sessionId, "demo-data", "failed", job.message, job.percent, {
      completedAt: new Date(),
      error,
    });
  }
  controllers.delete(sessionId);
}

export async function cancelDataJob(sessionId: string): Promise<boolean> {
  const job = jobs.get(sessionId);
  if (!job || job.status !== "generating") return false;

  controllers.get(sessionId)?.abort();
  job.status = "cancelled";
  job.message = "Data generation cancelled";

  await upsertJobStatus(sessionId, "demo-data", "cancelled", job.message, job.percent, {
    completedAt: new Date(),
  });

  return true;
}

export async function getDataJobStatus(sessionId: string): Promise<DataJobStatus | null> {
  evictStaleJobs();

  const memJob = jobs.get(sessionId);
  if (memJob) return memJob;

  const persisted = await getPersistedJobStatus(sessionId, "demo-data");
  if (!persisted) return null;

  return {
    sessionId: persisted.runId,
    status: persisted.status as DataJobStatus["status"],
    message: persisted.message,
    percent: persisted.percent,
    totalTables: 0,
    completedTables: 0,
    tableStatuses: [],
    error: persisted.error ?? undefined,
  };
}

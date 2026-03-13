/**
 * In-memory status tracker for Research Engine jobs,
 * with write-through persistence to Lakebase.
 *
 * Same pattern as lib/genie/engine-status.ts.
 */

import { isAuthErrorMessage } from "@/lib/lakebase/auth-errors";
import { upsertJobStatus, getPersistedJobStatus } from "@/lib/lakebase/background-jobs";
import type { ResearchPhase } from "./types";

export interface ResearchJobStatus {
  sessionId: string;
  status: "researching" | "completed" | "failed" | "cancelled";
  phase: ResearchPhase;
  message: string;
  percent: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  errorType: "auth" | "general" | null;
}

const jobs = new Map<string, ResearchJobStatus>();
const controllers = new Map<string, AbortController>();
const JOB_TTL_MS = 30 * 60 * 1000;

function evictStaleJobs(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.completedAt && now - job.completedAt > JOB_TTL_MS) {
      jobs.delete(id);
    } else if (!job.completedAt && now - job.startedAt > JOB_TTL_MS * 2) {
      jobs.delete(id);
      controllers.delete(id);
    }
  }
}

export async function startResearchJob(sessionId: string): Promise<AbortController> {
  controllers.get(sessionId)?.abort();

  const controller = new AbortController();
  controllers.set(sessionId, controller);

  const now = Date.now();
  jobs.set(sessionId, {
    sessionId,
    status: "researching",
    phase: "source-collection",
    message: "Starting research...",
    percent: 0,
    startedAt: now,
    completedAt: null,
    error: null,
    errorType: null,
  });

  await upsertJobStatus(sessionId, "demo-research", "generating", "Starting research...", 0, {
    startedAt: new Date(now),
  });

  return controller;
}

export function getResearchJobController(sessionId: string): AbortController | null {
  return controllers.get(sessionId) ?? null;
}

export function updateResearchJob(
  sessionId: string,
  phase: ResearchPhase,
  percent: number,
  detail?: string,
): void {
  const job = jobs.get(sessionId);
  if (job && job.status === "researching") {
    job.phase = phase;
    job.percent = Math.min(100, Math.max(0, percent));
    if (detail) job.message = detail;
  }
}

export async function completeResearchJob(sessionId: string): Promise<void> {
  const job = jobs.get(sessionId);
  if (job && job.status === "researching") {
    job.status = "completed";
    job.phase = "complete";
    job.message = "Research complete";
    job.percent = 100;
    job.completedAt = Date.now();

    await upsertJobStatus(sessionId, "demo-research", "completed", job.message, 100, {
      completedAt: new Date(job.completedAt),
    });
  }
  controllers.delete(sessionId);
}

export async function failResearchJob(sessionId: string, error: string): Promise<void> {
  const job = jobs.get(sessionId);
  if (job && job.status === "researching") {
    job.status = "failed";
    job.message = "Research failed";
    job.completedAt = Date.now();
    job.error = error;
    job.errorType = isAuthErrorMessage(error) ? "auth" : "general";

    await upsertJobStatus(sessionId, "demo-research", "failed", job.message, job.percent, {
      completedAt: new Date(job.completedAt),
      error,
    });
  }
  controllers.delete(sessionId);
}

export async function cancelResearchJob(sessionId: string): Promise<boolean> {
  const job = jobs.get(sessionId);
  if (!job || job.status !== "researching") return false;

  controllers.get(sessionId)?.abort();
  job.status = "cancelled";
  job.message = "Research cancelled";
  job.completedAt = Date.now();

  await upsertJobStatus(sessionId, "demo-research", "cancelled", job.message, job.percent, {
    completedAt: new Date(job.completedAt),
  });

  return true;
}

export async function getResearchJobStatus(
  sessionId: string,
): Promise<ResearchJobStatus | null> {
  evictStaleJobs();

  const memJob = jobs.get(sessionId);
  if (memJob) return memJob;

  const persisted = await getPersistedJobStatus(sessionId, "demo-research");
  if (!persisted) return null;

  return {
    sessionId: persisted.runId,
    status: persisted.status as ResearchJobStatus["status"],
    phase: "complete",
    message: persisted.message,
    percent: persisted.percent,
    startedAt: persisted.startedAt.getTime(),
    completedAt: persisted.completedAt?.getTime() ?? null,
    error: persisted.error,
    errorType: persisted.error ? (isAuthErrorMessage(persisted.error) ? "auth" : "general") : null,
  };
}

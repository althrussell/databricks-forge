/**
 * In-memory status tracker for async Genie Engine generation jobs.
 *
 * Used by the generate route to track progress and by the status
 * route to report it to the client. Also stores an AbortController
 * per job to support user-initiated cancellation.
 */

import { isAuthErrorMessage } from "@/lib/lakebase/auth-errors";

export type EngineErrorType = "auth" | "general" | null;

export interface EngineJobStatus {
  runId: string;
  status: "generating" | "completed" | "failed" | "cancelled";
  message: string;
  percent: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  errorType: EngineErrorType;
  domainCount: number;
  completedDomains: number;
  totalDomains: number;
  completedDomainNames: string[];
}

const jobs = new Map<string, EngineJobStatus>();
const controllers = new Map<string, AbortController>();
const JOB_TTL_MS = 30 * 60 * 1000; // 30 minutes

function evictStaleJobs(): void {
  const now = Date.now();
  for (const [runId, job] of jobs) {
    if (job.completedAt && now - job.completedAt > JOB_TTL_MS) {
      jobs.delete(runId);
    } else if (!job.completedAt && now - job.startedAt > JOB_TTL_MS * 2) {
      jobs.delete(runId);
      controllers.delete(runId);
    }
  }
}

export function startJob(runId: string): void {
  controllers.get(runId)?.abort();

  const controller = new AbortController();
  controllers.set(runId, controller);

  jobs.set(runId, {
    runId,
    status: "generating",
    message: "Starting Genie Engine...",
    percent: 0,
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    errorType: null,
    domainCount: 0,
    completedDomains: 0,
    totalDomains: 0,
    completedDomainNames: [],
  });
}

export function getJobController(runId: string): AbortController | null {
  return controllers.get(runId) ?? null;
}

/**
 * Cancel a running job. Returns true if the job was actively generating
 * and has been cancelled, false otherwise (already finished or no job).
 */
export function cancelJob(runId: string): boolean {
  const job = jobs.get(runId);
  if (!job || job.status !== "generating") return false;

  controllers.get(runId)?.abort();

  job.status = "cancelled";
  job.message = "Generation cancelled by user";
  job.completedAt = Date.now();
  return true;
}

export function updateJob(runId: string, message: string, percent: number): void {
  const job = jobs.get(runId);
  if (job && job.status === "generating") {
    job.message = message;
    job.percent = Math.min(100, Math.max(0, percent));
  }
}

export function updateJobDomainProgress(
  runId: string,
  completedDomains: number,
  totalDomains: number
): void {
  const job = jobs.get(runId);
  if (job && job.status === "generating") {
    job.completedDomains = completedDomains;
    job.totalDomains = totalDomains;
  }
}

export function addCompletedDomainName(runId: string, domainName: string): void {
  const job = jobs.get(runId);
  if (job && job.status === "generating" && !job.completedDomainNames.includes(domainName)) {
    job.completedDomainNames.push(domainName);
  }
}

export function completeJob(runId: string, domainCount: number): void {
  const job = jobs.get(runId);
  if (job && job.status === "generating") {
    job.status = "completed";
    job.message = `Complete: ${domainCount} domain${domainCount !== 1 ? "s" : ""} generated`;
    job.percent = 100;
    job.completedAt = Date.now();
    job.domainCount = domainCount;
  }
  controllers.delete(runId);
}

export function failJob(runId: string, error: string): void {
  const job = jobs.get(runId);
  if (job && job.status === "generating") {
    job.status = "failed";
    job.message = "Generation failed";
    job.completedAt = Date.now();
    job.error = error;
    job.errorType = isAuthErrorMessage(error) ? "auth" : "general";
  }
  controllers.delete(runId);
}

export function getJobStatus(runId: string): EngineJobStatus | null {
  evictStaleJobs();
  return jobs.get(runId) ?? null;
}

/**
 * In-memory status tracker for async Genie Engine generation jobs.
 *
 * Used by the generate route to track progress and by the status
 * route to report it to the client.
 */

export interface EngineJobStatus {
  runId: string;
  status: "generating" | "completed" | "failed";
  message: string;
  percent: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  domainCount: number;
}

const jobs = new Map<string, EngineJobStatus>();

export function startJob(runId: string): void {
  jobs.set(runId, {
    runId,
    status: "generating",
    message: "Starting Genie Engine...",
    percent: 0,
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    domainCount: 0,
  });
}

export function updateJob(runId: string, message: string, percent: number): void {
  const job = jobs.get(runId);
  if (job) {
    job.message = message;
    job.percent = Math.min(100, Math.max(0, percent));
  }
}

export function completeJob(runId: string, domainCount: number): void {
  const job = jobs.get(runId);
  if (job) {
    job.status = "completed";
    job.message = `Complete: ${domainCount} domain${domainCount !== 1 ? "s" : ""} generated`;
    job.percent = 100;
    job.completedAt = Date.now();
    job.domainCount = domainCount;
  }
}

export function failJob(runId: string, error: string): void {
  const job = jobs.get(runId);
  if (job) {
    job.status = "failed";
    job.message = "Generation failed";
    job.completedAt = Date.now();
    job.error = error;
  }
}

export function getJobStatus(runId: string): EngineJobStatus | null {
  return jobs.get(runId) ?? null;
}

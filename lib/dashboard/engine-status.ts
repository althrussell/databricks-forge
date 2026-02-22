/**
 * In-memory status tracker for async Dashboard Engine generation jobs.
 *
 * Used by the generate route to track progress and by the status
 * route to report it to the client. Mirrors lib/genie/engine-status.ts.
 */

export interface DashboardJobStatus {
  runId: string;
  status: "generating" | "completed" | "failed";
  message: string;
  percent: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  domainCount: number;
}

const jobs = new Map<string, DashboardJobStatus>();

export function startDashboardJob(runId: string): void {
  jobs.set(runId, {
    runId,
    status: "generating",
    message: "Starting Dashboard Engine...",
    percent: 0,
    startedAt: Date.now(),
    completedAt: null,
    error: null,
    domainCount: 0,
  });
}

export function updateDashboardJob(runId: string, message: string, percent: number): void {
  const job = jobs.get(runId);
  if (job) {
    job.message = message;
    job.percent = Math.min(100, Math.max(0, percent));
  }
}

export function completeDashboardJob(runId: string, domainCount: number): void {
  const job = jobs.get(runId);
  if (job) {
    job.status = "completed";
    job.message = `Complete: ${domainCount} dashboard${domainCount !== 1 ? "s" : ""} generated`;
    job.percent = 100;
    job.completedAt = Date.now();
    job.domainCount = domainCount;
  }
}

export function failDashboardJob(runId: string, error: string): void {
  const job = jobs.get(runId);
  if (job) {
    job.status = "failed";
    job.message = "Dashboard generation failed";
    job.completedAt = Date.now();
    job.error = error;
  }
}

export function getDashboardJobStatus(runId: string): DashboardJobStatus | null {
  return jobs.get(runId) ?? null;
}

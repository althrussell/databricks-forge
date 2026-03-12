/**
 * API: /api/genie-spaces/generate
 *
 * POST   -- Start Genie Space generation from a table list.
 *           mode=fast (default): synchronous, returns result immediately.
 *           mode=full: async, returns jobId; the client polls GET for progress.
 * GET    -- Poll full-mode generation status by jobId.
 *           Without jobId: returns all active generate jobs (for dashboard tiles).
 * DELETE -- Cancel a running generate job by jobId.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  runAdHocGenieEngine,
  runFastGenieEngine,
  type AdHocGenieConfig,
} from "@/lib/genie/adhoc-engine";
import { logger } from "@/lib/logger";
import { safeErrorMessage } from "@/lib/error-utils";

interface AdHocJobStatus {
  jobId: string;
  status: "generating" | "completed" | "failed" | "cancelled";
  message: string;
  percent: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  result: {
    recommendation: import("@/lib/genie/types").GenieSpaceRecommendation;
    mode: "fast" | "full";
  } | null;
  title?: string;
  domain?: string;
  tableCount?: number;
  abortController?: AbortController;
}

const jobs = new Map<string, AdHocJobStatus>();
const JOB_TTL_MS = 30 * 60 * 1000;

function evictStale(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.completedAt && now - job.completedAt > JOB_TTL_MS) {
      jobs.delete(id);
    } else if (!job.completedAt && now - job.startedAt > JOB_TTL_MS * 2) {
      jobs.delete(id);
    }
  }
}

function validateTables(tables: unknown): string[] | null {
  if (!Array.isArray(tables) || tables.length === 0) return null;
  const invalid = (tables as string[]).filter(
    (t) => typeof t !== "string" || t.split(".").length < 3,
  );
  if (invalid.length > 0) return null;
  return tables as string[];
}

function jobToResponse(job: AdHocJobStatus) {
  return {
    jobId: job.jobId,
    status: job.status,
    message: job.message,
    percent: job.percent,
    error: job.error,
    result: job.result,
    title: job.title,
    domain: job.domain,
    tableCount: job.tableCount,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tables: rawTables, config } = body as {
      tables: unknown;
      config?: AdHocGenieConfig;
    };

    const tables = validateTables(rawTables);
    if (!tables) {
      return NextResponse.json(
        { error: "At least one valid table FQN (catalog.schema.table) is required" },
        { status: 400 },
      );
    }

    const mode = config?.mode ?? "fast";

    // -----------------------------------------------------------------------
    // Fast mode: synchronous — no polling needed
    // -----------------------------------------------------------------------
    if (mode === "fast") {
      try {
        const result = await runFastGenieEngine({ tables, config });
        const quality = result.recommendation.quality;
        return NextResponse.json({
          status: "completed",
          mode: "fast",
          quality,
          gateDecision: quality?.gateDecision ?? "allow",
          result: { recommendation: result.recommendation, mode: "fast" },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Fast Genie generation failed", { error: msg });
        return NextResponse.json({ error: msg }, { status: 500 });
      }
    }

    // -----------------------------------------------------------------------
    // Full mode: async with polling
    // -----------------------------------------------------------------------
    const jobId = uuidv4();
    const now = Date.now();
    const abortController = new AbortController();

    jobs.set(jobId, {
      jobId,
      status: "generating",
      message: "Starting full Genie Engine...",
      percent: 0,
      startedAt: now,
      completedAt: null,
      error: null,
      result: null,
      title: config?.title ?? undefined,
      domain: config?.domain ?? undefined,
      tableCount: tables.length,
      abortController,
    });

    runAdHocGenieEngine({
      tables,
      config,
      onProgress: (message, percent) => {
        const job = jobs.get(jobId);
        if (job && job.status === "generating") {
          job.message = message;
          job.percent = Math.min(99, percent);
        }
      },
      signal: abortController.signal,
    })
      .then((result) => {
        const job = jobs.get(jobId);
        if (job && job.status === "generating") {
          job.status = "completed";
          const gateDecision = result.recommendation.quality?.gateDecision ?? "allow";
          const qualityWarnings = result.recommendation.quality?.degradedReasons.length ?? 0;
          job.message =
            gateDecision === "block"
              ? "Generation complete: deployment blocked by quality gate"
              : qualityWarnings > 0
                ? `Generation complete with ${qualityWarnings} warning${qualityWarnings === 1 ? "" : "s"}`
                : "Generation complete";
          job.percent = 100;
          job.completedAt = Date.now();
          job.result = { recommendation: result.recommendation, mode: "full" };
        }
      })
      .catch((err) => {
        const job = jobs.get(jobId);
        if (job && job.status === "generating") {
          const msg = err instanceof Error ? err.message : String(err);
          if (abortController.signal.aborted) {
            job.status = "cancelled";
            job.message = "Generation cancelled";
          } else {
            logger.error("Full Genie generation failed", { jobId, error: msg });
            job.status = "failed";
            job.message = "Generation failed";
            job.error = msg;
          }
          job.completedAt = Date.now();
        }
      });

    return NextResponse.json({ jobId, mode: "full" });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  evictStale();

  const jobId = request.nextUrl.searchParams.get("jobId");

  // If no jobId, return all active jobs (for dashboard polling)
  if (!jobId) {
    const activeJobs = [...jobs.values()]
      .filter((j) => j.status === "generating" || (j.status === "completed" && !j.result))
      .map(jobToResponse);
    // Also include recently completed jobs (within 60s) so the dashboard can transition
    const recentlyCompleted = [...jobs.values()]
      .filter(
        (j) =>
          (j.status === "completed" || j.status === "failed" || j.status === "cancelled") &&
          j.completedAt &&
          Date.now() - j.completedAt < 60_000,
      )
      .map(jobToResponse);
    return NextResponse.json({ jobs: [...activeJobs, ...recentlyCompleted] });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });
  }

  return NextResponse.json(jobToResponse(job));
}

export async function DELETE(request: NextRequest) {
  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId query parameter required" }, { status: 400 });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });
  }

  if (job.status !== "generating") {
    return NextResponse.json({ error: "Job is not running" }, { status: 409 });
  }

  job.abortController?.abort();
  job.status = "cancelled";
  job.message = "Generation cancelled";
  job.completedAt = Date.now();

  logger.info("Generate job cancelled", { jobId });
  return NextResponse.json({ success: true });
}

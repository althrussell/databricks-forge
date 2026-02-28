/**
 * API: /api/genie-spaces/generate
 *
 * POST -- Start ad-hoc Genie Space generation from a table list.
 *         Returns a jobId; the client polls GET for progress.
 * GET  -- Poll generation status by jobId.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { runAdHocGenieEngine, type AdHocGenieConfig } from "@/lib/genie/adhoc-engine";
import { logger } from "@/lib/logger";

interface AdHocJobStatus {
  jobId: string;
  status: "generating" | "completed" | "failed";
  message: string;
  percent: number;
  startedAt: number;
  completedAt: number | null;
  error: string | null;
  result: {
    recommendation: import("@/lib/genie/types").GenieSpaceRecommendation;
  } | null;
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tables, config } = body as {
      tables: string[];
      config?: AdHocGenieConfig;
    };

    if (!Array.isArray(tables) || tables.length === 0) {
      return NextResponse.json(
        { error: "At least one table FQN is required" },
        { status: 400 }
      );
    }

    const invalid = tables.filter(
      (t) => typeof t !== "string" || t.split(".").length < 3
    );
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid table FQNs (must be catalog.schema.table): ${invalid.join(", ")}` },
        { status: 400 }
      );
    }

    const jobId = uuidv4();
    const now = Date.now();
    jobs.set(jobId, {
      jobId,
      status: "generating",
      message: "Starting ad-hoc Genie Engine...",
      percent: 0,
      startedAt: now,
      completedAt: null,
      error: null,
      result: null,
    });

    // Fire and forget -- client polls GET for status
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
    })
      .then((result) => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = "completed";
          job.message = "Generation complete";
          job.percent = 100;
          job.completedAt = Date.now();
          job.result = { recommendation: result.recommendation };
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Ad-hoc Genie generation failed", { jobId, error: msg });
        const job = jobs.get(jobId);
        if (job) {
          job.status = "failed";
          job.message = "Generation failed";
          job.completedAt = Date.now();
          job.error = msg;
        }
      });

    return NextResponse.json({ jobId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  evictStale();

  const jobId = request.nextUrl.searchParams.get("jobId");
  if (!jobId) {
    return NextResponse.json({ error: "jobId query parameter required" }, { status: 400 });
  }

  const job = jobs.get(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found or expired" }, { status: 404 });
  }

  return NextResponse.json({
    jobId: job.jobId,
    status: job.status,
    message: job.message,
    percent: job.percent,
    error: job.error,
    result: job.result,
  });
}

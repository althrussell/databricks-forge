/**
 * API: /api/genie-spaces/generate
 *
 * POST -- Start Genie Space generation from a table list.
 *         mode=fast (default): synchronous, returns result immediately.
 *         mode=full: async, returns jobId; the client polls GET for progress.
 * GET  -- Poll full-mode generation status by jobId.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  runAdHocGenieEngine,
  runFastGenieEngine,
  type AdHocGenieConfig,
} from "@/lib/genie/adhoc-engine";
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
    mode: "fast" | "full";
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

function validateTables(tables: unknown): string[] | null {
  if (!Array.isArray(tables) || tables.length === 0) return null;
  const invalid = (tables as string[]).filter(
    (t) => typeof t !== "string" || t.split(".").length < 3
  );
  if (invalid.length > 0) return null;
  return tables as string[];
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
        { status: 400 }
      );
    }

    const mode = config?.mode ?? "fast";

    // -----------------------------------------------------------------------
    // Fast mode: synchronous — no polling needed
    // -----------------------------------------------------------------------
    if (mode === "fast") {
      try {
        const result = await runFastGenieEngine({ tables, config });
        return NextResponse.json({
          status: "completed",
          mode: "fast",
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
    jobs.set(jobId, {
      jobId,
      status: "generating",
      message: "Starting full Genie Engine...",
      percent: 0,
      startedAt: now,
      completedAt: null,
      error: null,
      result: null,
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
    })
      .then((result) => {
        const job = jobs.get(jobId);
        if (job) {
          job.status = "completed";
          job.message = "Generation complete";
          job.percent = 100;
          job.completedAt = Date.now();
          job.result = { recommendation: result.recommendation, mode: "full" };
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Full Genie generation failed", { jobId, error: msg });
        const job = jobs.get(jobId);
        if (job) {
          job.status = "failed";
          job.message = "Generation failed";
          job.completedAt = Date.now();
          job.error = msg;
        }
      });

    return NextResponse.json({ jobId, mode: "full" });
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

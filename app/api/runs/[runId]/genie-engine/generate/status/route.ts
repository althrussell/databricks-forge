/**
 * API: /api/runs/[runId]/genie-engine/generate/status
 *
 * GET -- Poll the status of an async Genie Engine generation job.
 */

import { NextRequest, NextResponse } from "next/server";
import { getJobStatus } from "@/lib/genie/engine-status";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const job = getJobStatus(runId);

    if (!job) {
      return NextResponse.json({
        runId,
        status: "idle",
        message: "No active generation job",
        percent: 0,
      });
    }

    return NextResponse.json({
      runId,
      status: job.status,
      message: job.message,
      percent: job.percent,
      domainCount: job.domainCount,
      completedDomains: job.completedDomains,
      totalDomains: job.totalDomains,
      error: job.error,
      errorType: job.errorType,
      elapsedMs: job.completedAt
        ? job.completedAt - job.startedAt
        : Date.now() - job.startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

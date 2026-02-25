/**
 * API: /api/runs/[runId]/dashboard-engine/generate/status
 *
 * GET -- Poll the status of an async Dashboard Engine generation job.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDashboardJobStatus } from "@/lib/dashboard/engine-status";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }
    const job = await getDashboardJobStatus(runId);

    if (!job) {
      return NextResponse.json({
        runId,
        status: "idle",
        message: "No active dashboard generation job",
        percent: 0,
      });
    }

    return NextResponse.json({
      runId,
      status: job.status,
      message: job.message,
      percent: job.percent,
      domainCount: job.domainCount,
      error: job.error,
      elapsedMs: job.completedAt
        ? job.completedAt - job.startedAt
        : Date.now() - job.startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

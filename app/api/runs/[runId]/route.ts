/**
 * API: /api/runs/[runId]
 *
 * GET -- get run details including status, progress, and use cases
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const run = await getRunById(runId);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Only fetch use cases if the run is completed
    let useCases = undefined;
    if (run.status === "completed") {
      useCases = await getUseCasesByRunId(runId);
    }

    return NextResponse.json({ run, useCases });
  } catch (error) {
    console.error("[GET /api/runs/[runId]]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get run" },
      { status: 500 }
    );
  }
}

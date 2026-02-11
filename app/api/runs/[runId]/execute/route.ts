/**
 * API: /api/runs/[runId]/execute
 *
 * POST -- start pipeline execution asynchronously
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { startPipeline } from "@/lib/pipeline/engine";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const run = await getRunById(runId);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "running") {
      return NextResponse.json(
        { error: "Pipeline is already running" },
        { status: 409 }
      );
    }

    // Start pipeline asynchronously -- do not await
    startPipeline(runId).catch((err) => {
      console.error(`[execute] Pipeline ${runId} crashed:`, err);
    });

    return NextResponse.json({ status: "running", runId });
  } catch (error) {
    console.error("[POST /api/runs/[runId]/execute]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start pipeline",
      },
      { status: 500 }
    );
  }
}

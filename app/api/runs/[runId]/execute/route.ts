/**
 * API: /api/runs/[runId]/execute
 *
 * POST -- start pipeline execution asynchronously
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getRunById } from "@/lib/lakebase/runs";
import { startPipeline } from "@/lib/pipeline/engine";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isValidUUID } from "@/lib/validation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;

    if (!isValidUUID(runId)) {
      logger.warn("[execute] Invalid run ID format", { runId });
      return NextResponse.json({ error: "Invalid run ID format" }, { status: 400 });
    }

    const run = await getRunById(runId);

    if (!run) {
      logger.warn("[execute] Run not found", { runId });
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "running") {
      logger.warn("[execute] Pipeline is already running", { runId });
      return NextResponse.json(
        { error: "Pipeline is already running" },
        { status: 409 }
      );
    }

    // Start pipeline asynchronously -- do not await
    startPipeline(runId).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("[execute] Pipeline crashed", { runId, error: msg });
    });

    return NextResponse.json({ status: "running", runId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[execute] Failed to start pipeline", { error: msg });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to start pipeline",
      },
      { status: 500 }
    );
  }
}

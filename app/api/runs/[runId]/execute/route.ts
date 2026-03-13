/**
 * API: /api/runs/[runId]/execute
 *
 * POST -- start pipeline execution asynchronously
 */

import { NextRequest, NextResponse } from "next/server";
import { apiLogger } from "@/lib/logger";
import { safeErrorMessage } from "@/lib/error-utils";
import { failOrphanedRunningRun, getRunById } from "@/lib/lakebase/runs";
import { startPipeline, resumePipeline, getActivePipelineRunIds } from "@/lib/pipeline/engine";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isValidUUID } from "@/lib/validation";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { runId } = await params;
  const log = apiLogger("/api/runs/[runId]/execute", "POST", { runId });
  try {
    await ensureMigrated();

    if (!isValidUUID(runId)) {
      log.warn("Invalid run ID format", { errorCategory: "validation_failed" });
      return NextResponse.json({ error: "Invalid run ID format" }, { status: 400 });
    }

    await failOrphanedRunningRun(runId, getActivePipelineRunIds());

    const run = await getRunById(runId);

    if (!run) {
      log.warn("Run not found", { errorCategory: "not_found" });
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "running") {
      log.warn("Pipeline is already running", { errorCategory: "conflict" });
      return NextResponse.json({ error: "Pipeline is already running" }, { status: 409 });
    }

    const { searchParams } = new URL(_request.url);
    const isResume = searchParams.get("resume") === "true";

    if (isResume && run.status === "failed") {
      resumePipeline(runId).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        log.error("Resume pipeline crashed", { error: msg, errorCategory: "pipeline_crashed" });
      });
      return NextResponse.json({ status: "running", runId, resumed: true });
    }

    // Start pipeline asynchronously -- do not await
    startPipeline(runId).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("Pipeline crashed", { error: msg, errorCategory: "pipeline_crashed" });
    });

    return NextResponse.json({ status: "running", runId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    log.error("Failed to start pipeline", { error: msg, errorCategory: "internal_error" });
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

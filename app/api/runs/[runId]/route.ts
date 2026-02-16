/**
 * API: /api/runs/[runId]
 *
 * GET    -- get run details including status, progress, and use cases
 * DELETE -- delete a run and all associated data
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById, deleteRun } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;

    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID format" }, { status: 400 });
    }

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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;

    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID format" }, { status: 400 });
    }

    const run = await getRunById(runId);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "running") {
      return NextResponse.json(
        { error: "Cannot delete a running pipeline. Wait for it to complete or fail." },
        { status: 409 }
      );
    }

    await deleteRun(runId);

    return NextResponse.json({ deleted: true, runId });
  } catch (error) {
    console.error("[DELETE /api/runs/[runId]]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete run" },
      { status: 500 }
    );
  }
}

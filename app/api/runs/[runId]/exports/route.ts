/**
 * API: /api/runs/[runId]/exports
 *
 * GET -- get export history for a run.
 */

import { NextRequest, NextResponse } from "next/server";
import { getExportsByRunId } from "@/lib/lakebase/exports";
import { getRunById } from "@/lib/lakebase/runs";
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
      return NextResponse.json(
        { error: "Invalid run ID format" },
        { status: 400 }
      );
    }

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const exports = await getExportsByRunId(runId);

    return NextResponse.json({ exports });
  } catch (error) {
    console.error("[GET /api/runs/[runId]/exports]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch exports",
      },
      { status: 500 }
    );
  }
}

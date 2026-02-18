/**
 * API: /api/runs/[runId]/exports
 *
 * GET -- get export history for a run.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getExportsByRunId } from "@/lib/lakebase/exports";
import { getRunById } from "@/lib/lakebase/runs";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  let runId: string | undefined;
  try {
    await ensureMigrated();
    const resolved = await params;
    runId = resolved.runId;

    if (!isValidUUID(runId)) {
      logger.warn("Invalid run ID format for exports", {
        runId,
        route: "/api/runs/[runId]/exports",
      });
      return NextResponse.json(
        { error: "Invalid run ID format" },
        { status: 400 }
      );
    }

    const run = await getRunById(runId);
    if (!run) {
      logger.warn("Run not found for exports", {
        runId,
        route: "/api/runs/[runId]/exports",
      });
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const exports = await getExportsByRunId(runId);

    return NextResponse.json({ exports });
  } catch (error) {
    logger.error("Failed to fetch exports", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/runs/[runId]/exports",
      runId,
    });
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

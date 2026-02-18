/**
 * API: /api/runs/[runId]/prompt-logs
 *
 * GET -- get all prompt log entries for a run, with optional stats summary.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  getPromptLogsByRunId,
  getPromptLogStats,
} from "@/lib/lakebase/prompt-logs";
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
      logger.warn("Invalid run ID format for prompt-logs", {
        runId,
        route: "/api/runs/[runId]/prompt-logs",
      });
      return NextResponse.json(
        { error: "Invalid run ID format" },
        { status: 400 }
      );
    }

    const run = await getRunById(runId);
    if (!run) {
      logger.warn("Run not found for prompt-logs", {
        runId,
        route: "/api/runs/[runId]/prompt-logs",
      });
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const [logs, stats] = await Promise.all([
      getPromptLogsByRunId(runId),
      getPromptLogStats(runId),
    ]);

    return NextResponse.json({ logs, stats });
  } catch (error) {
    logger.error("Failed to fetch prompt logs", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/runs/[runId]/prompt-logs",
      runId,
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch prompt logs",
      },
      { status: 500 }
    );
  }
}

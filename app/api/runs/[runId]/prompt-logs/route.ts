/**
 * API: /api/runs/[runId]/prompt-logs
 *
 * GET -- get all prompt log entries for a run, with optional stats summary.
 */

import { NextRequest, NextResponse } from "next/server";
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

    const [logs, stats] = await Promise.all([
      getPromptLogsByRunId(runId),
      getPromptLogStats(runId),
    ]);

    return NextResponse.json({ logs, stats });
  } catch (error) {
    console.error("[GET /api/runs/[runId]/prompt-logs]", error);
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

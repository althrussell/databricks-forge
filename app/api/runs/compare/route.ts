/**
 * API: /api/runs/compare
 *
 * GET -- compare two runs side by side, including prompt diffs,
 * metric comparison, token usage, and use case alignment.
 * Query params: ?runA=<uuid>&runB=<uuid>
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { compareRuns } from "@/lib/lakebase/run-comparison";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isValidUUID } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    await ensureMigrated();
    const { searchParams } = new URL(request.url);
    const runAId = searchParams.get("runA");
    const runBId = searchParams.get("runB");

    if (!runAId || !runBId || !isValidUUID(runAId) || !isValidUUID(runBId)) {
      logger.warn("Invalid or missing run IDs for compare", {
        runAId: runAId ?? null,
        runBId: runBId ?? null,
        route: "/api/runs/compare",
      });
      return NextResponse.json(
        { error: "Both runA and runB query params (valid UUIDs) are required" },
        { status: 400 }
      );
    }

    const result = await compareRuns(runAId, runBId);

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Failed to compare runs", {
      error: error instanceof Error ? error.message : String(error),
      route: "/api/runs/compare",
    });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to compare runs",
      },
      { status: 500 }
    );
  }
}

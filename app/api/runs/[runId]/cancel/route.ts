/**
 * API: /api/runs/[runId]/cancel
 *
 * POST -- Cancel a running pipeline.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { safeErrorMessage } from "@/lib/error-utils";
import { cancelPipeline } from "@/lib/pipeline/engine";
import { logger } from "@/lib/logger";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }
    const cancelled = await cancelPipeline(runId);

    if (!cancelled) {
      return NextResponse.json({ error: "No active pipeline to cancel" }, { status: 404 });
    }

    logger.info("Pipeline cancelled by user", { runId });

    return NextResponse.json({ runId, status: "cancelled" });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

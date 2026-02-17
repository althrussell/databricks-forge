/**
 * API: /api/environment-scan/[scanId]/progress
 *
 * GET -- returns the current scan progress (phase, counters, message).
 *        Returns 404 if the scan is not tracked (already completed and expired).
 */

import { NextResponse } from "next/server";
import { getScanProgress } from "@/lib/pipeline/scan-progress";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> }
) {
  const { scanId } = await params;

  if (!isValidUUID(scanId)) {
    return NextResponse.json({ error: "Invalid scan ID" }, { status: 400 });
  }

  const progress = getScanProgress(scanId);
  if (!progress) {
    return NextResponse.json(
      { error: "No progress data found for this scan" },
      { status: 404 }
    );
  }

  return NextResponse.json(progress);
}

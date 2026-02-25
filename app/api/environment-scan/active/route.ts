/**
 * API: /api/environment-scan/active
 *
 * GET -- returns all environment scans that are currently in progress.
 *        The frontend calls this on mount to resume polling for any scan
 *        that was started before the user navigated away.
 */

import { NextResponse } from "next/server";
import { getActiveScans } from "@/lib/pipeline/scan-progress";

export async function GET() {
  const scans = getActiveScans();
  return NextResponse.json({ scans });
}

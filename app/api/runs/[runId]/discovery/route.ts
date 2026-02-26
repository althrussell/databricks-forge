/**
 * API: /api/runs/[runId]/discovery
 *
 * GET -- fetch discovered analytics assets for a run
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { getDiscoveryResultsByRunId } from "@/lib/lakebase/discovered-assets";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }

    const data = await getDiscoveryResultsByRunId(runId);
    if (!data) {
      return NextResponse.json({
        genieSpaces: [],
        dashboards: [],
        coverage: null,
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

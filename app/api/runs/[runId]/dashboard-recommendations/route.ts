/**
 * API: /api/runs/[runId]/dashboard-recommendations
 *
 * GET -- Return Dashboard recommendations for a completed pipeline run.
 *        Reads from Lakebase (persisted during background engine step).
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getDashboardRecommendationsByRunId } from "@/lib/lakebase/dashboard-recommendations";
import { listTrackedDashboards } from "@/lib/lakebase/dashboards";
import { getConfig } from "@/lib/dbx/client";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Run is not completed. Dashboard recommendations require a completed pipeline run." },
        { status: 400 }
      );
    }

    const recommendations = await getDashboardRecommendationsByRunId(runId);
    const tracked = await listTrackedDashboards(runId);

    let databricksHost: string | null = null;
    try {
      databricksHost = getConfig().host;
    } catch { /* host unavailable in some dev environments */ }

    return NextResponse.json({
      runId,
      businessName: run.config.businessName,
      recommendations,
      tracked,
      databricksHost,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * API: /api/runs/[runId]/dashboard-engine/[domain]/preview
 *
 * GET -- Return the Lakeview JSON preview for a domain's dashboard recommendation.
 */

import { NextRequest, NextResponse } from "next/server";
import { getDashboardRecommendationsByRunId } from "@/lib/lakebase/dashboard-recommendations";
import { isValidUUID } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string; domain: string }> }
) {
  try {
    const { runId, domain } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }
    const decodedDomain = decodeURIComponent(domain);

    const recs = await getDashboardRecommendationsByRunId(runId);
    const rec = recs.find(
      (r) => r.domain.toLowerCase() === decodedDomain.toLowerCase()
    );

    if (!rec) {
      return NextResponse.json(
        { error: `No dashboard recommendation found for domain "${decodedDomain}"` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      domain: rec.domain,
      title: rec.title,
      description: rec.description,
      dashboardDesign: rec.dashboardDesign,
      serializedDashboard: rec.serializedDashboard,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

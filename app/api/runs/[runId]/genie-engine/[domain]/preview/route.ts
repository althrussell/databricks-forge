/**
 * API: /api/runs/[runId]/genie-engine/[domain]/preview
 *
 * GET -- Rich preview for a specific domain's Genie space, including
 *        the serialized space, column enrichments, metric view proposals,
 *        and benchmarks.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getGenieRecommendationsByRunId } from "@/lib/lakebase/genie-recommendations";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string; domain: string }> }
) {
  try {
    const { runId, domain } = await params;
    const decodedDomain = decodeURIComponent(domain);

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const recs = await getGenieRecommendationsByRunId(runId);
    const rec = recs.find(
      (r) => r.domain.toLowerCase() === decodedDomain.toLowerCase()
    );

    if (!rec) {
      return NextResponse.json(
        { error: `No recommendation found for domain "${decodedDomain}"` },
        { status: 404 }
      );
    }

    let serializedSpace = null;
    try {
      serializedSpace = JSON.parse(rec.serializedSpace);
    } catch { /* invalid JSON */ }

    return NextResponse.json({
      runId,
      domain: rec.domain,
      title: rec.title,
      description: rec.description,
      tableCount: rec.tableCount,
      metricViewCount: rec.metricViewCount,
      useCaseCount: rec.useCaseCount,
      measureCount: rec.measureCount,
      filterCount: rec.filterCount,
      dimensionCount: rec.dimensionCount,
      tables: rec.tables,
      metricViews: rec.metricViews,
      serializedSpace,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

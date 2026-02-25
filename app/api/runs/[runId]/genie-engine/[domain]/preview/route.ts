/**
 * API: /api/runs/[runId]/genie-recommendations
 *
 * GET -- Return Genie Space recommendations for a completed pipeline run.
 *        Reads from Lakebase (persisted during pipeline step 8).
 *        Falls back to on-demand generation for runs that pre-date the
 *        pipeline step (backward compatibility).
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { isValidUUID } from "@/lib/validation";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import { listTrackedGenieSpaces } from "@/lib/lakebase/genie-spaces";
import { getGenieRecommendationsByRunId } from "@/lib/lakebase/genie-recommendations";
import { generateGenieRecommendations } from "@/lib/genie/recommend";
import { getConfig } from "@/lib/dbx/client";
import type { GenieSpaceRecommendation } from "@/lib/genie/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }

    // Load the run
    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Run is not completed. Genie recommendations require a completed pipeline run." },
        { status: 400 }
      );
    }

    // Try to load persisted recommendations (generated in pipeline step 8)
    let recommendations: GenieSpaceRecommendation[] = await getGenieRecommendationsByRunId(runId);

    // Fallback: on-demand generation for runs that pre-date the pipeline step
    if (recommendations.length === 0) {
      const useCases = await getUseCasesByRunId(runId);
      if (useCases.length === 0) {
        return NextResponse.json(
          { error: "No use cases found for this run." },
          { status: 404 }
        );
      }

      const metadata = await loadMetadataForRun(runId);
      if (!metadata) {
        return NextResponse.json(
          {
            error:
              "Metadata snapshot not found for this run. " +
              "This may be a run from before metadata caching was enabled.",
          },
          { status: 404 }
        );
      }

      recommendations = generateGenieRecommendations(run, useCases, metadata);
    }

    // Load tracking status for this run
    const tracked = await listTrackedGenieSpaces(runId);

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

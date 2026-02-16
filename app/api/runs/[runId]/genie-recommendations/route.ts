/**
 * API: /api/runs/[runId]/genie-recommendations
 *
 * GET -- Generate Genie Space recommendations for a completed pipeline run.
 *        Loads the run's use cases and cached metadata, then runs the
 *        recommendation engine to produce one recommendation per domain.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import { listTrackedGenieSpaces } from "@/lib/lakebase/genie-spaces";
import { generateGenieRecommendations } from "@/lib/genie/recommend";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

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

    // Load use cases
    const useCases = await getUseCasesByRunId(runId);
    if (useCases.length === 0) {
      return NextResponse.json(
        { error: "No use cases found for this run." },
        { status: 404 }
      );
    }

    // Load cached metadata
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

    // Generate recommendations
    const recommendations = generateGenieRecommendations(
      run,
      useCases,
      metadata
    );

    // Load tracking status for this run
    const tracked = await listTrackedGenieSpaces(runId);

    return NextResponse.json({
      runId,
      businessName: run.config.businessName,
      recommendations,
      tracked,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

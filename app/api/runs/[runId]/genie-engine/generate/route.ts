/**
 * API: /api/runs/[runId]/genie-engine/generate
 *
 * POST -- Run/re-run the Genie Engine with the current config.
 *         Runs asynchronously; the client polls /generate/status for progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import { getGenieEngineConfig } from "@/lib/lakebase/genie-engine-config";
import { saveGenieRecommendations } from "@/lib/lakebase/genie-recommendations";
import { runGenieEngine } from "@/lib/genie/engine";
import { startJob, updateJob, completeJob, failJob } from "@/lib/genie/engine-status";
import { logger } from "@/lib/logger";

export async function POST(
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
        { error: "Run must be completed to generate Genie spaces" },
        { status: 400 }
      );
    }

    const useCases = await getUseCasesByRunId(runId);
    if (useCases.length === 0) {
      return NextResponse.json({ error: "No use cases found" }, { status: 404 });
    }

    const metadata = await loadMetadataForRun(runId);
    if (!metadata) {
      return NextResponse.json({ error: "Metadata snapshot not found" }, { status: 404 });
    }

    const { config, version } = await getGenieEngineConfig(runId);

    startJob(runId);

    runGenieEngine({
      run,
      useCases,
      metadata,
      config,
      sampleData: null,
      onProgress: (message, percent) => updateJob(runId, message, percent),
    })
      .then(async (result) => {
        await saveGenieRecommendations(
          runId,
          result.recommendations,
          result.passOutputs,
          version
        );
        completeJob(runId, result.recommendations.length);
        logger.info("Genie Engine generation complete (async)", {
          runId,
          recommendationCount: result.recommendations.length,
          configVersion: version,
        });
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        failJob(runId, errMsg);
        logger.error("Genie Engine generation failed (async)", {
          runId,
          error: errMsg,
        });
      });

    return NextResponse.json({
      runId,
      status: "generating",
      configVersion: version,
      message: "Genie Engine generation started. Poll /generate/status for progress.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

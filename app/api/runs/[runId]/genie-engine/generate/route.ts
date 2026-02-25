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
import { invalidatePrismaClient } from "@/lib/prisma";
import { runGenieEngine, EngineCancelledError } from "@/lib/genie/engine";
import { startJob, getJobController, updateJob, updateJobDomainProgress, addCompletedDomainName, completeJob, failJob, getJobStatus } from "@/lib/genie/engine-status";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

    // Parse optional domain filter from request body
    let domains: string[] | undefined;
    try {
      const body = await request.json();
      if (Array.isArray(body?.domains) && body.domains.length > 0) {
        domains = body.domains.filter((d: unknown) => typeof d === "string" && d.length > 0);
        if (domains!.length === 0) domains = undefined;
      }
    } catch {
      // No body or invalid JSON -- regenerate all domains
    }

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
    const controller = getJobController(runId);

    runGenieEngine({
      run,
      useCases,
      metadata,
      config,
      sampleData: null,
      domainFilter: domains,
      signal: controller?.signal,
      onProgress: (message, percent, completedDomains, totalDomains, completedDomainName) => {
        updateJob(runId, message, percent);
        updateJobDomainProgress(runId, completedDomains, totalDomains);
        if (completedDomainName) {
          addCompletedDomainName(runId, completedDomainName);
        }
      },
    })
      .then(async (result) => {
        const job = getJobStatus(runId);
        if (job?.status === "cancelled") {
          logger.info("Genie Engine generation cancelled, skipping save", { runId });
          return;
        }
        await invalidatePrismaClient();
        await saveGenieRecommendations(
          runId,
          result.recommendations,
          result.passOutputs,
          version,
          domains,
        );
        completeJob(runId, result.recommendations.length);
        if (result.failedDomains.length > 0) {
          logger.warn("Genie Engine completed with domain failures", {
            runId,
            failedDomains: result.failedDomains,
          });
        }
        logger.info("Genie Engine generation complete (async)", {
          runId,
          recommendationCount: result.recommendations.length,
          failedDomainCount: result.failedDomains.length,
          configVersion: version,
          domainFilter: domains ?? "all",
        });
      })
      .catch((err) => {
        if (err instanceof EngineCancelledError) {
          logger.info("Genie Engine generation cancelled (async)", { runId });
          return;
        }
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
      domains: domains ?? null,
      message: domains
        ? `Regenerating ${domains.length} domain${domains.length !== 1 ? "s" : ""}. Poll /generate/status for progress.`
        : "Genie Engine generation started. Poll /generate/status for progress.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

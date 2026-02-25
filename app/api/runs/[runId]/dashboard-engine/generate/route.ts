/**
 * API: /api/runs/[runId]/dashboard-engine/generate
 *
 * POST -- Run/re-run the Dashboard Engine.
 *         Runs asynchronously; the client polls /generate/status for progress.
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import { getGenieRecommendationsByRunId } from "@/lib/lakebase/genie-recommendations";
import { saveDashboardRecommendations } from "@/lib/lakebase/dashboard-recommendations";
import { runDashboardEngine } from "@/lib/dashboard/engine";
import {
  startDashboardJob,
  updateDashboardJob,
  completeDashboardJob,
  failDashboardJob,
  getDashboardJobStatus,
} from "@/lib/dashboard/engine-status";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;

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
        { error: "Run must be completed to generate dashboards" },
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

    const existingJob = await getDashboardJobStatus(runId);
    if (existingJob?.status === "generating") {
      return NextResponse.json(
        { error: "Dashboard generation already in progress", status: "generating" },
        { status: 409 }
      );
    }

    let genieRecommendations;
    try {
      genieRecommendations = await getGenieRecommendationsByRunId(runId);
    } catch {
      // Genie recommendations not available
    }

    startDashboardJob(runId);

    runDashboardEngine({
      run,
      useCases,
      metadata,
      genieRecommendations,
      domainFilter: domains,
      onProgress: (message, percent) => updateDashboardJob(runId, message, percent),
    })
      .then(async (result) => {
        await saveDashboardRecommendations(runId, result.recommendations, domains);
        completeDashboardJob(runId, result.recommendations.length);
        logger.info("Dashboard Engine generation complete (async)", {
          runId,
          recommendationCount: result.recommendations.length,
          domainFilter: domains ?? "all",
        });
      })
      .catch((err) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        failDashboardJob(runId, errMsg);
        logger.error("Dashboard Engine generation failed (async)", {
          runId,
          error: errMsg,
        });
      });

    return NextResponse.json({
      runId,
      status: "generating",
      domains: domains ?? null,
      message: domains
        ? `Regenerating ${domains.length} dashboard${domains.length !== 1 ? "s" : ""}. Poll /generate/status for progress.`
        : "Dashboard Engine generation started. Poll /generate/status for progress.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * API: /api/runs/[runId]
 *
 * GET    -- get run details including status, progress, and use cases
 * PATCH  -- update run metadata (e.g. retrospective industry assignment)
 * DELETE -- delete a run and all associated data
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById, deleteRun, updateRunIndustry } from "@/lib/lakebase/runs";
import { getUseCasesByRunId, getUseCaseSummariesByRunId } from "@/lib/lakebase/usecases";
import { loadLineageFqnsForRun } from "@/lib/lakebase/metadata-cache";
import { getLatestScanIdForRun } from "@/lib/lakebase/environment-scans";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isValidUUID } from "@/lib/validation";
import { getCurrentUserEmail } from "@/lib/dbx/client";
import { logActivity } from "@/lib/lakebase/activity-log";
import { getAllIndustryOutcomes } from "@/lib/domain/industry-outcomes-server";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;
    const summary = new URL(request.url).searchParams.get("fields") === "summary";

    if (!isValidUUID(runId)) {
      logger.warn("[api/runs] GET invalid run ID", { runId });
      return NextResponse.json({ error: "Invalid run ID format" }, { status: 400 });
    }

    const run = await getRunById(runId);

    if (!run) {
      logger.warn("[api/runs] GET run not found", { runId });
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    // Only fetch use cases if the run is completed
    let useCases = undefined;
    let lineageDiscoveredFqns: string[] = [];
    let scanId: string | null = null;
    if (run.status === "completed") {
      const ucFetcher = summary
        ? getUseCaseSummariesByRunId(runId)
        : getUseCasesByRunId(runId);
      const [ucResult, fqnsResult, scanIdResult] = await Promise.allSettled([
        ucFetcher,
        loadLineageFqnsForRun(runId),
        getLatestScanIdForRun(runId, run.config.ucMetadata),
      ]);
      useCases = ucResult.status === "fulfilled" ? ucResult.value : undefined;
      lineageDiscoveredFqns =
        fqnsResult.status === "fulfilled" ? fqnsResult.value : [];
      scanId = scanIdResult.status === "fulfilled" ? scanIdResult.value : null;
    }

    const cacheMaxAge = run.status === "completed" ? 300 : 0;
    return NextResponse.json(
      { run, useCases, lineageDiscoveredFqns, scanId },
      {
        headers: {
          "Cache-Control": cacheMaxAge > 0
            ? `public, s-maxage=${cacheMaxAge}, stale-while-revalidate=60`
            : "no-store",
        },
      }
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/runs] GET failed", { runId: "unknown", error: msg });
    return NextResponse.json(
      { error: msg || "Failed to get run" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;

    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID format" }, { status: 400 });
    }

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "running") {
      return NextResponse.json(
        { error: "Cannot modify a running pipeline." },
        { status: 409 }
      );
    }

    const body = await request.json();
    const { industry } = body as { industry?: string | null };

    if (industry === undefined) {
      return NextResponse.json(
        { error: "No updatable field provided. Supported: industry" },
        { status: 400 }
      );
    }

    if (industry !== null && industry !== "") {
      const allOutcomes = await getAllIndustryOutcomes();
      const valid = allOutcomes.some((o) => o.id === industry);
      if (!valid) {
        return NextResponse.json(
          { error: `Unknown industry outcome map: ${industry}` },
          { status: 400 }
        );
      }
      await updateRunIndustry(runId, industry, false);
      logger.info("[api/runs] PATCH industry assigned retrospectively", {
        runId,
        industry,
      });
    } else {
      await updateRunIndustry(runId, "", false);
      logger.info("[api/runs] PATCH industry cleared", { runId });
    }

    const userEmail = await getCurrentUserEmail();
    logActivity("updated_run_industry", {
      userId: userEmail,
      resourceId: runId,
      metadata: { industry: industry ?? "(cleared)" },
    });

    const updated = await getRunById(runId);
    return NextResponse.json({ run: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/runs] PATCH failed", { error: msg });
    return NextResponse.json(
      { error: msg || "Failed to update run" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;

    if (!isValidUUID(runId)) {
      logger.warn("[api/runs] DELETE invalid run ID", { runId });
      return NextResponse.json({ error: "Invalid run ID format" }, { status: 400 });
    }

    const run = await getRunById(runId);

    if (!run) {
      logger.warn("[api/runs] DELETE run not found", { runId });
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status === "running") {
      logger.warn("[api/runs] DELETE blocked -- run still in progress", { runId });
      return NextResponse.json(
        { error: "Cannot delete a running pipeline. Wait for it to complete or fail." },
        { status: 409 }
      );
    }

    await deleteRun(runId);

    const userEmail = await getCurrentUserEmail();
    logActivity("deleted_run", {
      userId: userEmail,
      resourceId: runId,
      metadata: { businessName: run.config.businessName },
    });

    logger.info("[api/runs] Run deleted", { runId });
    return NextResponse.json({ deleted: true, runId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/runs] DELETE failed", { error: msg });
    return NextResponse.json(
      { error: msg || "Failed to delete run" },
      { status: 500 }
    );
  }
}

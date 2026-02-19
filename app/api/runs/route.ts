/**
 * API: /api/runs
 *
 * POST -- create a new pipeline run
 * GET  -- list all runs
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/lib/logger";
import { createRun, listRuns } from "@/lib/lakebase/runs";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { safeParseBody, CreateRunSchema } from "@/lib/validation";
import { getCurrentUserEmail } from "@/lib/dbx/client";
import { logActivity } from "@/lib/lakebase/activity-log";
import type {
  PipelineRunConfig,
  Operation,
  BusinessPriority,
  GenerationOption,
  SupportedLanguage,
  DiscoveryDepth,
} from "@/lib/domain/types";

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();

    const parsed = await safeParseBody(request, CreateRunSchema);
    if (!parsed.success) {
      logger.warn("[api/runs] POST validation failed", { error: parsed.error });
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const body = parsed.data;
    const runId = uuidv4();
    const config: PipelineRunConfig = {
      businessName: body.businessName,
      ucMetadata: body.ucMetadata,
      operation: (body.operation ?? "Discover Usecases") as Operation,
      businessDomains: body.businessDomains ?? "",
      businessPriorities: (body.businessPriorities ?? ["Increase Revenue"]) as BusinessPriority[],
      strategicGoals: body.strategicGoals ?? "",
      generationOptions: (body.generationOptions ?? ["SQL Code"]) as GenerationOption[],
      generationPath: body.generationPath ?? "./forge_gen/",
      languages: (body.languages ?? ["English"]) as SupportedLanguage[],
      aiModel: body.aiModel,
      sampleRowsPerTable: body.sampleRowsPerTable ?? 0,
      industry: body.industry ?? "",
      discoveryDepth: (body.discoveryDepth ?? "balanced") as DiscoveryDepth,
    };

    const userEmail = await getCurrentUserEmail();
    await createRun(runId, config, userEmail);

    // Fire-and-forget activity log
    logActivity("created_run", {
      userId: userEmail,
      resourceId: runId,
      metadata: { businessName: config.businessName },
    });

    return NextResponse.json({ runId }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/runs] POST failed", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
    const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10) || 0, 0);

    await ensureMigrated();
    const runs = await listRuns(limit, offset);

    return NextResponse.json({ runs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/runs] GET failed", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

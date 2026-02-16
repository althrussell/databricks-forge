/**
 * API: /api/runs
 *
 * POST -- create a new pipeline run
 * GET  -- list all runs
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createRun, listRuns } from "@/lib/lakebase/runs";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { safeParseBody, CreateRunSchema } from "@/lib/validation";
import type {
  PipelineRunConfig,
  Operation,
  BusinessPriority,
  GenerationOption,
  SupportedLanguage,
} from "@/lib/domain/types";

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();

    const parsed = await safeParseBody(request, CreateRunSchema);
    if (!parsed.success) {
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
      generationPath: body.generationPath ?? "./inspire_gen/",
      languages: (body.languages ?? ["English"]) as SupportedLanguage[],
      aiModel: body.aiModel ?? "databricks-claude-opus-4-6",
      sampleRowsPerTable: body.sampleRowsPerTable ?? 0,
    };

    await createRun(runId, config);

    return NextResponse.json({ runId }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/runs]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create run" },
      { status: 500 }
    );
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
    console.error("[GET /api/runs]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list runs" },
      { status: 500 }
    );
  }
}

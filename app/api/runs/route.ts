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
import type { PipelineRunConfig } from "@/lib/domain/types";

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();
    const body = await request.json();

    // Validate required fields
    if (!body.businessName || !body.ucMetadata) {
      return NextResponse.json(
        { error: "businessName and ucMetadata are required" },
        { status: 400 }
      );
    }

    const runId = uuidv4();
    const config: PipelineRunConfig = {
      businessName: body.businessName,
      ucMetadata: body.ucMetadata,
      operation: body.operation ?? "Discover Usecases",
      businessDomains: body.businessDomains ?? "",
      businessPriorities: body.businessPriorities ?? ["Increase Revenue"],
      strategicGoals: body.strategicGoals ?? "",
      generationOptions: body.generationOptions ?? ["SQL Code"],
      generationPath: body.generationPath ?? "./inspire_gen/",
      languages: body.languages ?? ["English"],
      aiModel: body.aiModel ?? "databricks-claude-sonnet-4-5",
      sampleRowsPerTable: Math.min(Math.max(parseInt(body.sampleRowsPerTable ?? "0", 10) || 0, 0), 50),
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
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

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

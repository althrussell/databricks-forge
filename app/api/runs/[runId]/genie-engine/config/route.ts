/**
 * API: /api/runs/[runId]/genie-engine/config
 *
 * GET  -- Load the Genie Engine config for a run (defaults if none saved)
 * PUT  -- Save/update the Genie Engine config for a run
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { getRunById } from "@/lib/lakebase/runs";
import {
  getGenieEngineConfig,
  saveGenieEngineConfig,
} from "@/lib/lakebase/genie-engine-config";
import type { GenieEngineConfig } from "@/lib/genie/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const { config, version } = await getGenieEngineConfig(runId);

    return NextResponse.json({ runId, config, version });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const body = await request.json();
    const config = body.config as GenieEngineConfig;

    if (!config) {
      return NextResponse.json({ error: "Missing config in request body" }, { status: 400 });
    }

    const version = await saveGenieEngineConfig(runId, config);

    return NextResponse.json({ runId, version });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

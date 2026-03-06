/**
 * API: /api/runs/[runId]/genie-engine/config
 *
 * GET  -- Load the Genie Engine config for a run (defaults if none saved)
 * PUT  -- Save/update the Genie Engine config for a run
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
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
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

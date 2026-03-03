/**
 * API: /api/genie-spaces
 *
 * GET  -- List Genie spaces from the workspace + local tracking data
 * POST -- Create a new Genie space via Databricks API and track it
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import { listGenieSpaces, createGenieSpace } from "@/lib/dbx/genie";
import {
  listTrackedGenieSpaces,
  trackGenieSpaceCreated,
} from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";
import type { GenieAuthMode } from "@/lib/settings";
import { revalidateSerializedSpace } from "@/lib/genie/deploy-validation";

export async function GET() {
  try {
    // Fetch workspace Genie spaces from Databricks API
    const [apiResult, tracked] = await Promise.all([
      listGenieSpaces().catch(() => ({ spaces: [], next_page_token: undefined })),
      listTrackedGenieSpaces().catch(() => []),
    ]);

    return NextResponse.json({
      spaces: apiResult.spaces,
      tracked,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      serializedSpace,
      runId,
      domain,
      parentPath,
      authMode,
      quality,
    } = body as {
      title: string;
      description: string;
      serializedSpace: string;
      runId?: string;
      domain: string;
      parentPath?: string;
      authMode?: GenieAuthMode;
      quality?: {
        gateDecision?: "allow" | "warn" | "block";
        promptVersion?: string;
      };
    };

    if (!title || !serializedSpace || !domain) {
      return NextResponse.json(
        { error: "Missing required fields: title, serializedSpace, domain" },
        { status: 400 }
      );
    }

    const validation = await revalidateSerializedSpace(serializedSpace);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error, code: validation.code, diagnostics: validation.diagnostics ?? null },
        { status: 409 }
      );
    }
    if (quality?.gateDecision === "block") {
      return NextResponse.json(
        { error: "Quality gate blocked deployment. Resolve preview diagnostics and regenerate." },
        { status: 400 }
      );
    }

    const config = getConfig();

    // Create Genie space via Databricks API
    const result = await createGenieSpace({
      title,
      description: description || "",
      serializedSpace,
      warehouseId: config.warehouseId,
      parentPath,
      authMode,
    });

    // Track in Lakebase
    const trackingId = uuidv4();
    await trackGenieSpaceCreated(
      trackingId,
      result.space_id,
      runId ?? null,
      domain,
      title,
      {
        functions: [],
        metricViews: [],
        metadata: {
          promptVersion: quality?.promptVersion ?? "genie-v2",
          gateDecision: quality?.gateDecision ?? "allow",
        },
      },
      authMode,
    );

    logger.info("Genie space created successfully", {
      spaceId: result.space_id,
      runId,
      domain,
      title,
    });

    return NextResponse.json({
      spaceId: result.space_id,
      title: result.title,
      trackingId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Genie space creation failed", {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

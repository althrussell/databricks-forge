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
    } = body as {
      title: string;
      description: string;
      serializedSpace: string;
      runId: string;
      domain: string;
      parentPath?: string;
    };

    if (!title || !serializedSpace || !runId || !domain) {
      return NextResponse.json(
        { error: "Missing required fields: title, serializedSpace, runId, domain" },
        { status: 400 }
      );
    }

    // Validate that the space has at least one table (Genie API requirement)
    try {
      const parsed = JSON.parse(serializedSpace);
      const tables = parsed?.data_sources?.tables;
      if (!Array.isArray(tables) || tables.length === 0) {
        return NextResponse.json(
          { error: "Cannot create a Genie Space with no tables. At least one table is required." },
          { status: 400 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: "Invalid serializedSpace JSON" },
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
    });

    // Track in Lakebase
    const trackingId = uuidv4();
    await trackGenieSpaceCreated(
      trackingId,
      result.space_id,
      runId,
      domain,
      title
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

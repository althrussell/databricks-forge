/**
 * API: /api/runs/[runId]/genie-engine/[domain]/deploy
 *
 * POST -- Deploy a single domain's Genie space to Databricks.
 *         Creates (or updates) the space via the Genie REST API and
 *         tracks the deployment in Lakebase.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import { createGenieSpace, updateGenieSpace } from "@/lib/dbx/genie";
import { getRunById } from "@/lib/lakebase/runs";
import { getGenieRecommendationsByRunId } from "@/lib/lakebase/genie-recommendations";
import {
  listTrackedGenieSpaces,
  trackGenieSpaceCreated,
  trackGenieSpaceUpdated,
} from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; domain: string }> }
) {
  try {
    const { runId, domain } = await params;
    const decodedDomain = decodeURIComponent(domain);

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const recs = await getGenieRecommendationsByRunId(runId);
    const rec = recs.find(
      (r) => r.domain.toLowerCase() === decodedDomain.toLowerCase()
    );

    if (!rec) {
      return NextResponse.json(
        { error: `No recommendation found for domain "${decodedDomain}"` },
        { status: 404 }
      );
    }

    const config = getConfig();

    // Check if there's already a tracked space for this run+domain
    const tracked = await listTrackedGenieSpaces(runId);
    const existing = tracked.find(
      (t) => t.domain.toLowerCase() === decodedDomain.toLowerCase() && t.status !== "trashed"
    );

    let spaceId: string;
    let action: "created" | "updated";

    if (existing) {
      // Update existing space
      const result = await updateGenieSpace(existing.spaceId, {
        title: rec.title,
        description: rec.description,
        serializedSpace: rec.serializedSpace,
      });
      spaceId = result.space_id;
      action = "updated";

      await trackGenieSpaceUpdated(existing.spaceId, rec.title);
    } else {
      // Create new space
      const body = await request.json().catch(() => ({})) as Record<string, string>;
      const parentPath = body.parentPath ?? "/Shared/Forge Genie Spaces/";

      const result = await createGenieSpace({
        title: rec.title,
        description: rec.description,
        serializedSpace: rec.serializedSpace,
        warehouseId: config.warehouseId,
        parentPath,
      });
      spaceId = result.space_id;
      action = "created";

      await trackGenieSpaceCreated(
        uuidv4(),
        spaceId,
        runId,
        rec.domain,
        rec.title
      );
    }

    logger.info(`Genie space ${action}`, {
      runId,
      domain: decodedDomain,
      spaceId,
    });

    return NextResponse.json({
      success: true,
      spaceId,
      action,
      domain: rec.domain,
      databricksHost: config.host,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Genie space deploy failed", {
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

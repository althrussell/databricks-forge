/**
 * API: POST /api/metadata-genie/deploy
 *
 * Deploys the Genie Space to Databricks, pointing at the deployed views.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/dbx/client";
import {
  createGenieSpace,
  updateGenieSpace,
} from "@/lib/dbx/genie";
import {
  getMetadataGenieSpace,
  updateMetadataGenieSpaceDeployed,
} from "@/lib/lakebase/metadata-genie";
import { logger } from "@/lib/logger";
import type { GenieAuthMode } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const { id, authMode } = (await request.json()) as {
      id: string;
      authMode?: GenieAuthMode;
    };

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const space = await getMetadataGenieSpace(id);
    if (!space) {
      return NextResponse.json(
        { error: "Metadata Genie space not found" },
        { status: 404 }
      );
    }

    if (!space.viewsDeployed) {
      return NextResponse.json(
        { error: "Views must be deployed before creating the Genie Space" },
        { status: 400 }
      );
    }

    const config = getConfig();
    const description = space.industryName
      ? `Explore your ${space.industryName} data estate metadata. Ask about tables, columns, schemas, and more.`
      : "Explore your data estate metadata using natural language. Ask about tables, columns, schemas, tags, and more.";

    let spaceId: string;
    let spaceUrl: string;

    if (space.spaceId) {
      // Update existing space
      const result = await updateGenieSpace(space.spaceId, {
        title: space.title,
        description,
        serializedSpace: space.serializedSpace,
        warehouseId: config.warehouseId,
        authMode: authMode ?? (space.authMode as GenieAuthMode),
      });
      spaceId = result.space_id;
      spaceUrl = `${config.host}/explore/genie/${spaceId}`;
    } else {
      // Create new space
      const result = await createGenieSpace({
        title: space.title,
        description,
        serializedSpace: space.serializedSpace,
        warehouseId: config.warehouseId,
        authMode: authMode ?? (space.authMode as GenieAuthMode),
      });
      spaceId = result.space_id;
      spaceUrl = `${config.host}/explore/genie/${spaceId}`;
    }

    await updateMetadataGenieSpaceDeployed(id, spaceId, spaceUrl);

    logger.info("Metadata Genie space deployed", {
      id,
      spaceId,
      spaceUrl,
    });

    return NextResponse.json({
      spaceId,
      spaceUrl,
      status: "deployed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Metadata Genie space deployment failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

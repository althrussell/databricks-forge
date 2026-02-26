/**
 * API: POST /api/metadata-genie/deploy
 *
 * Unified deploy: builds the SerializedSpace with the chosen viewTarget,
 * deploys curated views via DDL, then creates the Genie Space via REST API.
 */

import { NextRequest, NextResponse } from "next/server";
import { getConfig } from "@/lib/dbx/client";
import { executeSQL } from "@/lib/dbx/sql";
import { createGenieSpace, updateGenieSpace } from "@/lib/dbx/genie";
import { buildMetadataGenieSpace } from "@/lib/metadata-genie/space-builder";
import { generateViewDDL, getViewFqns } from "@/lib/metadata-genie/view-ddl";
import {
  getMetadataGenieSpace,
  updateMetadataGenieOnDeploy,
} from "@/lib/lakebase/metadata-genie";
import { logger } from "@/lib/logger";
import type { MetadataGenieDeployConfig } from "@/lib/metadata-genie/types";
import type { GenieAuthMode } from "@/lib/settings";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MetadataGenieDeployConfig & {
      authMode?: GenieAuthMode;
    };
    const { id, viewTarget, authMode } = body;

    if (!id || !viewTarget?.catalog || !viewTarget?.schema) {
      return NextResponse.json(
        { error: "id, viewTarget.catalog, and viewTarget.schema are required" },
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

    if (!space.detection) {
      return NextResponse.json(
        { error: "Space has no detection data -- regenerate first" },
        { status: 400 }
      );
    }

    // 1. Load outcome map (if matched) then build SerializedSpace once
    let outcomeMap = null;
    if (space.industryId) {
      try {
        const { getIndustryOutcomeAsync } = await import(
          "@/lib/domain/industry-outcomes-server"
        );
        outcomeMap = (await getIndustryOutcomeAsync(space.industryId)) ?? null;
      } catch {
        // Fall through with detection-only space
      }
    }

    const serializedSpace = buildMetadataGenieSpace({
      viewTarget,
      outcomeMap,
      llmDetection: space.detection,
      catalogScope: space.catalogScope ?? undefined,
      title: space.title,
    });

    const serializedSpaceJson = JSON.stringify(serializedSpace);

    // 2. Deploy views
    await executeSQL(
      `CREATE SCHEMA IF NOT EXISTS \`${viewTarget.catalog}\`.\`${viewTarget.schema}\``
    );

    const ddlStatements = generateViewDDL({
      target: viewTarget,
      catalogScope: space.catalogScope ?? undefined,
      aiDescriptions: space.aiDescriptions ?? undefined,
    });

    const viewResults: { view: string; success: boolean; error?: string }[] =
      [];
    for (const ddl of ddlStatements) {
      try {
        await executeSQL(ddl);
        const viewName =
          ddl.match(/VIEW\s+[^.]+\.[^.]+\.`([^`]+)`/)?.[1] ?? "unknown";
        viewResults.push({ view: viewName, success: true });
      } catch (err) {
        const viewName =
          ddl.match(/VIEW\s+[^.]+\.[^.]+\.`([^`]+)`/)?.[1] ?? "unknown";
        const errMsg = err instanceof Error ? err.message : String(err);
        viewResults.push({ view: viewName, success: false, error: errMsg });
        logger.warn("Failed to deploy view", {
          view: viewName,
          error: errMsg,
        });
      }
    }

    const viewFqns = getViewFqns(viewTarget);

    // 3. Deploy Genie Space
    const config = getConfig();
    const description = space.industryName
      ? `Explore your ${space.industryName} data estate metadata. Ask about tables, columns, schemas, and more.`
      : "Explore your data estate metadata using natural language. Ask about tables, columns, schemas, tags, and more.";

    let spaceId: string;
    let spaceUrl: string;

    if (space.spaceId) {
      const result = await updateGenieSpace(space.spaceId, {
        title: space.title,
        description,
        serializedSpace: serializedSpaceJson,
        warehouseId: config.warehouseId,
        authMode: authMode ?? (space.authMode as GenieAuthMode),
      });
      spaceId = result.space_id;
      spaceUrl = `${config.host}/genie/rooms/${spaceId}`;
    } else {
      const result = await createGenieSpace({
        title: space.title,
        description,
        serializedSpace: serializedSpaceJson,
        warehouseId: config.warehouseId,
        authMode: authMode ?? (space.authMode as GenieAuthMode),
      });
      spaceId = result.space_id;
      spaceUrl = `${config.host}/genie/rooms/${spaceId}`;
    }

    // 4. Persist everything
    await updateMetadataGenieOnDeploy({
      id,
      viewCatalog: viewTarget.catalog,
      viewSchema: viewTarget.schema,
      viewNames: viewFqns,
      serializedSpace: serializedSpaceJson,
      spaceId,
      spaceUrl,
    });

    logger.info("Metadata Genie deployed", {
      id,
      spaceId,
      spaceUrl,
      viewTarget: `${viewTarget.catalog}.${viewTarget.schema}`,
      viewsDeployed: viewResults.filter((r) => r.success).length,
    });

    return NextResponse.json({
      spaceId,
      spaceUrl,
      viewResults,
      status: "deployed",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Metadata Genie deployment failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

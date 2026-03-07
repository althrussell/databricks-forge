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
import { listTrackedGenieSpaces, trackGenieSpaceCreated } from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";
import { safeErrorMessage } from "@/lib/error-utils";
import type { GenieAuthMode } from "@/lib/settings";
import { revalidateSerializedSpace } from "@/lib/genie/deploy-validation";
import { validateFqn } from "@/lib/validation";
import {
  deployMetricViews,
  patchSpaceWithMetricViews,
  type MetricViewDeployResult,
} from "@/lib/genie/deploy";

export async function GET() {
  try {
    const [apiResult, tracked] = await Promise.all([
      listGenieSpaces().catch(() => ({ spaces: [], next_page_token: undefined })),
      listTrackedGenieSpaces().catch(() => []),
    ]);

    // Filter out tracked spaces that no longer exist in the workspace.
    // Lakebase rows are left intact so the runs page can still offer redeployment.
    const workspaceIds = new Set((apiResult.spaces ?? []).map((s) => s.space_id));
    const liveTracked = tracked.filter(
      (t) => t.status === "trashed" || workspaceIds.has(t.spaceId),
    );
    const staleCount = tracked.length - liveTracked.length;

    if (staleCount > 0) {
      logger.info("[genie-spaces] Filtered stale tracked spaces", {
        staleCount,
        staleIds: tracked
          .filter((t) => t.status !== "trashed" && !workspaceIds.has(t.spaceId))
          .map((t) => t.spaceId),
      });
    }

    return NextResponse.json({
      spaces: apiResult.spaces,
      tracked: liveTracked,
      staleCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

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
      targetSchema,
      metricViews,
      resourcePrefix,
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
      targetSchema?: string;
      metricViews?: Array<{ name: string; ddl: string; description?: string }>;
      resourcePrefix?: string;
    };

    if (!title || !serializedSpace || !domain) {
      return NextResponse.json(
        { error: "Missing required fields: title, serializedSpace, domain" },
        { status: 400 },
      );
    }

    const validation = await revalidateSerializedSpace(serializedSpace);
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: validation.error,
          code: validation.code,
          diagnostics: validation.diagnostics ?? null,
        },
        { status: 409 },
      );
    }
    // Deploy metric views if provided
    let finalSerializedSpace = serializedSpace;
    const deployedMvFqns: string[] = [];
    let mvResults: MetricViewDeployResult[] = [];

    if (metricViews && metricViews.length > 0 && targetSchema) {
      if (targetSchema.split(".").length !== 2) {
        return NextResponse.json(
          { error: "targetSchema must be in catalog.schema format" },
          { status: 400 },
        );
      }
      try {
        validateFqn(targetSchema, "targetSchema");
      } catch {
        return NextResponse.json(
          { error: "targetSchema contains invalid characters" },
          { status: 400 },
        );
      }

      const mvDeploy = await deployMetricViews(metricViews, targetSchema, resourcePrefix);
      mvResults = mvDeploy.results;
      deployedMvFqns.push(...mvDeploy.deployedFqns);
      finalSerializedSpace = patchSpaceWithMetricViews(serializedSpace, deployedMvFqns);
    }

    const config = getConfig();

    const result = await createGenieSpace({
      title,
      description: description || "",
      serializedSpace: finalSerializedSpace,
      warehouseId: config.warehouseId,
      parentPath,
      authMode,
    });

    const trackingId = uuidv4();
    await trackGenieSpaceCreated(
      trackingId,
      result.space_id,
      runId ?? null,
      domain,
      title,
      {
        functions: [],
        metricViews: deployedMvFqns,
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
      metricViewsDeployed: deployedMvFqns.length,
    });

    return NextResponse.json({
      spaceId: result.space_id,
      title: result.title,
      trackingId,
      metricViewResults: mvResults.length > 0 ? mvResults : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Genie space creation failed", {
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

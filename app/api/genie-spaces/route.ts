/**
 * API: /api/genie-spaces
 *
 * GET  -- List Genie spaces from the workspace + local tracking data
 * POST -- Create a new Genie space via Databricks API and track it
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import { executeSQL } from "@/lib/dbx/sql";
import { listGenieSpaces, createGenieSpace } from "@/lib/dbx/genie";
import {
  listTrackedGenieSpaces,
  trackGenieSpaceCreated,
} from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";
import type { GenieAuthMode } from "@/lib/settings";
import { revalidateSerializedSpace } from "@/lib/genie/deploy-validation";
import { validateFqn } from "@/lib/validation";

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

// ---------------------------------------------------------------------------
// Metric view DDL helpers (mirrors logic from genie-deploy route)
// ---------------------------------------------------------------------------

function rewriteDdlTarget(ddl: string, targetSchema: string): string {
  return ddl.replace(
    /(CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+)(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i,
    (_match, prefix: string, fqn: string) => {
      const parts = fqn.replace(/`/g, "").split(".");
      const objectName = parts[parts.length - 1];
      return `${prefix}${targetSchema}.${objectName}`;
    },
  );
}

function sanitizeMetricViewDdl(ddl: string): string {
  return ddl
    .replace(
      /^(\s*(?:expr|on):\s*)(.+)$/gm,
      (_match, prefix: string, rest: string) =>
        prefix +
        rest.replace(
          /\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.([a-zA-Z_]\w*)\b/g,
          "$1",
        ),
    )
    .replace(/^\s*comment:\s*"[^"]*"\s*$/gm, "")
    .replace(/^\s*comment:\s*'[^']*'\s*$/gm, "")
    .replace(/^\s*comment:\s*[^\n]+$/gm, "");
}

function extractObjectName(ddl: string): string | null {
  const match = ddl.match(
    /(?:CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+)(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i,
  );
  if (!match) return null;
  const parts = match[1].replace(/`/g, "").split(".");
  return parts[parts.length - 1];
}

interface MetricViewDeployResult {
  name: string;
  success: boolean;
  fqn?: string;
  error?: string;
}

async function deployMetricViews(
  views: Array<{ name: string; ddl: string; description?: string }>,
  targetSchema: string,
): Promise<{ results: MetricViewDeployResult[]; deployedFqns: string[] }> {
  const results: MetricViewDeployResult[] = [];
  const deployedFqns: string[] = [];

  for (const mv of views) {
    const rewritten = sanitizeMetricViewDdl(rewriteDdlTarget(mv.ddl, targetSchema));
    const objectName = extractObjectName(rewritten) ?? mv.name;
    const fqn = `${targetSchema}.${objectName}`;

    try {
      await executeSQL(rewritten);
      // Best-effort grant
      try {
        await executeSQL(`GRANT SELECT ON TABLE ${fqn} TO \`account users\``);
      } catch {
        /* grant is best-effort */
      }
      results.push({ name: mv.name, success: true, fqn });
      deployedFqns.push(fqn);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toUpperCase().includes("ALREADY_EXISTS") || msg.toUpperCase().includes("ALREADY EXISTS")) {
        results.push({ name: mv.name, success: true, fqn });
        deployedFqns.push(fqn);
      } else {
        logger.warn("Metric view deployment failed (ad-hoc)", { name: mv.name, fqn, error: msg });
        results.push({ name: mv.name, success: false, fqn, error: msg });
      }
    }
  }

  return { results, deployedFqns };
}

function patchSpaceWithMetricViews(
  serializedSpace: string,
  deployedFqns: string[],
): string {
  if (deployedFqns.length === 0) return serializedSpace;
  try {
    const space = JSON.parse(serializedSpace) as Record<string, unknown>;
    const dataSources = (space.data_sources ?? {}) as Record<string, unknown>;
    const existing = (dataSources.metric_views ?? []) as Array<{ identifier: string }>;
    const existingSet = new Set(existing.map((e) => e.identifier.toLowerCase()));
    const newEntries = deployedFqns
      .filter((fqn) => !existingSet.has(fqn.toLowerCase()))
      .map((fqn) => ({ identifier: fqn }));
    dataSources.metric_views = [...existing, ...newEntries];
    space.data_sources = dataSources;
    return JSON.stringify(space);
  } catch {
    return serializedSpace;
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
        { error: validation.error, code: validation.code, diagnostics: validation.diagnostics ?? null },
        { status: 409 },
      );
    }
    if (quality?.gateDecision === "block") {
      return NextResponse.json(
        { error: "Quality gate blocked deployment. Resolve preview diagnostics and regenerate." },
        { status: 400 },
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

      const mvDeploy = await deployMetricViews(metricViews, targetSchema);
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

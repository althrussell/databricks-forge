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
import { fetchColumnsBatch, fetchTableInfoBatch } from "@/lib/queries/metadata";
import { buildSchemaAllowlist, validateSqlExpression } from "@/lib/genie/schema-allowlist";
import type { SerializedSpace } from "@/lib/genie/types";
import type { MetadataSnapshot } from "@/lib/domain/types";

async function revalidateSerializedSpace(serializedSpace: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: SerializedSpace;
  try {
    parsed = JSON.parse(serializedSpace) as SerializedSpace;
  } catch {
    return { ok: false, error: "Invalid serializedSpace JSON" };
  }

  const tableFqns = parsed?.data_sources?.tables?.map((t) => t.identifier) ?? [];
  if (!Array.isArray(tableFqns) || tableFqns.length === 0) {
    return { ok: false, error: "Cannot create a Genie Space with no tables. At least one table is required." };
  }

  const [tables, columns] = await Promise.all([
    fetchTableInfoBatch(tableFqns),
    fetchColumnsBatch(tableFqns),
  ]);

  const metadata: MetadataSnapshot = {
    cacheKey: `deploy-validate-${Date.now()}`,
    ucPath: tableFqns.map((t) => t.split(".").slice(0, 2).join(".")).join(", "),
    tables,
    columns,
    foreignKeys: [],
    metricViews: [],
    schemaMarkdown: "",
    tableCount: tables.length,
    columnCount: columns.length,
    cachedAt: new Date().toISOString(),
    lineageDiscoveredFqns: [],
  };
  const allowlist = buildSchemaAllowlist(metadata);

  for (const join of parsed.instructions.join_specs ?? []) {
    for (const sql of join.sql ?? []) {
      if (!sql || sql.startsWith("--rt=")) continue;
      if (!validateSqlExpression(allowlist, sql, `deploy_join:${join.id}`, true)) {
        return {
          ok: false,
          error: "Schema drift detected: one or more join conditions are no longer valid. Regenerate before deploy.",
        };
      }
    }
  }

  if (tableFqns.length > 1 && (parsed.instructions.join_specs?.length ?? 0) === 0) {
    return {
      ok: false,
      error: "Quality gate: multi-table spaces must include at least one validated join before deploy.",
    };
  }

  for (const ex of parsed.instructions.example_question_sqls ?? []) {
    const sql = ex.sql?.join("\n") ?? "";
    if (sql && !validateSqlExpression(allowlist, sql, `deploy_example_sql:${ex.id}`, true)) {
      return {
        ok: false,
        error: "Schema drift detected: one or more sample SQL queries are no longer valid. Regenerate before deploy.",
      };
    }
  }

  return { ok: true };
}

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
        { error: validation.error },
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

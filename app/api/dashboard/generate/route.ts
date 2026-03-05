/**
 * API: /api/dashboard/generate
 *
 * POST -- Generate (and optionally deploy) a Lakeview dashboard from a table
 *         list and Ask Forge conversation context.
 *
 *         Uses the ad-hoc dashboard engine which reuses the same LLM-powered
 *         pipeline as the run-based dashboard engine.
 */

import { NextRequest, NextResponse } from "next/server";
import { runAdHocDashboardEngine } from "@/lib/dashboard/adhoc-engine";
import { logger } from "@/lib/logger";

function validateTables(tables: unknown): string[] | null {
  if (!Array.isArray(tables) || tables.length === 0) return null;
  const valid = (tables as string[]).filter(
    (t) => typeof t === "string" && t.split(".").length >= 3,
  );
  return valid.length > 0 ? valid : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      tables: rawTables,
      sqlBlocks,
      conversationSummary,
      widgetDescriptions,
      domainHint,
      title,
      deploy,
      publish,
    } = body as {
      tables: unknown;
      sqlBlocks?: string[];
      conversationSummary?: string;
      widgetDescriptions?: string[];
      domainHint?: string;
      title?: string;
      deploy?: boolean;
      publish?: boolean;
    };

    const tables = validateTables(rawTables);
    if (!tables) {
      return NextResponse.json(
        { error: "At least one valid table FQN (catalog.schema.table) is required" },
        { status: 400 },
      );
    }

    const result = await runAdHocDashboardEngine({
      tables,
      sqlBlocks: Array.isArray(sqlBlocks)
        ? sqlBlocks.filter((s): s is string => typeof s === "string" && s.length > 0)
        : undefined,
      conversationSummary: typeof conversationSummary === "string" ? conversationSummary : undefined,
      widgetDescriptions: Array.isArray(widgetDescriptions)
        ? widgetDescriptions.filter((s): s is string => typeof s === "string")
        : undefined,
      domainHint: typeof domainHint === "string" ? domainHint : undefined,
      title: typeof title === "string" ? title : undefined,
      deploy: deploy === true,
      publish: publish === true,
    });

    return NextResponse.json({
      success: true,
      recommendation: {
        title: result.recommendation.title,
        description: result.recommendation.description,
        domain: result.recommendation.domain,
        datasetCount: result.recommendation.datasetCount,
        widgetCount: result.recommendation.widgetCount,
      },
      dashboardId: result.dashboardId ?? null,
      dashboardUrl: result.dashboardUrl ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Ad-hoc dashboard generation failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

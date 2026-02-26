/**
 * API: POST /api/metadata-genie/deploy-views
 *
 * Deploys the 10 curated views over system.information_schema
 * into the user-chosen catalog.schema.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/lib/dbx/sql";
import { generateViewDDL, getViewFqns } from "@/lib/metadata-genie/view-ddl";
import {
  getMetadataGenieSpace,
  updateMetadataGenieViewsDeployed,
} from "@/lib/lakebase/metadata-genie";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const { id } = (await request.json()) as { id: string };

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

    if (!space.viewCatalog || !space.viewSchema) {
      return NextResponse.json(
        { error: "View target not configured" },
        { status: 400 }
      );
    }

    const target = {
      catalog: space.viewCatalog,
      schema: space.viewSchema,
    };

    // Create schema if it doesn't exist
    await executeSQL(
      `CREATE SCHEMA IF NOT EXISTS \`${target.catalog}\`.\`${target.schema}\``
    );

    // Generate and execute DDL
    const ddlStatements = generateViewDDL({
      target,
      catalogScope: space.catalogScope ?? undefined,
    });

    const results: { view: string; success: boolean; error?: string }[] = [];
    for (const ddl of ddlStatements) {
      try {
        await executeSQL(ddl);
        const viewName = ddl.match(/VIEW\s+[^.]+\.[^.]+\.`([^`]+)`/)?.[1] ?? "unknown";
        results.push({ view: viewName, success: true });
      } catch (err) {
        const viewName = ddl.match(/VIEW\s+[^.]+\.[^.]+\.`([^`]+)`/)?.[1] ?? "unknown";
        const errMsg = err instanceof Error ? err.message : String(err);
        results.push({ view: viewName, success: false, error: errMsg });
        logger.warn("Failed to deploy view", { view: viewName, error: errMsg });
      }
    }

    const viewFqns = getViewFqns(target);
    await updateMetadataGenieViewsDeployed(id, viewFqns);

    const failCount = results.filter((r) => !r.success).length;

    logger.info("Metadata Genie views deployed", {
      id,
      target: `${target.catalog}.${target.schema}`,
      successCount: results.length - failCount,
      failCount,
    });

    return NextResponse.json({
      success: failCount === 0,
      results,
      viewFqns,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Metadata Genie view deployment failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

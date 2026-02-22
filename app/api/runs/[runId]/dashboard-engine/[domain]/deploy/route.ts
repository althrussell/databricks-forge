/**
 * API: /api/runs/[runId]/dashboard-engine/[domain]/deploy
 *
 * POST -- Deploy a single domain's dashboard to Databricks.
 *         Creates (or updates) the dashboard via the Lakeview REST API
 *         and tracks the deployment in Lakebase.
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import {
  createDashboard,
  updateDashboard,
  publishDashboard,
  DEFAULT_DASHBOARD_PARENT_PATH,
} from "@/lib/dbx/dashboards";
import { getRunById } from "@/lib/lakebase/runs";
import { getDashboardRecommendationsByRunId } from "@/lib/lakebase/dashboard-recommendations";
import {
  listTrackedDashboards,
  trackDashboardCreated,
  trackDashboardUpdated,
} from "@/lib/lakebase/dashboards";
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

    const recs = await getDashboardRecommendationsByRunId(runId);
    const rec = recs.find(
      (r) => r.domain.toLowerCase() === decodedDomain.toLowerCase()
    );

    if (!rec) {
      return NextResponse.json(
        { error: `No dashboard recommendation found for domain "${decodedDomain}"` },
        { status: 404 }
      );
    }

    const config = getConfig();

    // Parse optional body params
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const parentPath = (body.parentPath as string) ?? DEFAULT_DASHBOARD_PARENT_PATH;
    const shouldPublish = body.publish === true;

    // Check if there's already a tracked dashboard for this run+domain
    const tracked = await listTrackedDashboards(runId);
    const existing = tracked.find(
      (t) => t.domain.toLowerCase() === decodedDomain.toLowerCase() && t.status !== "trashed"
    );

    let dashboardId: string;
    let action: "created" | "updated";
    let dashboardUrl: string | null = null;

    if (existing) {
      const result = await updateDashboard(existing.dashboardId, {
        displayName: rec.title,
        serializedDashboard: rec.serializedDashboard,
      });
      dashboardId = result.dashboard_id;
      action = "updated";
      dashboardUrl = `${config.host}/sql/dashboardsv3/${dashboardId}`;

      await trackDashboardUpdated(existing.dashboardId, rec.title);
    } else {
      const result = await createDashboard({
        displayName: rec.title,
        serializedDashboard: rec.serializedDashboard,
        warehouseId: config.warehouseId,
        parentPath,
      });
      dashboardId = result.dashboard_id;
      action = "created";
      dashboardUrl = `${config.host}/sql/dashboardsv3/${dashboardId}`;

      await trackDashboardCreated(
        uuidv4(),
        dashboardId,
        runId,
        rec.domain,
        rec.title,
        dashboardUrl
      );
    }

    if (shouldPublish) {
      try {
        await publishDashboard(dashboardId, config.warehouseId);
        logger.info("Dashboard published", { dashboardId });
      } catch (err) {
        logger.warn("Dashboard publish failed (dashboard was still created)", {
          dashboardId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info(`Dashboard ${action}`, {
      runId,
      domain: decodedDomain,
      dashboardId,
    });

    return NextResponse.json({
      success: true,
      dashboardId,
      action,
      domain: rec.domain,
      dashboardUrl,
      databricksHost: config.host,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Dashboard deploy failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

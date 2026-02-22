/**
 * Databricks Lakeview Dashboards REST API client.
 *
 * Follows the same pattern as genie.ts: uses getConfig() for host,
 * getAppHeaders() for auth, fetchWithTimeout with TIMEOUTS.WORKSPACE.
 *
 * API docs: https://docs.databricks.com/api/workspace/lakeview
 */

import { getConfig, getAppHeaders } from "./client";
import { fetchWithTimeout, TIMEOUTS } from "./fetch-with-timeout";
import { mkdirs } from "./workspace";
import { logger } from "@/lib/logger";
import type { LakeviewDashboardResponse } from "@/lib/dashboard/types";

export const DEFAULT_DASHBOARD_PARENT_PATH = "/Shared/Forge Dashboards/";
const FALLBACK_DASHBOARD_PARENT_PATH = "/Shared/";

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getDashboard(
  dashboardId: string
): Promise<LakeviewDashboardResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/lakeview/dashboards/${dashboardId}`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    { method: "GET", headers },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lakeview get dashboard failed (${response.status}): ${text}`);
  }

  return (await response.json()) as LakeviewDashboardResponse;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createDashboard(opts: {
  displayName: string;
  serializedDashboard: string;
  warehouseId: string;
  parentPath?: string;
}): Promise<LakeviewDashboardResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/lakeview/dashboards`;
  const headers = await getAppHeaders();

  let parentPath = opts.parentPath ?? DEFAULT_DASHBOARD_PARENT_PATH;

  try {
    await mkdirs(parentPath);
  } catch {
    // Will be caught by the retry below if the path doesn't exist
  }

  const body = {
    display_name: opts.displayName,
    serialized_dashboard: opts.serializedDashboard,
    warehouse_id: opts.warehouseId,
    parent_path: parentPath,
  };

  let response = await fetchWithTimeout(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    if (text.includes("RESOURCE_DOES_NOT_EXIST") && parentPath !== FALLBACK_DASHBOARD_PARENT_PATH) {
      logger.warn("Dashboard parent path does not exist, retrying with /Shared/", { parentPath });
      parentPath = FALLBACK_DASHBOARD_PARENT_PATH;
      body.parent_path = parentPath;
      response = await fetchWithTimeout(
        url,
        { method: "POST", headers, body: JSON.stringify(body) },
        TIMEOUTS.WORKSPACE
      );
      if (!response.ok) {
        const retryText = await response.text();
        throw new Error(`Lakeview create dashboard failed (${response.status}): ${retryText}`);
      }
    } else {
      throw new Error(`Lakeview create dashboard failed (${response.status}): ${text}`);
    }
  }

  return (await response.json()) as LakeviewDashboardResponse;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateDashboard(
  dashboardId: string,
  opts: {
    displayName?: string;
    serializedDashboard?: string;
    warehouseId?: string;
  }
): Promise<LakeviewDashboardResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/lakeview/dashboards/${dashboardId}`;
  const headers = await getAppHeaders();

  const body: Record<string, string> = {};
  if (opts.displayName !== undefined) body.display_name = opts.displayName;
  if (opts.serializedDashboard !== undefined) body.serialized_dashboard = opts.serializedDashboard;
  if (opts.warehouseId !== undefined) body.warehouse_id = opts.warehouseId;

  const response = await fetchWithTimeout(
    url,
    { method: "PATCH", headers, body: JSON.stringify(body) },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lakeview update dashboard failed (${response.status}): ${text}`);
  }

  return (await response.json()) as LakeviewDashboardResponse;
}

// ---------------------------------------------------------------------------
// Publish
// ---------------------------------------------------------------------------

export async function publishDashboard(
  dashboardId: string,
  warehouseId: string
): Promise<void> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/lakeview/dashboards/${dashboardId}/published`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        warehouse_id: warehouseId,
        embed_credentials: false,
      }),
    },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Lakeview publish dashboard failed (${response.status}): ${text}`);
  }
}

// ---------------------------------------------------------------------------
// Unpublish
// ---------------------------------------------------------------------------

export async function unpublishDashboard(
  dashboardId: string
): Promise<void> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/lakeview/dashboards/${dashboardId}/published`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    { method: "DELETE", headers },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    if (response.status !== 404) {
      throw new Error(`Lakeview unpublish dashboard failed (${response.status}): ${text}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Trash (soft delete)
// ---------------------------------------------------------------------------

export async function trashDashboard(dashboardId: string): Promise<void> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/lakeview/dashboards/${dashboardId}`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    { method: "DELETE", headers },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    if (response.status !== 404) {
      throw new Error(`Lakeview trash dashboard failed (${response.status}): ${text}`);
    }
  }
}

/**
 * Microsoft Fabric / Power BI REST API client.
 *
 * Supports two strategies per connection (one per connection, OR not AND):
 *   - Admin Scanner: full tenant scan via /admin/workspaces/* APIs
 *   - Per-Workspace: standard /v1.0/myorg/groups/* APIs (no admin needed)
 *
 * All functions are stateless and accept a bearer token obtained via
 * acquireToken(). The calling code is responsible for token lifecycle.
 */

import { logger } from "@/lib/logger";

const PBI_API_BASE = "https://api.powerbi.com/v1.0/myorg";
const ENTRA_TOKEN_URL = (tenantId: string) =>
  `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
const PBI_SCOPE = "https://analysis.windows.net/powerbi/api/.default";

// ---------------------------------------------------------------------------
// Token acquisition
// ---------------------------------------------------------------------------

export async function acquireToken(
  tenantId: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: PBI_SCOPE,
  });

  const res = await fetch(ENTRA_TOKEN_URL(tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    logger.error("[fabric] Token acquisition failed", {
      status: res.status,
      body: text.slice(0, 500),
    });
    throw new Error(`Entra ID token acquisition failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Workspace listing
// ---------------------------------------------------------------------------

export interface FabricWorkspaceSummary {
  id: string;
  name: string;
  state?: string;
  type?: string;
}

export async function listWorkspaces(
  token: string,
  accessLevel: "admin" | "workspace",
  workspaceFilter?: string[]
): Promise<FabricWorkspaceSummary[]> {
  if (accessLevel === "admin") {
    return listWorkspacesAdmin(token);
  }
  return listWorkspacesStandard(token, workspaceFilter);
}

async function listWorkspacesAdmin(token: string): Promise<FabricWorkspaceSummary[]> {
  const all: FabricWorkspaceSummary[] = [];
  let url: string | null = `${PBI_API_BASE}/admin/groups?$top=5000`;

  while (url) {
    const res = await pbiGet(url, token);
    const data = res as { value: Array<{ id: string; name: string; state: string; type: string }>; "@odata.nextLink"?: string };
    for (const g of data.value ?? []) {
      all.push({ id: g.id, name: g.name, state: g.state, type: g.type });
    }
    url = data["@odata.nextLink"] ?? null;
  }
  return all;
}

async function listWorkspacesStandard(
  token: string,
  filter?: string[]
): Promise<FabricWorkspaceSummary[]> {
  const res = await pbiGet(`${PBI_API_BASE}/groups`, token);
  const data = res as { value: Array<{ id: string; name: string; state: string; type: string }> };
  let workspaces = (data.value ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    state: g.state,
    type: g.type,
  }));
  if (filter?.length) {
    const filterSet = new Set(filter);
    workspaces = workspaces.filter((w) => filterSet.has(w.id));
  }
  return workspaces;
}

// ---------------------------------------------------------------------------
// Admin Scanner API flow
// ---------------------------------------------------------------------------

export interface ScanOptions {
  datasetSchema?: boolean;
  datasetExpressions?: boolean;
  datasourceDetails?: boolean;
  lineage?: boolean;
  getArtifactUsers?: boolean;
}

const DEFAULT_SCAN_OPTIONS: ScanOptions = {
  datasetSchema: true,
  datasetExpressions: true,
  datasourceDetails: true,
  lineage: true,
  getArtifactUsers: true,
};

export async function startAdminScan(
  token: string,
  workspaceIds: string[],
  options: ScanOptions = DEFAULT_SCAN_OPTIONS
): Promise<{ scanId: string }> {
  const params = new URLSearchParams();
  if (options.datasetSchema) params.set("datasetSchema", "true");
  if (options.datasetExpressions) params.set("datasetExpressions", "true");
  if (options.datasourceDetails) params.set("datasourceDetails", "true");
  if (options.lineage) params.set("lineage", "true");
  if (options.getArtifactUsers) params.set("getArtifactUsers", "true");

  const url = `${PBI_API_BASE}/admin/workspaces/getInfo?${params.toString()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ workspaces: workspaceIds.map((id) => ({ id })) }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostWorkspaceInfo failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { id: string };
  return { scanId: data.id };
}

export type ScanStatus = "NotStarted" | "Running" | "Succeeded" | "Failed";

export async function getScanStatus(
  token: string,
  scanId: string
): Promise<{ status: ScanStatus; error?: string }> {
  const data = (await pbiGet(
    `${PBI_API_BASE}/admin/workspaces/scanStatus/${scanId}`,
    token
  )) as { status: ScanStatus; error?: string };
  return { status: data.status, error: data.error };
}

export async function getScanResult(
  token: string,
  scanId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<Record<string, any>> {
  return pbiGet(
    `${PBI_API_BASE}/admin/workspaces/scanResult/${scanId}`,
    token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as Promise<Record<string, any>>;
}

// ---------------------------------------------------------------------------
// Per-Workspace APIs (standard, no admin)
// ---------------------------------------------------------------------------

export async function getWorkspaceDatasets(
  token: string,
  groupId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const data = (await pbiGet(
    `${PBI_API_BASE}/groups/${groupId}/datasets`,
    token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )) as { value: any[] };
  return data.value ?? [];
}

export async function getWorkspaceReports(
  token: string,
  groupId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const data = (await pbiGet(
    `${PBI_API_BASE}/groups/${groupId}/reports`,
    token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )) as { value: any[] };
  return data.value ?? [];
}

export async function getWorkspaceDashboards(
  token: string,
  groupId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const data = (await pbiGet(
    `${PBI_API_BASE}/groups/${groupId}/dashboards`,
    token
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )) as { value: any[] };
  return data.value ?? [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function pbiGet(url: string, token: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error("[fabric] API request failed", {
      url,
      status: res.status,
      body: text.slice(0, 500),
    });
    throw new Error(`Power BI API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

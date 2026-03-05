/**
 * Fabric scan orchestrator.
 *
 * Coordinates the end-to-end scan flow:
 * 1. Acquire Entra ID token
 * 2. List workspaces
 * 3. Trigger scan (admin) or fetch per-workspace (standard)
 * 4. Poll for completion (admin)
 * 5. Parse results and persist to Lakebase
 *
 * When FABRIC_USE_FIXTURES=true, skips real API calls and uses mock data.
 */

import { logger } from "@/lib/logger";
import { getConnectionSecret } from "@/lib/lakebase/connections";
import {
  createFabricScan,
  updateFabricScan,
  insertScanWorkspaces,
  insertScanDatasets,
  insertScanReports,
  insertScanArtifacts,
} from "@/lib/lakebase/fabric-scans";
import {
  acquireToken,
  listWorkspaces,
  startAdminScan,
  getScanStatus,
  getScanResult,
  getWorkspaceDatasets,
  getWorkspaceReports,
} from "./client";
import { parseAdminScanResult, parseWorkspaceDatasets, parseWorkspaceReports } from "./parser";
import { setScanProgress } from "./scan-progress";
import { useFixtures, MOCK_ADMIN_SCAN_RESULT, MOCK_WORKSPACES } from "./fixtures";
import type { FabricWorkspace, FabricDataset, FabricReport, FabricArtifact } from "./types";
import type { ConnectionConfig } from "@/lib/connections/types";

const BATCH_SIZE = 100;
const POLL_INTERVAL_MS = 15_000;
const MAX_POLL_ATTEMPTS = 120;

export async function runFabricScan(
  connection: ConnectionConfig,
  createdBy?: string | null
): Promise<string> {
  const scanId = await createFabricScan({
    connectionId: connection.id,
    accessLevel: connection.accessLevel,
    createdBy,
  });

  setScanProgress(scanId, { status: "scanning", message: "Starting scan...", percent: 5, phase: "init" });

  runScanAsync(scanId, connection).catch((err) => {
    logger.error("[fabric-scan] Unhandled error in async scan", {
      scanId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return scanId;
}

async function runScanAsync(scanId: string, connection: ConnectionConfig): Promise<void> {
  try {
    if (useFixtures()) {
      await runWithFixtures(scanId);
      return;
    }

    const secret = await getConnectionSecret(connection.id);
    if (!secret) throw new Error("Could not decrypt connection credentials");

    setScanProgress(scanId, { message: "Acquiring token...", percent: 10, phase: "auth" });
    const token = await acquireToken(secret.tenantId, secret.clientId, secret.clientSecret);

    if (connection.accessLevel === "admin") {
      await runAdminScan(scanId, token, connection.workspaceFilter);
    } else {
      await runWorkspaceScan(scanId, token, connection.workspaceFilter);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[fabric-scan] Scan failed", { scanId, error: msg });
    await updateFabricScan(scanId, { status: "failed", errorMessage: msg });
    setScanProgress(scanId, { status: "failed", message: msg, percent: 100, phase: "error" });
  }
}

// ---------------------------------------------------------------------------
// Admin Scanner flow
// ---------------------------------------------------------------------------

async function runAdminScan(
  scanId: string,
  token: string,
  workspaceFilter?: string[]
): Promise<void> {
  setScanProgress(scanId, { message: "Listing workspaces...", percent: 15, phase: "workspaces" });
  let allWorkspaces = await listWorkspaces(token, "admin");

  if (workspaceFilter?.length) {
    const filterSet = new Set(workspaceFilter);
    allWorkspaces = allWorkspaces.filter((ws) => filterSet.has(ws.id));
  }

  await updateFabricScan(scanId, { status: "scanning", workspaceCount: allWorkspaces.length });

  const allResults: {
    workspaces: FabricWorkspace[];
    datasets: FabricDataset[];
    reports: FabricReport[];
    artifacts: FabricArtifact[];
    measureCount: number;
  } = { workspaces: [], datasets: [], reports: [], artifacts: [], measureCount: 0 };

  for (let i = 0; i < allWorkspaces.length; i += BATCH_SIZE) {
    const batch = allWorkspaces.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(allWorkspaces.length / BATCH_SIZE);
    const pct = 20 + Math.floor((i / allWorkspaces.length) * 60);

    setScanProgress(scanId, {
      message: `Scanning batch ${batchNum}/${totalBatches} (${batch.length} workspaces)...`,
      percent: pct,
      phase: "scanning",
    });

    const { scanId: apiScanId } = await startAdminScan(
      token,
      batch.map((ws) => ws.id)
    );

    let status = await getScanStatus(token, apiScanId);
    let attempts = 0;
    while (status.status !== "Succeeded" && status.status !== "Failed" && attempts < MAX_POLL_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      status = await getScanStatus(token, apiScanId);
      attempts++;
    }

    if (status.status === "Failed") {
      throw new Error(`Admin scan batch failed: ${status.error ?? "unknown"}`);
    }

    const result = await getScanResult(token, apiScanId);
    const parsed = parseAdminScanResult(result);
    allResults.workspaces.push(...parsed.workspaces);
    allResults.datasets.push(...parsed.datasets);
    allResults.reports.push(...parsed.reports);
    allResults.artifacts.push(...parsed.artifacts);
    allResults.measureCount += parsed.measureCount;
  }

  await persistResults(scanId, allResults);
}

// ---------------------------------------------------------------------------
// Per-Workspace flow
// ---------------------------------------------------------------------------

async function runWorkspaceScan(
  scanId: string,
  token: string,
  workspaceFilter?: string[]
): Promise<void> {
  setScanProgress(scanId, { message: "Listing workspaces...", percent: 15, phase: "workspaces" });
  const allWorkspaces = await listWorkspaces(token, "workspace", workspaceFilter);

  await updateFabricScan(scanId, { status: "scanning", workspaceCount: allWorkspaces.length });

  const wsEntities: FabricWorkspace[] = allWorkspaces.map((ws) => ({
    id: "",
    workspaceId: ws.id,
    name: ws.name,
    state: ws.state ?? null,
    type: ws.type ?? null,
  }));

  const allDatasets: FabricDataset[] = [];
  const allReports: FabricReport[] = [];
  let measureCount = 0;

  for (let i = 0; i < allWorkspaces.length; i++) {
    const ws = allWorkspaces[i];
    const pct = 20 + Math.floor((i / allWorkspaces.length) * 60);
    setScanProgress(scanId, {
      message: `Scanning workspace ${i + 1}/${allWorkspaces.length}: ${ws.name}`,
      percent: pct,
      phase: "scanning",
    });

    const [rawDatasets, rawReports] = await Promise.all([
      getWorkspaceDatasets(token, ws.id),
      getWorkspaceReports(token, ws.id),
    ]);

    const datasets = parseWorkspaceDatasets(rawDatasets, ws.id);
    const reports = parseWorkspaceReports(rawReports, ws.id);
    allDatasets.push(...datasets);
    allReports.push(...reports);
    measureCount += datasets.reduce((sum, ds) => sum + ds.measures.length, 0);
  }

  await persistResults(scanId, {
    workspaces: wsEntities,
    datasets: allDatasets,
    reports: allReports,
    artifacts: [],
    measureCount,
  });
}

// ---------------------------------------------------------------------------
// Fixture flow
// ---------------------------------------------------------------------------

async function runWithFixtures(scanId: string): Promise<void> {
  setScanProgress(scanId, { message: "Loading fixtures...", percent: 30, phase: "fixtures" });
  await new Promise((r) => setTimeout(r, 500));

  const parsed = parseAdminScanResult(MOCK_ADMIN_SCAN_RESULT);
  await persistResults(scanId, {
    ...parsed,
    workspaces: MOCK_WORKSPACES.map((ws) => ({
      id: "",
      workspaceId: ws.id,
      name: ws.name,
      state: ws.state ?? null,
      type: ws.type ?? null,
    })),
  });
}

// ---------------------------------------------------------------------------
// Shared persist
// ---------------------------------------------------------------------------

async function persistResults(
  scanId: string,
  data: {
    workspaces: FabricWorkspace[];
    datasets: FabricDataset[];
    reports: FabricReport[];
    artifacts: FabricArtifact[];
    measureCount: number;
  }
): Promise<void> {
  setScanProgress(scanId, { message: "Saving results...", percent: 85, phase: "persisting" });

  await insertScanWorkspaces(scanId, data.workspaces);
  await insertScanDatasets(scanId, data.datasets);
  await insertScanReports(scanId, data.reports);
  await insertScanArtifacts(scanId, data.artifacts);

  await updateFabricScan(scanId, {
    status: "completed",
    workspaceCount: data.workspaces.length,
    datasetCount: data.datasets.length,
    reportCount: data.reports.length,
    measureCount: data.measureCount,
    artifactCount: data.artifacts.length,
    completedAt: new Date(),
  });

  setScanProgress(scanId, {
    status: "completed",
    message: `Scan complete: ${data.workspaces.length} workspaces, ${data.datasets.length} datasets, ${data.reports.length} reports`,
    percent: 100,
    phase: "done",
  });
}

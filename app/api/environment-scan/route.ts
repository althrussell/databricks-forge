/**
 * API: /api/environment-scan
 *
 * POST -- start a new standalone environment scan
 * GET  -- list recent scans
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { safeErrorMessage } from "@/lib/error-utils";
import { listEnvironmentScans } from "@/lib/lakebase/environment-scans";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { apiLogger } from "@/lib/logger";
import { toJsonSafe } from "@/lib/json-safe";

export async function GET() {
  const log = apiLogger("/api/environment-scan", "GET");
  try {
    await ensureMigrated();
    const scans = await listEnvironmentScans(50, 0);

    return NextResponse.json({ scans: toJsonSafe(scans) });
  } catch (error) {
    log.error("GET failed", {
      error: error instanceof Error ? error.message : String(error),
      errorCategory: "internal_error",
    });
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const log = apiLogger("/api/environment-scan", "POST");
  try {
    await ensureMigrated();

    const body = await request.json();
    const ucMetadata = body.ucMetadata;
    const lineageDepth =
      typeof body.lineageDepth === "number"
        ? Math.min(Math.max(Math.round(body.lineageDepth), 1), 10)
        : undefined;
    const assetDiscoveryEnabled = body.assetDiscoveryEnabled === true;
    const excludedScope = typeof body.excludedScope === "string" ? body.excludedScope : undefined;
    const exclusionPatterns =
      typeof body.exclusionPatterns === "string" ? body.exclusionPatterns : undefined;

    if (!ucMetadata || typeof ucMetadata !== "string") {
      log.warn("ucMetadata is required", {
        hasUcMetadata: !!ucMetadata,
        ucMetadataType: typeof ucMetadata,
        errorCategory: "validation_failed",
      });
      return NextResponse.json({ error: "ucMetadata is required" }, { status: 400 });
    }

    const scanId = uuidv4();

    // Import dynamically to avoid circular dependencies
    const { runStandaloneEnrichment } = await import("@/lib/pipeline/standalone-scan");

    // Fire and forget -- the scan runs asynchronously
    runStandaloneEnrichment(
      scanId,
      ucMetadata,
      lineageDepth,
      assetDiscoveryEnabled,
      excludedScope,
      exclusionPatterns,
    ).catch((error) => {
      log.error("Standalone scan failed", {
        scanId,
        error: error instanceof Error ? error.message : String(error),
        errorCategory: "scan_failed",
      });
    });

    return NextResponse.json({ scanId }, { status: 201 });
  } catch (error) {
    log.error("POST failed", {
      error: error instanceof Error ? error.message : String(error),
      errorCategory: "internal_error",
    });
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

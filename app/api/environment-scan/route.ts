/**
 * API: /api/environment-scan
 *
 * POST -- start a new standalone environment scan
 * GET  -- list recent scans
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { listEnvironmentScans } from "@/lib/lakebase/environment-scans";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { logger } from "@/lib/logger";
import { toJsonSafe } from "@/lib/json-safe";

export async function GET() {
  try {
    await ensureMigrated();
    const scans = await listEnvironmentScans(50, 0);

    return NextResponse.json({ scans: toJsonSafe(scans) });
  } catch (error) {
    logger.error("[api/environment-scan] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to list environment scans" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();

    const body = await request.json();
    const ucMetadata = body.ucMetadata;

    if (!ucMetadata || typeof ucMetadata !== "string") {
      return NextResponse.json(
        { error: "ucMetadata is required" },
        { status: 400 }
      );
    }

    const scanId = uuidv4();

    // Import dynamically to avoid circular dependencies
    const { runStandaloneEnrichment } = await import(
      "@/lib/pipeline/standalone-scan"
    );

    // Fire and forget -- the scan runs asynchronously
    runStandaloneEnrichment(scanId, ucMetadata).catch((error) => {
      logger.error("[api/environment-scan] Standalone scan failed", {
        scanId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return NextResponse.json({ scanId }, { status: 201 });
  } catch (error) {
    logger.error("[api/environment-scan] POST failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to start environment scan" },
      { status: 500 }
    );
  }
}

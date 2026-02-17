/**
 * API: /api/environment-scan/[scanId]
 *
 * GET -- get scan results with all related data
 */

import { NextRequest, NextResponse } from "next/server";
import { getEnvironmentScan } from "@/lib/lakebase/environment-scans";
import { isValidUUID } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  try {
    const { scanId } = await params;

    if (!isValidUUID(scanId)) {
      return NextResponse.json({ error: "Invalid scan ID" }, { status: 400 });
    }

    const scan = await getEnvironmentScan(scanId);
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Serialize BigInt values to strings for JSON
    const serialized = {
      ...scan,
      totalSizeBytes: scan.totalSizeBytes.toString(),
      totalRows: scan.totalRows.toString(),
      details: scan.details.map((d) => ({
        ...d,
        sizeInBytes: d.sizeInBytes?.toString() ?? null,
        numRows: d.numRows?.toString() ?? null,
      })),
      histories: scan.histories.map((h) => ({
        ...h,
        lastWriteRows: h.lastWriteRows?.toString() ?? null,
        lastWriteBytes: h.lastWriteBytes?.toString() ?? null,
      })),
    };

    return NextResponse.json(serialized);
  } catch (error) {
    logger.error("[api/environment-scan/detail] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to get scan details" },
      { status: 500 }
    );
  }
}

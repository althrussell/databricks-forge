/**
 * API: /api/environment-scan/[scanId]/export
 *
 * GET ?format=excel -- download the Environment Report Excel
 */

import { NextRequest, NextResponse } from "next/server";
import { getEnvironmentScan } from "@/lib/lakebase/environment-scans";
import { generateEnvironmentExcel } from "@/lib/export/environment-excel";
import { isValidUUID } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ scanId: string }> }
) {
  try {
    const { scanId } = await params;
    const format = request.nextUrl.searchParams.get("format") ?? "excel";

    if (!isValidUUID(scanId)) {
      return NextResponse.json({ error: "Invalid scan ID" }, { status: 400 });
    }

    if (format !== "excel") {
      return NextResponse.json(
        { error: "Only excel format is supported" },
        { status: 400 }
      );
    }

    const scan = await getEnvironmentScan(scanId);
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    const buffer = await generateEnvironmentExcel(scan);
    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="environment-report-${scanId.slice(0, 8)}.xlsx"`,
      },
    });
  } catch (error) {
    logger.error("[api/environment-scan/export] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to export environment report" },
      { status: 500 }
    );
  }
}

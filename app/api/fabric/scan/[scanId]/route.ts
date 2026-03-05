/**
 * API: /api/fabric/scan/[scanId]
 *
 * GET    -- get scan detail (with children) or progress
 * DELETE -- delete scan and all associated data
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getFabricScanDetail, deleteFabricScan } from "@/lib/lakebase/fabric-scans";
import { getScanProgress } from "@/lib/fabric/scan-progress";

interface RouteParams {
  params: Promise<{ scanId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await ensureMigrated();
    const { scanId } = await params;

    const mode = request.nextUrl.searchParams.get("mode");
    if (mode === "progress") {
      const progress = getScanProgress(scanId);
      if (progress) return NextResponse.json(progress);
      const detail = await getFabricScanDetail(scanId);
      if (!detail) return NextResponse.json({ error: "Scan not found" }, { status: 404 });
      return NextResponse.json({
        scanId,
        status: detail.status,
        message: detail.status === "completed" ? "Scan complete" : detail.errorMessage ?? "Unknown",
        percent: detail.status === "completed" ? 100 : 0,
        phase: detail.status,
      });
    }

    const detail = await getFabricScanDetail(scanId);
    if (!detail) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get scan" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    await ensureMigrated();
    const { scanId } = await params;
    const deleted = await deleteFabricScan(scanId);
    if (!deleted) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete scan" },
      { status: 500 }
    );
  }
}

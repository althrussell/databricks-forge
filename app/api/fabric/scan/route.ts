/**
 * API: /api/fabric/scan
 *
 * GET  -- list all scans (optionally filtered by connectionId)
 * POST -- trigger a new Fabric scan for a given connection
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getConnection } from "@/lib/lakebase/connections";
import { listFabricScans } from "@/lib/lakebase/fabric-scans";
import { runFabricScan } from "@/lib/fabric/scan-orchestrator";
import { getCurrentUserEmail } from "@/lib/dbx/client";

export async function GET(request: NextRequest) {
  try {
    await ensureMigrated();
    const connectionId = request.nextUrl.searchParams.get("connectionId") ?? undefined;
    const scans = await listFabricScans(connectionId);
    return NextResponse.json(scans);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list scans" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();
    const body = (await request.json()) as { connectionId: string };

    if (!body.connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 400 }
      );
    }

    const conn = await getConnection(body.connectionId);
    if (!conn) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    const userEmail = await getCurrentUserEmail();
    const scanId = await runFabricScan(conn, userEmail);
    return NextResponse.json({ scanId }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start scan" },
      { status: 500 }
    );
  }
}

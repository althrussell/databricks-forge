/**
 * API: /api/connections
 *
 * GET  -- list all connections (summaries, no secrets)
 * POST -- create a new external connection
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import {
  listConnections,
  createConnection,
} from "@/lib/lakebase/connections";
import { getCurrentUserEmail } from "@/lib/dbx/client";
import type { CreateConnectionInput } from "@/lib/connections/types";

export async function GET() {
  try {
    await ensureMigrated();
    const connections = await listConnections();
    return NextResponse.json(connections);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list connections" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();
    const body = (await request.json()) as CreateConnectionInput;

    if (!body.name?.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }
    if (!body.tenantId?.trim() || !body.clientId?.trim() || !body.clientSecret?.trim()) {
      return NextResponse.json(
        { error: "tenantId, clientId, and clientSecret are required" },
        { status: 400 }
      );
    }
    if (!["fabric"].includes(body.connectorType)) {
      return NextResponse.json(
        { error: `Unsupported connector type: ${body.connectorType}` },
        { status: 400 }
      );
    }
    if (!["admin", "workspace"].includes(body.accessLevel)) {
      return NextResponse.json(
        { error: `accessLevel must be "admin" or "workspace"` },
        { status: 400 }
      );
    }

    const userEmail = await getCurrentUserEmail();
    const record = await createConnection(body, userEmail);
    return NextResponse.json(record, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create connection" },
      { status: 500 }
    );
  }
}

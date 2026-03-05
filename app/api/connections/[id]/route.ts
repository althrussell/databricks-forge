/**
 * API: /api/connections/[id]
 *
 * GET    -- get connection detail (no secret)
 * PATCH  -- update connection (name, secret, workspace filter)
 * DELETE -- delete connection and all associated scans
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import {
  getConnection,
  updateConnection,
  deleteConnection,
} from "@/lib/lakebase/connections";
import type { UpdateConnectionInput } from "@/lib/connections/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    await ensureMigrated();
    const { id } = await params;
    const conn = await getConnection(id);
    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    return NextResponse.json(conn);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to get connection" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await ensureMigrated();
    const { id } = await params;
    const body = (await request.json()) as UpdateConnectionInput;
    const updated = await updateConnection(id, body);
    if (!updated) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to update connection" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    await ensureMigrated();
    const { id } = await params;
    const deleted = await deleteConnection(id);
    if (!deleted) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete connection" },
      { status: 500 }
    );
  }
}

/**
 * API: /api/connections/[id]/test
 *
 * POST -- test connectivity by acquiring a token and listing workspaces
 */

import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import {
  getConnection,
  getConnectionSecret,
  markConnectionTested,
} from "@/lib/lakebase/connections";
import { acquireToken, listWorkspaces } from "@/lib/fabric/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    await ensureMigrated();
    const { id } = await params;

    const conn = await getConnection(id);
    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    const secret = await getConnectionSecret(id);
    if (!secret) {
      return NextResponse.json(
        { error: "Could not decrypt connection credentials" },
        { status: 500 }
      );
    }

    const token = await acquireToken(secret.tenantId, secret.clientId, secret.clientSecret);
    const workspaces = await listWorkspaces(
      token,
      conn.accessLevel as "admin" | "workspace",
      conn.workspaceFilter
    );

    await markConnectionTested(id);

    return NextResponse.json({
      success: true,
      message: `Connected successfully. Found ${workspaces.length} workspace(s).`,
      workspaces: workspaces.slice(0, 100).map((w) => ({ id: w.id, name: w.name })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection test failed";
    return NextResponse.json(
      { success: false, message: msg, workspaces: [] },
      { status: 200 }
    );
  }
}

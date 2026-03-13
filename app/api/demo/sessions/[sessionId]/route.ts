import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/demo/config";
import { getDemoSession, getDemoSessionResearch } from "@/lib/lakebase/demo-sessions";
import { cleanupDemoSession } from "@/lib/demo/cleanup";
import { databricksSqlExecutor } from "@/lib/ports/defaults/databricks-sql-executor";
import { logger } from "@/lib/logger";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "Demo mode is not enabled" }, { status: 404 });
  }

  const { sessionId } = await params;
  const session = await getDemoSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const research = await getDemoSessionResearch(sessionId);

  return NextResponse.json({ ...session, research });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "Demo mode is not enabled" }, { status: 404 });
  }

  const { sessionId } = await params;

  try {
    const result = await cleanupDemoSession(sessionId, databricksSqlExecutor);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[demo/sessions] Delete error", { sessionId, error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/demo/config";
import { listDemoSessions } from "@/lib/lakebase/demo-sessions";
import { logger } from "@/lib/logger";

export async function GET() {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "Demo mode is not enabled" }, { status: 404 });
  }

  try {
    const sessions = await listDemoSessions();
    return NextResponse.json(sessions);
  } catch (err) {
    logger.error("[demo/sessions] Error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

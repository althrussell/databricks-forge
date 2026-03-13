import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/demo/config";
import { getDataJobStatus } from "@/lib/demo/data-engine/engine-status";

export async function GET(request: Request) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "Demo mode is not enabled" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const status = await getDataJobStatus(sessionId);
  if (!status) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(status);
}

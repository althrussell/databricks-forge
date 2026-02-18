/**
 * API: /api/activity
 *
 * GET -- get recent activity feed entries.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getRecentActivity } from "@/lib/lakebase/activity-log";
import { ensureMigrated } from "@/lib/lakebase/schema";

export async function GET(request: NextRequest) {
  try {
    await ensureMigrated();
    const { searchParams } = new URL(request.url);
    const limit = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "20", 10) || 20, 1),
      100
    );

    const activities = await getRecentActivity(limit);

    return NextResponse.json({ activities });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[activity] Failed to fetch activity", { error: msg });
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch activity",
      },
      { status: 500 }
    );
  }
}

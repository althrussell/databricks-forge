/**
 * API: /api/migrate
 *
 * POST -- run Lakebase migrations (create schema + tables)
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { runMigrations } from "@/lib/lakebase/schema";

export async function POST() {
  try {
    await runMigrations();
    return NextResponse.json({ message: "Migrations completed successfully" });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[migrate] Migration failed", { error: msg });
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Migration failed",
      },
      { status: 500 }
    );
  }
}

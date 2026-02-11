/**
 * API: /api/migrate
 *
 * POST -- run Lakebase migrations (create schema + tables)
 */

import { NextResponse } from "next/server";
import { runMigrations } from "@/lib/lakebase/schema";

export async function POST() {
  try {
    await runMigrations();
    return NextResponse.json({ message: "Migrations completed successfully" });
  } catch (error) {
    console.error("[POST /api/migrate]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Migration failed",
      },
      { status: 500 }
    );
  }
}

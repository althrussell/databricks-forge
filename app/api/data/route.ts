/**
 * API: /api/data
 *
 * DELETE -- wipe all application data (factory reset)
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { deleteAllData } from "@/lib/lakebase/reset";

export async function DELETE() {
  try {
    await ensureMigrated();
    await deleteAllData();

    logger.info("[api/data] All application data deleted (factory reset)");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/data] DELETE failed", { error: msg });
    return NextResponse.json(
      { error: msg || "Failed to delete data" },
      { status: 500 },
    );
  }
}

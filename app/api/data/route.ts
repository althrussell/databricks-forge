/**
 * API: /api/data
 *
 * DELETE -- wipe all application data (factory reset)
 *
 * Requires the `x-confirm-delete` header set to "delete-all-data" to
 * prevent accidental invocation.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { deleteAllData } from "@/lib/lakebase/reset";

const CONFIRMATION_VALUE = "delete-all-data";

export async function DELETE(request: NextRequest) {
  try {
    const confirm = request.headers.get("x-confirm-delete");
    if (confirm !== CONFIRMATION_VALUE) {
      return NextResponse.json(
        { error: "Missing or invalid confirmation header. Set x-confirm-delete: delete-all-data to proceed." },
        { status: 400 },
      );
    }

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

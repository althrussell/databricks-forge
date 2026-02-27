/**
 * API: /api/metadata-genie
 *
 * GET    -- List all metadata genie spaces
 * DELETE -- Trash a metadata genie space (drops views + trashes Genie Space)
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/lib/dbx/sql";
import { trashGenieSpace } from "@/lib/dbx/genie";
import { generateDropViewDDL } from "@/lib/metadata-genie/view-ddl";
import {
  listMetadataGenieSpaces,
  getMetadataGenieSpace,
  updateMetadataGenieStatus,
} from "@/lib/lakebase/metadata-genie";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const spaces = await listMetadataGenieSpaces();
    return NextResponse.json({ spaces });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { id, dropViews } = (await request.json()) as {
      id: string;
      dropViews?: boolean;
    };

    if (!id) {
      return NextResponse.json(
        { error: "id is required" },
        { status: 400 }
      );
    }

    const space = await getMetadataGenieSpace(id);
    if (!space) {
      return NextResponse.json(
        { error: "Metadata Genie space not found" },
        { status: 404 }
      );
    }

    // Trash the Genie Space if deployed
    if (space.spaceId) {
      try {
        await trashGenieSpace(space.spaceId);
      } catch (err) {
        logger.warn("Failed to trash Genie Space", {
          spaceId: space.spaceId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Drop views if requested and they were deployed
    if (dropViews && space.viewNames && space.viewNames.length > 0) {
      const dropStatements = generateDropViewDDL(space.viewNames);
      for (const ddl of dropStatements) {
        try {
          await executeSQL(ddl);
        } catch (err) {
          logger.warn("Failed to drop view", {
            ddl,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    await updateMetadataGenieStatus(id, "trashed");

    logger.info("Metadata Genie space trashed", {
      id,
      viewsDropped: dropViews ?? false,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Metadata Genie trash failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

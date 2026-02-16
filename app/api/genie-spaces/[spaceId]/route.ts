/**
 * API: /api/genie-spaces/[spaceId]
 *
 * PATCH  -- Update a Genie space
 * DELETE -- Trash a Genie space
 */

import { NextRequest, NextResponse } from "next/server";
import { updateGenieSpace, trashGenieSpace } from "@/lib/dbx/genie";
import {
  trackGenieSpaceUpdated,
  trackGenieSpaceTrashed,
} from "@/lib/lakebase/genie-spaces";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;
    const body = await request.json();
    const { title, description, serializedSpace } = body as {
      title?: string;
      description?: string;
      serializedSpace?: string;
    };

    const result = await updateGenieSpace(spaceId, {
      title,
      description,
      serializedSpace,
    });

    // Update tracking
    await trackGenieSpaceUpdated(spaceId, title);

    return NextResponse.json({
      spaceId: result.space_id,
      title: result.title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const { spaceId } = await params;

    await trashGenieSpace(spaceId);
    await trackGenieSpaceTrashed(spaceId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

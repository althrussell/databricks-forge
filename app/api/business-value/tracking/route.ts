/**
 * GET /api/business-value/tracking -- list all tracking entries
 * PATCH /api/business-value/tracking -- update a tracking entry
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  getTrackingForRun,
  upsertTracking,
  getTrackingByStage,
} from "@/lib/lakebase/use-case-tracking";
import { withPrisma } from "@/lib/prisma";
import type { TrackingStage } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const runId = req.nextUrl.searchParams.get("runId");

    if (runId) {
      const entries = await getTrackingForRun(runId);
      return NextResponse.json(entries);
    }

    // Return aggregated stage counts
    const byStage = await getTrackingByStage();

    // Also get all entries across runs
    const allEntries = await withPrisma(async (prisma) => {
      return prisma.forgeUseCaseTracking.findMany({
        orderBy: { updatedAt: "desc" },
        take: 500,
        include: {
          run: {
            select: { businessName: true },
          },
        },
      });
    });

    return NextResponse.json({ byStage, entries: allEntries });
  } catch (err) {
    logger.error("[api/business-value/tracking] GET failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to load tracking data" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { runId, useCaseId, stage, assignedOwner, notes } = body as {
      runId: string;
      useCaseId: string;
      stage?: TrackingStage;
      assignedOwner?: string;
      notes?: Array<{ text: string; author?: string; createdAt: string }>;
    };

    if (!runId || !useCaseId) {
      return NextResponse.json({ error: "runId and useCaseId required" }, { status: 400 });
    }

    const entry = await upsertTracking(runId, useCaseId, { stage, assignedOwner, notes });
    return NextResponse.json(entry);
  } catch (err) {
    logger.error("[api/business-value/tracking] PATCH failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to update tracking" }, { status: 500 });
  }
}

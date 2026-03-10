/**
 * GET /api/business-value/strategy/[id]
 *
 * Returns a strategy document with alignments for the latest completed run.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getStrategyDocument, getAlignmentsForStrategy } from "@/lib/lakebase/strategy-documents";
import { withPrisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const doc = await getStrategyDocument(id);
    if (!doc) {
      return NextResponse.json({ error: "Strategy document not found" }, { status: 404 });
    }

    const latestRun = await withPrisma(async (prisma) => {
      return prisma.forgeRun.findFirst({
        where: { status: "completed" },
        orderBy: { completedAt: "desc" },
        select: { runId: true },
      });
    });

    const alignments = latestRun ? await getAlignmentsForStrategy(id, latestRun.runId) : [];

    return NextResponse.json({ doc, alignments });
  } catch (err) {
    logger.error("[api/business-value/strategy/[id]] GET failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to load strategy document" }, { status: 500 });
  }
}

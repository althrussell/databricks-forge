/**
 * GET /api/runs/[runId]/business-value
 *
 * Returns all business value data for a specific run:
 * value estimates, roadmap phases, synthesis, stakeholder profiles, and tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getValueEstimatesForRun, getValueSummaryForRun } from "@/lib/lakebase/value-estimates";
import { getRoadmapPhasesForRun } from "@/lib/lakebase/roadmap-phases";
import { getTrackingForRun } from "@/lib/lakebase/use-case-tracking";
import { getStakeholderProfilesForRun } from "@/lib/lakebase/stakeholder-profiles";
import { getValueCapturesForRun } from "@/lib/lakebase/value-captures";
import { withPrisma } from "@/lib/prisma";
import type { ExecutiveSynthesis } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;

    const [
      estimates,
      valueSummary,
      roadmapPhases,
      tracking,
      stakeholders,
      valueCaptures,
      synthesisRow,
    ] = await Promise.all([
      getValueEstimatesForRun(runId),
      getValueSummaryForRun(runId),
      getRoadmapPhasesForRun(runId),
      getTrackingForRun(runId),
      getStakeholderProfilesForRun(runId),
      getValueCapturesForRun(runId),
      withPrisma(async (prisma) => {
        const row = await prisma.forgeRun.findUnique({
          where: { runId },
          select: { synthesisJson: true },
        });
        return row?.synthesisJson ?? null;
      }),
    ]);

    let synthesis: ExecutiveSynthesis | null = null;
    if (synthesisRow) {
      try {
        synthesis = JSON.parse(synthesisRow) as ExecutiveSynthesis;
      } catch {
        synthesis = null;
      }
    }

    return NextResponse.json({
      estimates,
      valueSummary,
      roadmapPhases,
      tracking,
      stakeholders,
      valueCaptures,
      synthesis,
    });
  } catch (err) {
    logger.error("[api/runs/business-value] GET failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to load business value data" }, { status: 500 });
  }
}

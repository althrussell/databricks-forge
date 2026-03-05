/**
 * API: /api/genie-spaces/[spaceId]/benchmarks/history
 *
 * GET -- List past benchmark runs for a space, ordered by most recent.
 */

import { NextRequest, NextResponse } from "next/server";
import { getBenchmarkHistory } from "@/lib/lakebase/space-health";
import { isSafeId } from "@/lib/validation";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    if (!isSafeId(spaceId)) {
      return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
    }

    const runs = await getBenchmarkHistory(spaceId);

    const history = runs.map((run) => ({
      id: run.id,
      runAt: run.runAt,
      totalQuestions: run.totalQuestions,
      passedCount: run.passedCount,
      failedCount: run.failedCount,
      errorCount: run.errorCount,
      passRate: run.totalQuestions > 0 ? Math.round((run.passedCount / run.totalQuestions) * 100) : 0,
      improvementsApplied: run.improvementsApplied,
      hasFeedback: !!run.feedbackJson,
    }));

    return NextResponse.json({ history });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

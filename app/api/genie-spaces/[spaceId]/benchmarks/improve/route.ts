/**
 * API: /api/genie-spaces/[spaceId]/benchmarks/improve
 *
 * POST -- Generate targeted improvements from benchmark feedback.
 *         Analyzes labeled failures and runs relevant fix strategies.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGenieSpace } from "@/lib/dbx/genie";
import { getBenchmarkRun } from "@/lib/lakebase/space-health";
import { runFixes } from "@/lib/genie/space-fixer";
import { analyzeFeedbackForFixes, type FeedbackEntry } from "@/lib/genie/benchmark-feedback";
import { getSpaceCache, setSpaceCache } from "@/lib/genie/space-cache";
import { isSafeId } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    if (!isSafeId(spaceId)) {
      return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
    }

    const body = await request.json();
    const { benchmarkRunId } = body as { benchmarkRunId: string };

    if (!benchmarkRunId) {
      return NextResponse.json({ error: "benchmarkRunId is required" }, { status: 400 });
    }

    const run = await getBenchmarkRun(benchmarkRunId);
    if (!run) {
      return NextResponse.json({ error: "Benchmark run not found" }, { status: 404 });
    }

    const feedback: FeedbackEntry[] = run.feedbackJson ? JSON.parse(run.feedbackJson) : [];
    if (feedback.length === 0) {
      return NextResponse.json({ error: "No feedback has been submitted for this run" }, { status: 400 });
    }

    const checkIdsToFix = analyzeFeedbackForFixes(feedback);
    if (checkIdsToFix.length === 0) {
      return NextResponse.json({ message: "No improvements identified from feedback" });
    }

    let serializedSpace = getSpaceCache(spaceId);
    if (!serializedSpace) {
      const spaceResponse = await getGenieSpace(spaceId);
      serializedSpace = spaceResponse.serialized_space ?? "{}";
      setSpaceCache(spaceId, serializedSpace);
    }

    const result = await runFixes({ checkIds: checkIdsToFix, serializedSpace });

    logger.info(
      { spaceId, strategies: result.strategiesRun, changes: result.changes.length },
      "Benchmark improvement generated",
    );

    return NextResponse.json({
      updatedSerializedSpace: JSON.stringify(result.updatedSpace),
      changes: result.changes,
      strategiesRun: result.strategiesRun,
      originalSerializedSpace: serializedSpace,
      analyzedFixes: checkIdsToFix,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: message }, "Benchmark improvement failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

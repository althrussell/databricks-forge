/**
 * API: /api/genie-spaces/[spaceId]/benchmarks/feedback
 *
 * POST -- Save labeled results (correct/incorrect + optional feedback text).
 */

import { NextRequest, NextResponse } from "next/server";
import { updateBenchmarkFeedback } from "@/lib/lakebase/space-health";
import { isSafeId } from "@/lib/validation";

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
    const { benchmarkRunId, feedback } = body as {
      benchmarkRunId: string;
      feedback: Array<{
        question: string;
        isCorrect: boolean;
        feedbackText?: string;
        expectedSql?: string;
      }>;
    };

    if (!benchmarkRunId || !Array.isArray(feedback)) {
      return NextResponse.json(
        { error: "benchmarkRunId and feedback array are required" },
        { status: 400 },
      );
    }

    await updateBenchmarkFeedback(benchmarkRunId, JSON.stringify(feedback));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

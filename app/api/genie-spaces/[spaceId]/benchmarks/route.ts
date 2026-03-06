/**
 * API: /api/genie-spaces/[spaceId]/benchmarks
 *
 * GET -- Fetch benchmark questions from the space's serialized_space.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGenieSpace } from "@/lib/dbx/genie";
import { getSpaceCache, setSpaceCache } from "@/lib/genie/space-cache";
import { isSafeId } from "@/lib/validation";
import { safeErrorMessage } from "@/lib/error-utils";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    if (!isSafeId(spaceId)) {
      return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
    }

    let serializedSpace = getSpaceCache(spaceId);
    if (!serializedSpace) {
      const response = await getGenieSpace(spaceId);
      serializedSpace = response.serialized_space ?? "{}";
      setSpaceCache(spaceId, serializedSpace);
    }

    const space = JSON.parse(serializedSpace);
    const questions = (space.benchmarks?.questions ?? []).map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (q: any) => ({
        question: Array.isArray(q.question) ? q.question[0] : String(q.question ?? ""),
        expectedSql: q.answer?.[0]?.content?.[0] ?? null,
      }),
    );

    return NextResponse.json({
      questions,
      source: questions.length > 0 ? "space" : "none",
      total: questions.length,
    });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

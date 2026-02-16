/**
 * API: /api/runs/compare
 *
 * GET -- compare two runs side by side.
 * Query params: ?runA=<uuid>&runB=<uuid>
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { isValidUUID } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    await ensureMigrated();
    const { searchParams } = new URL(request.url);
    const runAId = searchParams.get("runA");
    const runBId = searchParams.get("runB");

    if (!runAId || !runBId || !isValidUUID(runAId) || !isValidUUID(runBId)) {
      return NextResponse.json(
        { error: "Both runA and runB query params (valid UUIDs) are required" },
        { status: 400 }
      );
    }

    const [runA, runB] = await Promise.all([
      getRunById(runAId),
      getRunById(runBId),
    ]);

    if (!runA || !runB) {
      return NextResponse.json(
        { error: "One or both runs not found" },
        { status: 404 }
      );
    }

    const [useCasesA, useCasesB] = await Promise.all([
      getUseCasesByRunId(runAId),
      getUseCasesByRunId(runBId),
    ]);

    // Compute overlap by use case name similarity
    const namesA = new Set(useCasesA.map((uc) => uc.name.toLowerCase()));
    const namesB = new Set(useCasesB.map((uc) => uc.name.toLowerCase()));
    const shared = [...namesA].filter((n) => namesB.has(n));
    const uniqueA = [...namesA].filter((n) => !namesB.has(n));
    const uniqueB = [...namesB].filter((n) => !namesA.has(n));

    // Domain comparison
    const domainsA = [...new Set(useCasesA.map((uc) => uc.domain))];
    const domainsB = [...new Set(useCasesB.map((uc) => uc.domain))];

    const avgScoreA =
      useCasesA.length > 0
        ? useCasesA.reduce((s, uc) => s + uc.overallScore, 0) /
          useCasesA.length
        : 0;
    const avgScoreB =
      useCasesB.length > 0
        ? useCasesB.reduce((s, uc) => s + uc.overallScore, 0) /
          useCasesB.length
        : 0;

    return NextResponse.json({
      runA: {
        run: runA,
        useCaseCount: useCasesA.length,
        avgScore: Math.round(avgScoreA * 100),
        domains: domainsA,
        aiCount: useCasesA.filter((uc) => uc.type === "AI").length,
        statisticalCount: useCasesA.filter(
          (uc) => uc.type === "Statistical"
        ).length,
      },
      runB: {
        run: runB,
        useCaseCount: useCasesB.length,
        avgScore: Math.round(avgScoreB * 100),
        domains: domainsB,
        aiCount: useCasesB.filter((uc) => uc.type === "AI").length,
        statisticalCount: useCasesB.filter(
          (uc) => uc.type === "Statistical"
        ).length,
      },
      overlap: {
        sharedCount: shared.length,
        uniqueACount: uniqueA.length,
        uniqueBCount: uniqueB.length,
        sharedNames: shared.slice(0, 20),
      },
    });
  } catch (error) {
    console.error("[GET /api/runs/compare]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to compare runs",
      },
      { status: 500 }
    );
  }
}

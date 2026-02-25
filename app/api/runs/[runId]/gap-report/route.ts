/**
 * API: /api/runs/[runId]/gap-report
 *
 * GET -- Download an Excel gap report for the industry coverage analysis.
 *
 * Only works when the run has a configured industry outcome map.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { getRunById } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { generateGapReportExcel } from "@/lib/export/gap-report-excel";
import { computeIndustryCoverage } from "@/lib/domain/industry-coverage";
import { getAllIndustryOutcomes } from "@/lib/domain/industry-outcomes-server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;
    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: "Invalid run ID" }, { status: 400 });
    }

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Run not completed" },
        { status: 400 }
      );
    }

    if (!run.config.industry) {
      return NextResponse.json(
        { error: "No industry outcome map configured for this run" },
        { status: 400 }
      );
    }

    const outcomes = await getAllIndustryOutcomes();
    const industry = outcomes.find((o: { id: string }) => o.id === run.config.industry);
    if (!industry) {
      return NextResponse.json(
        { error: "Industry outcome map not found" },
        { status: 404 }
      );
    }

    const useCases = await getUseCasesByRunId(runId);
    const coverage = computeIndustryCoverage(industry, useCases);

    if (coverage.gapCount === 0) {
      return NextResponse.json(
        { error: "No gaps identified -- full coverage achieved" },
        { status: 400 }
      );
    }

    const buffer = await generateGapReportExcel(
      coverage,
      industry.name,
      run.config.businessName
    );

    const safeBusinessName = run.config.businessName
      .replace(/[^a-zA-Z0-9-_ ]/g, "")
      .replace(/\s+/g, "_");

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${safeBusinessName}_gap_report.xlsx"`,
      },
    });
  } catch (err) {
    logger.error("[api/runs/runId/gap-report] Failed to generate gap report", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to generate gap report" },
      { status: 500 }
    );
  }
}

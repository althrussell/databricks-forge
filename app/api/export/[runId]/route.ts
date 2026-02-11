/**
 * API: /api/export/[runId]
 *
 * GET -- export use cases in the specified format
 *
 * Query params:
 *   ?format=excel|pdf|pptx|notebooks
 */

import { NextRequest, NextResponse } from "next/server";
import { getRunById } from "@/lib/lakebase/runs";
import { getUseCasesByRunId } from "@/lib/lakebase/usecases";
import { generateExcel } from "@/lib/export/excel";
import { generatePptx } from "@/lib/export/pptx";
import { generateNotebooks } from "@/lib/export/notebooks";
import { ensureMigrated } from "@/lib/lakebase/schema";
import type { ExportFormat } from "@/lib/domain/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    await ensureMigrated();
    const { runId } = await params;
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") as ExportFormat | null;

    if (!format || !["excel", "pdf", "pptx", "notebooks"].includes(format)) {
      return NextResponse.json(
        { error: "format query param required: excel, pdf, pptx, or notebooks" },
        { status: 400 }
      );
    }

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status !== "completed") {
      return NextResponse.json(
        { error: "Run has not completed yet" },
        { status: 400 }
      );
    }

    const useCases = await getUseCasesByRunId(runId);

    switch (format) {
      case "excel": {
        const buffer = await generateExcel(run, useCases);
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="inspire_${run.config.businessName.replace(/\s+/g, "_")}_${runId.substring(0, 8)}.xlsx"`,
          },
        });
      }
      case "pptx": {
        const buffer = await generatePptx(run, useCases);
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "Content-Disposition": `attachment; filename="inspire_${run.config.businessName.replace(/\s+/g, "_")}_${runId.substring(0, 8)}.pptx"`,
          },
        });
      }
      case "pdf": {
        // PDF generation is complex -- return a simple JSON catalog for now
        // TODO: Implement full PDF with @react-pdf/renderer
        return NextResponse.json({
          message: "PDF export not yet implemented. Use Excel or PPTX.",
          useCases: useCases.map((uc) => ({
            id: uc.id,
            name: uc.name,
            domain: uc.domain,
            statement: uc.statement,
            solution: uc.solution,
            overallScore: uc.overallScore,
          })),
        });
      }
      case "notebooks": {
        const result = await generateNotebooks(run, useCases);
        return NextResponse.json(result);
      }
      default:
        return NextResponse.json(
          { error: `Unsupported format: ${format}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[GET /api/export/[runId]]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}

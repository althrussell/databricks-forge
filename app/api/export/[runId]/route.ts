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
import { generatePdf } from "@/lib/export/pdf";
import { generateNotebooks } from "@/lib/export/notebooks";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getConfig, getCurrentUserEmail } from "@/lib/dbx/client";
import { insertExportRecord } from "@/lib/lakebase/exports";
import { logActivity } from "@/lib/lakebase/activity-log";
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

    const userEmail = await getCurrentUserEmail();

    switch (format) {
      case "excel": {
        const buffer = await generateExcel(run, useCases);
        insertExportRecord(runId, "excel");
        logActivity("exported", { userId: userEmail, resourceId: runId, metadata: { format: "excel", businessName: run.config.businessName } });
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": `attachment; filename="forge_${run.config.businessName.replace(/\s+/g, "_")}_${runId.substring(0, 8)}.xlsx"`,
          },
        });
      }
      case "pptx": {
        const buffer = await generatePptx(run, useCases);
        insertExportRecord(runId, "pptx");
        logActivity("exported", { userId: userEmail, resourceId: runId, metadata: { format: "pptx", businessName: run.config.businessName } });
        return new NextResponse(new Uint8Array(buffer), {
          status: 200,
          headers: {
            "Content-Type":
              "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "Content-Disposition": `attachment; filename="forge_${run.config.businessName.replace(/\s+/g, "_")}_${runId.substring(0, 8)}.pptx"`,
          },
        });
      }
      case "pdf": {
        const pdfBuffer = await generatePdf(run, useCases);
        insertExportRecord(runId, "pdf");
        logActivity("exported", { userId: userEmail, resourceId: runId, metadata: { format: "pdf", businessName: run.config.businessName } });
        return new NextResponse(new Uint8Array(pdfBuffer), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="forge_${run.config.businessName.replace(/\s+/g, "_")}_${runId.substring(0, 8)}.pdf"`,
          },
        });
      }
      case "notebooks": {
        const result = await generateNotebooks(run, useCases, userEmail);
        const { host } = getConfig();
        const workspaceUrl = `${host}/#workspace${result.path}`;
        insertExportRecord(runId, "notebooks", result.path);
        logActivity("exported", { userId: userEmail, resourceId: runId, metadata: { format: "notebooks", businessName: run.config.businessName, path: result.path } });
        return NextResponse.json({ ...result, url: workspaceUrl });
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

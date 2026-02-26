/**
 * API: POST /api/metadata-genie/generate
 *
 * Probes system.information_schema, detects industry via LLM, and saves
 * a draft space with preview data (questions, domains, detection).
 * The viewTarget and SerializedSpace are set later at deploy time.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { probeSystemInformationSchema } from "@/lib/metadata-genie/probe";
import { detectIndustry } from "@/lib/metadata-genie/industry-detect";
import { buildPreviewQuestions } from "@/lib/metadata-genie/space-builder";
import { saveMetadataGenieSpace } from "@/lib/lakebase/metadata-genie";
import { logger } from "@/lib/logger";
import type { MetadataGenieGenerateConfig } from "@/lib/metadata-genie/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MetadataGenieGenerateConfig;
    const { title } = body;

    const probe = await probeSystemInformationSchema();
    if (!probe.accessible) {
      return NextResponse.json(
        { error: probe.error ?? "Cannot access system.information_schema" },
        { status: 403 }
      );
    }

    const tableNames = probe.tableNames ?? [];
    const detection = await detectIndustry(tableNames);

    const sampleQuestions = buildPreviewQuestions(
      detection.outcomeMap,
      detection.llmDetection
    );

    const id = randomUUID();
    const saved = await saveMetadataGenieSpace({
      id,
      title: title ?? "Meta Data Genie",
      industryId: detection.outcomeMapId,
      industryName: detection.outcomeMap?.name ?? null,
      domains: detection.llmDetection.domains,
      detection: detection.llmDetection,
      sampleQuestions,
      tableCount: tableNames.length,
    });

    logger.info("Metadata Genie draft generated", {
      id,
      industryId: detection.outcomeMapId,
      tableCount: tableNames.length,
      questionCount: sampleQuestions.length,
    });

    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Metadata Genie generation failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

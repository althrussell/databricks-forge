/**
 * API: POST /api/metadata-genie/generate
 *
 * Detects industry from table/schema names via LLM, maps to outcome map,
 * and builds a SerializedSpace with curated views and tailored content.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { probeSystemInformationSchema } from "@/lib/metadata-genie/probe";
import { detectIndustry } from "@/lib/metadata-genie/industry-detect";
import { buildMetadataGenieSpace } from "@/lib/metadata-genie/space-builder";
import { saveMetadataGenieSpace } from "@/lib/lakebase/metadata-genie";
import { logger } from "@/lib/logger";
import type { MetadataGenieGenerateConfig } from "@/lib/metadata-genie/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as MetadataGenieGenerateConfig;
    const { catalogScope, viewTarget, title } = body;

    if (!viewTarget?.catalog || !viewTarget?.schema) {
      return NextResponse.json(
        { error: "viewTarget.catalog and viewTarget.schema are required" },
        { status: 400 }
      );
    }

    // 1. Probe access and fetch table names
    const probe = await probeSystemInformationSchema();
    if (!probe.accessible) {
      return NextResponse.json(
        { error: probe.error ?? "Cannot access system.information_schema" },
        { status: 403 }
      );
    }

    const tableNames = probe.tableNames ?? [];

    // 2. Detect industry via LLM + map to outcome map
    const detection = await detectIndustry(tableNames);

    // 3. Build SerializedSpace
    const space = buildMetadataGenieSpace({
      viewTarget,
      outcomeMap: detection.outcomeMap,
      llmDetection: detection.llmDetection,
      catalogScope,
      title,
    });

    // 4. Save to Lakebase
    const id = randomUUID();
    const saved = await saveMetadataGenieSpace({
      id,
      title: title ?? "Meta Data Genie",
      catalogScope,
      industryId: detection.outcomeMapId,
      industryName: detection.outcomeMap?.name ?? null,
      domains: detection.llmDetection.domains,
      detection: detection.llmDetection,
      viewCatalog: viewTarget.catalog,
      viewSchema: viewTarget.schema,
      serializedSpace: JSON.stringify(space),
      tableCount: tableNames.length,
    });

    logger.info("Metadata Genie space generated", {
      id,
      industryId: detection.outcomeMapId,
      tableCount: tableNames.length,
    });

    return NextResponse.json(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Metadata Genie generation failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/business-value/strategy -- list strategy documents
 * POST /api/business-value/strategy -- create a new strategy document
 * DELETE /api/business-value/strategy -- delete a strategy document
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  listStrategyDocuments,
  createStrategyDocument,
  deleteStrategyDocument,
  getStrategyDocument,
  updateStrategyDocument,
} from "@/lib/lakebase/strategy-documents";
import { executeAIQuery } from "@/lib/ai/agent";
import { getServingEndpoint } from "@/lib/dbx/client";
import type { StrategyInitiative } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const docs = await listStrategyDocuments();
    return NextResponse.json(docs);
  } catch (err) {
    logger.error("[api/business-value/strategy] GET failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to load strategy documents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, content } = body as { title: string; content: string };

    if (!title || !content) {
      return NextResponse.json({ error: "title and content are required" }, { status: 400 });
    }

    // Create the document
    const doc = await createStrategyDocument({ title, rawContent: content });

    // Parse initiatives using LLM
    try {
      const result = await executeAIQuery({
        promptKey: "PARSE_OUTCOME_MAP",
        variables: {
          raw_content: content,
          format_instructions: `Parse this data strategy document into structured initiatives. Return JSON:
{
  "initiatives": [
    {
      "index": 0,
      "name": "Initiative name",
      "description": "Brief description",
      "expected_outcomes": ["Outcome 1"],
      "data_requirements": ["Required data or tables"]
    }
  ]
}`,
        },
        modelEndpoint: getServingEndpoint(),
        responseFormat: "json_object",
      });

      const parsed = JSON.parse(
        result.rawResponse
          ?.replace(/```json\s*/g, "")
          .replace(/```\s*/g, "")
          .trim() ?? "{}",
      );
      const initiatives: StrategyInitiative[] = (parsed.initiatives ?? []).map(
        (i: Record<string, unknown>, idx: number) => ({
          index: i.index ?? idx,
          name: String(i.name ?? ""),
          description: String(i.description ?? ""),
          expectedOutcomes: (i.expected_outcomes as string[]) ?? [],
          dataRequirements: (i.data_requirements as string[]) ?? [],
        }),
      );

      await updateStrategyDocument(doc.id, { parsedInitiatives: initiatives });
      const updated = await getStrategyDocument(doc.id);
      return NextResponse.json(updated, { status: 201 });
    } catch (parseErr) {
      logger.warn("[strategy] Initiative parsing failed (non-fatal)", { error: String(parseErr) });
      return NextResponse.json(doc, { status: 201 });
    }
  } catch (err) {
    logger.error("[api/business-value/strategy] POST failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to create strategy document" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await deleteStrategyDocument(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[api/business-value/strategy] DELETE failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to delete strategy document" }, { status: 500 });
  }
}

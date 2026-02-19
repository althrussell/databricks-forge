/**
 * API: /api/runs/[runId]/genie-engine/[domain]/test
 *
 * POST -- Test a deployed Genie Space by running questions via the
 *         Conversation API and reporting results.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  startConversation,
  type GenieConversationMessage,
} from "@/lib/dbx/genie";
import { getRunById } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";

export interface TestResult {
  question: string;
  status: GenieConversationMessage["status"];
  sql?: string;
  textResponse?: string;
  error?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; domain: string }> }
) {
  try {
    const { runId, domain } = await params;
    const decodedDomain = decodeURIComponent(domain);

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      spaceId: string;
      questions: string[];
    };

    if (!body.spaceId || !body.questions?.length) {
      return NextResponse.json(
        { error: "Missing required fields: spaceId, questions" },
        { status: 400 }
      );
    }

    const questions = body.questions.slice(0, 10);

    logger.info("Testing Genie Space", {
      runId,
      domain: decodedDomain,
      spaceId: body.spaceId,
      questionCount: questions.length,
    });

    const results: TestResult[] = [];

    for (const question of questions) {
      try {
        const msg = await startConversation(body.spaceId, question, 90_000);
        results.push({
          question,
          status: msg.status,
          sql: msg.sql,
          textResponse: msg.textResponse,
          error: msg.error,
        });
      } catch (err) {
        results.push({
          question,
          status: "FAILED",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const passed = results.filter((r) => r.status === "COMPLETED").length;

    logger.info("Genie Space test complete", {
      runId,
      domain: decodedDomain,
      passed,
      total: results.length,
    });

    return NextResponse.json({
      spaceId: body.spaceId,
      domain: decodedDomain,
      results,
      summary: { passed, total: results.length },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Genie Space test failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

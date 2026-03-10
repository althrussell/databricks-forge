/**
 * POST /api/business-value/value-capture -- record actual value delivered
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createValueCapture } from "@/lib/lakebase/value-captures";
import type { ValueType } from "@/lib/domain/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { runId, useCaseId, valueType, amount, currency, evidence, capturedBy } = body as {
      runId: string;
      useCaseId: string;
      valueType: ValueType;
      amount: number;
      currency?: string;
      evidence?: string;
      capturedBy?: string;
    };

    if (!runId || !useCaseId || !valueType || amount == null) {
      return NextResponse.json(
        { error: "runId, useCaseId, valueType, and amount are required" },
        { status: 400 },
      );
    }

    const entry = await createValueCapture({
      runId,
      useCaseId,
      captureDate: new Date(),
      valueType,
      amount,
      currency,
      evidence,
      capturedBy,
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    logger.error("[api/business-value/value-capture] POST failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to record value" }, { status: 500 });
  }
}

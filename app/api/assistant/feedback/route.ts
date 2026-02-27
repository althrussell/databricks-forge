/**
 * POST /api/assistant/feedback -- Submit feedback on an assistant response.
 *
 * Updates the ForgeAssistantLog entry with thumbs up/down and optional text.
 */

import { NextRequest } from "next/server";
import { updateAssistantLog } from "@/lib/lakebase/assistant-log";
import { logger } from "@/lib/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const logId = body.logId as string;
    const rating = body.rating as "up" | "down";
    const text = body.text as string | undefined;

    if (!logId || !rating || !["up", "down"].includes(rating)) {
      return Response.json(
        { error: "logId and rating (up/down) are required" },
        { status: 400 },
      );
    }

    await updateAssistantLog(logId, {
      feedbackRating: rating,
      feedbackText: text ?? undefined,
    });

    return Response.json({ success: true });
  } catch (err) {
    logger.error("[api/assistant/feedback] Error", { error: String(err) });
    return Response.json(
      { error: "Failed to submit feedback" },
      { status: 500 },
    );
  }
}

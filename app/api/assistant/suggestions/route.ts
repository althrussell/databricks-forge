/**
 * GET /api/assistant/suggestions?persona=business|tech
 *
 * Returns dynamic suggested questions for the Ask Forge empty state,
 * derived from the latest pipeline run, industry outcome map, and
 * environment scan data. Persona controls question style.
 */

import { type NextRequest } from "next/server";
import { buildSuggestedQuestions } from "@/lib/assistant/suggested-questions";
import type { AssistantPersona } from "@/lib/assistant/prompts";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const persona = (req.nextUrl.searchParams.get("persona") === "tech" ? "tech" : "business") as AssistantPersona;
  const questions = await buildSuggestedQuestions(persona);
  return Response.json({ questions });
}

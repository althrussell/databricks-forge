/**
 * GET /api/assistant/suggestions
 *
 * Returns dynamic suggested questions for the Ask Forge empty state,
 * derived from the latest pipeline run, industry outcome map, and
 * environment scan data.
 */

import { buildSuggestedQuestions } from "@/lib/assistant/suggested-questions";

export const runtime = "nodejs";

export async function GET() {
  const questions = await buildSuggestedQuestions();
  return Response.json({ questions });
}

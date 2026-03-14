/**
 * Pass 3.25: Industry Classification
 *
 * Conditional pass -- only runs when industryId was not pre-selected.
 * Matches against existing outcome map registry or proposes a new industry.
 */

import { parseLLMJson } from "@/lib/toolkit/parse-llm-json";
import { resolveResearchEndpoint } from "../resolve-endpoint";
import type { LLMClient } from "@/lib/ports/llm-client";
import type { Logger } from "@/lib/ports/logger";
import type { IndustryClassification } from "../types";
import { INDUSTRY_CLASSIFICATION_PROMPT } from "../prompts";

export async function runIndustryClassification(
  sourceText: string,
  existingIndustries: Array<{ id: string; name: string }>,
  opts: {
    llm: LLMClient;
    logger: Logger;
    signal?: AbortSignal;
  },
): Promise<IndustryClassification> {
  const { llm, logger: log, signal } = opts;

  const industriesList = existingIndustries
    .map((i) => `- ${i.id}: ${i.name}`)
    .join("\n");

  const prompt = INDUSTRY_CLASSIFICATION_PROMPT
    .replace("{existing_industries}", industriesList)
    .replace("{source_text}", sourceText.slice(0, 10_000));

  const endpoint = resolveResearchEndpoint();

  const response = await llm.chat({
    endpoint,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.1,
    maxTokens: 512,
    responseFormat: "json_object",
    signal,
  });

  const parsed = parseLLMJson(response.content, "industry-classification") as IndustryClassification & { reasoning?: string };

  log.info("Industry classified", {
    industryId: parsed.industryId,
    industryName: parsed.industryName,
    confidence: parsed.confidence,
    isNew: parsed.isNew,
  });

  return {
    industryId: parsed.industryId,
    industryName: parsed.industryName,
    confidence: parsed.confidence ?? 0.8,
    isNew: parsed.isNew ?? false,
  };
}

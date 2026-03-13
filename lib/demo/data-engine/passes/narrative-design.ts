/**
 * Data Engine Pass 0: Narrative Design
 *
 * Designs 3-5 data stories scoped to the division/function that will
 * be embedded as patterns in the generated tables.
 */

import { parseLLMJson } from "@/lib/toolkit/parse-llm-json";
import { resolveEndpoint } from "@/lib/dbx/client";
import type { LLMClient } from "@/lib/ports/llm-client";
import type { Logger } from "@/lib/ports/logger";
import type { DataNarrative } from "../../types";
import type { ResearchEngineResult } from "../../research-engine/types";
import { NARRATIVE_DESIGN_PROMPT } from "../prompts";

interface NarrativeDesignOutput {
  narratives: Array<
    DataNarrative & {
      temporalRange?: { startOffset: number; endOffset: number };
      magnitudeDescription?: string;
    }
  >;
  globalSettings: {
    dateRangeMonths: number;
    primaryCurrency: string;
    primaryTimezone: string;
    geographicFocus: string[];
  };
}

export async function runNarrativeDesign(
  research: ResearchEngineResult,
  targetRowCount: { min: number; max: number },
  opts: {
    llm: LLMClient;
    logger: Logger;
    signal?: AbortSignal;
  },
): Promise<NarrativeDesignOutput> {
  const { llm, logger: log, signal } = opts;

  const researchSummary = JSON.stringify({
    companyProfile: research.companyProfile,
    matchedAssets: research.matchedDataAssetIds,
    nomenclature: research.nomenclature,
  }).slice(0, 8_000);

  const existingNarratives = research.dataNarratives.length > 0
    ? JSON.stringify(research.dataNarratives)
    : "None from research -- generate fresh narratives.";

  const prompt = NARRATIVE_DESIGN_PROMPT
    .replace("{customer_name}", research.customerName)
    .replace("{industry_name}", research.industryId)
    .replace("{research_summary}", researchSummary)
    .replace("{existing_narratives}", existingNarratives)
    .replace("{division}", research.scope?.division ?? "Full Enterprise")
    .replace("{min_rows}", String(targetRowCount.min))
    .replace("{max_rows}", String(targetRowCount.max))
    .replace("{nomenclature}", JSON.stringify(research.nomenclature));

  const endpoint = resolveEndpoint("reasoning");

  const response = await llm.chat({
    endpoint,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    maxTokens: 16_384,
    responseFormat: "json_object",
    signal,
  });

  const result = parseLLMJson(response.content, "narrative-design") as NarrativeDesignOutput;

  log.info("Narrative design complete", {
    narratives: result.narratives?.length ?? 0,
  });

  return result;
}

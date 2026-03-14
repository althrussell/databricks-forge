/**
 * Pass 3.5: Outcome Map Generation
 *
 * Conditional pass -- generates a complete IndustryOutcome + enrichment
 * when the selected industry has no outcome map or no Master Repository
 * enrichment. Persists via the existing custom outcome map infrastructure.
 */

import { parseLLMJson } from "@/lib/toolkit/parse-llm-json";
import { resolveResearchEndpoint } from "../resolve-endpoint";
import { createOutcomeMap, setCustomEnrichment } from "@/lib/lakebase/outcome-maps";
import type { TaskTier } from "@/lib/dbx/model-registry";
import type { LLMClient } from "@/lib/ports/llm-client";
import type { Logger } from "@/lib/ports/logger";
import type { IndustryOutcome } from "@/lib/domain/industry-outcomes";
import type { MasterRepoEnrichment } from "@/lib/domain/industry-outcomes/master-repo-types";
import { OUTCOME_MAP_GENERATION_PROMPT, ENRICHMENT_ONLY_GENERATION_PROMPT } from "../prompts";

interface GenerationResult {
  outcomeMap: IndustryOutcome;
  enrichment: MasterRepoEnrichment;
}

const FEW_SHOT_EXAMPLE = `{
  "outcomeMap": {
    "id": "banking",
    "name": "Banking & Payments",
    "subVerticals": ["Retail Banking", "Commercial Banking", "Wealth Management"],
    "objectives": [{
      "name": "Hyper-Personalised Customer Experiences",
      "whyChange": "Customers expect Netflix-level personalisation...",
      "priorities": [{
        "name": "Next-Best-Action Engines",
        "useCases": [{ "name": "Real-Time Offer Optimisation", "description": "..." }],
        "kpis": ["Conversion rate", "Revenue per customer"],
        "personas": ["Chief Marketing Officer", "Head of Digital"]
      }]
    }],
    "suggestedDomains": ["Customer Analytics", "Risk Management"],
    "suggestedPriorities": ["Customer experience", "Risk reduction"]
  },
  "enrichment": {
    "dataAssets": [{ "id": "A01", "name": "Core Banking System", "description": "...", "systemLocation": "Temenos T24 / Finacle", "assetFamily": "Core Banking", "easeOfAccess": "Medium", "lakeflowConnect": "High", "ucFederation": "High", "lakebridgeMigrate": "Low" }],
    "useCases": [{ "name": "Real-Time Fraud Detection", "description": "...", "rationale": "...", "modelType": "Streaming ML", "kpiTarget": "Fraud loss < 0.05%", "benchmarkImpact": "+40-60% detection rate", "strategicImperative": "Risk & Compliance", "strategicPillar": "Operational Excellence", "dataAssetIds": ["A01", "A03"], "dataAssetCriticality": { "A01": "MC", "A03": "VA" } }]
  }
}`;

export async function runOutcomeMapGeneration(
  industryId: string,
  industryName: string,
  sourceContext: string,
  opts: {
    llm: LLMClient;
    logger: Logger;
    signal?: AbortSignal;
    modelTier?: TaskTier;
  },
): Promise<{ outcomeMap: IndustryOutcome; enrichment: MasterRepoEnrichment }> {
  const { llm, logger: log, signal, modelTier } = opts;

  const prompt = OUTCOME_MAP_GENERATION_PROMPT
    .replace(/{industry_name}/g, industryName)
    .replace("{few_shot_example}", FEW_SHOT_EXAMPLE)
    .replace("{source_context}", sourceContext.slice(0, 20_000) || "(No source material available)");

  const endpoint = resolveResearchEndpoint(modelTier);

  log.info("Generating outcome map", { industryId, industryName });

  const response = await llm.chat({
    endpoint,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    maxTokens: 32_000,
    responseFormat: "json_object",
    signal,
  });

  const result = parseLLMJson(response.content, "outcome-map-generation") as GenerationResult;

  // Ensure the outcome map has the correct id
  result.outcomeMap.id = industryId;
  result.outcomeMap.name = industryName;

  // Persist the outcome map
  try {
    await createOutcomeMap({
      industryId,
      name: industryName,
      rawMarkdown: `# ${industryName}\n\nAI-generated outcome map.`,
      parsedOutcome: result.outcomeMap,
      createdBy: "demo-wizard",
    });

    await setCustomEnrichment(industryId, result.enrichment);

    log.info("Outcome map persisted", {
      industryId,
      objectives: result.outcomeMap.objectives.length,
      dataAssets: result.enrichment.dataAssets.length,
      useCases: result.enrichment.useCases.length,
    });
  } catch (err) {
    // 409 = already exists, which is fine (another concurrent run created it)
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      log.info("Outcome map already exists, reusing", { industryId });
    } else {
      log.warn("Failed to persist outcome map (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

/**
 * Generate enrichment only when the outcome map exists but has no
 * Master Repository enrichment. Uses the `generation` tier (faster).
 */
export async function runEnrichmentOnlyGeneration(
  industryId: string,
  industryName: string,
  existingOutcome: IndustryOutcome,
  sourceContext: string,
  opts: {
    llm: LLMClient;
    logger: Logger;
    signal?: AbortSignal;
    modelTier?: TaskTier;
  },
): Promise<MasterRepoEnrichment> {
  const { llm, logger: log, signal, modelTier } = opts;

  const prompt = ENRICHMENT_ONLY_GENERATION_PROMPT
    .replace(/{industry_name}/g, industryName)
    .replace("{outcome_map_json}", JSON.stringify(existingOutcome, null, 2).slice(0, 15_000))
    .replace("{source_context}", sourceContext.slice(0, 15_000) || "(No source material available)");

  // Enrichment-only is a lighter pass; prefer generation tier even if
  // the budget specifies reasoning, unless nothing faster is available.
  const endpoint = resolveResearchEndpoint(modelTier === "reasoning" ? "generation" : modelTier);

  log.info("Generating enrichment only", { industryId, industryName });

  const response = await llm.chat({
    endpoint,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    maxTokens: 32_000,
    responseFormat: "json_object",
    signal,
  });

  const enrichment = parseLLMJson(response.content, "enrichment-only-generation") as MasterRepoEnrichment;

  try {
    await setCustomEnrichment(industryId, enrichment);
    log.info("Enrichment persisted", {
      industryId,
      dataAssets: enrichment.dataAssets?.length ?? 0,
      useCases: enrichment.useCases?.length ?? 0,
    });
  } catch (err) {
    log.warn("Failed to persist enrichment (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return enrichment;
}

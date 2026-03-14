/**
 * Pass 5B: Combined Strategy & Narrative (Balanced preset only)
 *
 * Merges Passes 5-7 into a single reasoning call that produces
 * strategic profile + data asset selection + demo narratives.
 */

import { parseLLMJson } from "@/lib/toolkit/parse-llm-json";
import { resolveResearchEndpoint } from "../resolve-endpoint";
import type { LLMClient } from "@/lib/ports/llm-client";
import type { Logger } from "@/lib/ports/logger";
import type { DemoScope } from "../../types";
import type {
  CompanyStrategicProfile,
  DataStrategyMap,
  DemoNarrativeDesign,
  IndustryLandscapeAnalysis,
} from "../types";
import { STRATEGY_AND_NARRATIVE_PROMPT } from "../prompts";

interface CombinedOutput {
  companyProfile: CompanyStrategicProfile;
  dataStrategy: Omit<DataStrategyMap, "dataMaturityEvidence">;
  demoNarrative: Partial<DemoNarrativeDesign>;
}

export async function runStrategyAndNarrative(
  customerName: string,
  industryName: string,
  industryLandscape: IndustryLandscapeAnalysis,
  dataAssetsContext: string,
  sourceText: string,
  scope: DemoScope | undefined,
  opts: {
    llm: LLMClient;
    logger: Logger;
    signal?: AbortSignal;
    maxTokens: number;
  },
): Promise<{
  companyProfile: CompanyStrategicProfile;
  dataStrategy: DataStrategyMap;
  demoNarrative: DemoNarrativeDesign;
}> {
  const { llm, logger: log, signal, maxTokens } = opts;

  const scopeContext = scope
    ? `Division: ${scope.division ?? "Full Enterprise"}\nFunctional Focus: ${scope.functionalFocus?.join(", ") ?? "All"}\nObjective: ${scope.demoObjective ?? "General demo"}`
    : "Full Enterprise scope.";

  const prompt = STRATEGY_AND_NARRATIVE_PROMPT
    .replace("{customer_name}", customerName)
    .replace("{industry_name}", industryName)
    .replace("{scope_context}", scopeContext)
    .replace("{industry_landscape_json}", JSON.stringify(industryLandscape).slice(0, 6_000))
    .replace("{data_assets_context}", dataAssetsContext.slice(0, 6_000))
    .replace("{source_text}", sourceText.slice(0, 10_000));

  const endpoint = resolveResearchEndpoint();

  const response = await llm.chat({
    endpoint,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    maxTokens,
    responseFormat: "json_object",
    signal,
  });

  const output = parseLLMJson(response.content, "strategy-and-narrative") as CombinedOutput;

  log.info("Strategy & narrative complete", {
    assets: output.dataStrategy?.matchedDataAssetIds?.length ?? 0,
    moments: output.demoNarrative?.killerMoments?.length ?? 0,
  });

  const dataStrategy: DataStrategyMap = {
    matchedDataAssetIds: output.dataStrategy?.matchedDataAssetIds ?? [],
    assetDetails: output.dataStrategy?.assetDetails ?? [],
    nomenclature: output.dataStrategy?.nomenclature ?? {},
    dataMaturityAssessment: output.dataStrategy?.dataMaturityAssessment ?? "data-transforming",
    dataMaturityEvidence: "",
    prioritisedUseCases: output.dataStrategy?.prioritisedUseCases ?? [],
  };

  const demoNarrative: DemoNarrativeDesign = {
    killerMoments: output.demoNarrative?.killerMoments ?? [],
    demoFlow: output.demoNarrative?.demoFlow ?? [],
    executiveTalkingPoints: output.demoNarrative?.executiveTalkingPoints ?? [],
    competitorAngles: output.demoNarrative?.competitorAngles ?? [],
    recommendedTableOrder: output.demoNarrative?.recommendedTableOrder ?? [],
    dataNarratives: output.demoNarrative?.dataNarratives ?? [],
  };

  return {
    companyProfile: output.companyProfile,
    dataStrategy,
    demoNarrative,
  };
}

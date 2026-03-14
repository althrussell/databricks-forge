/**
 * Pass 5: Company Strategic Deep-Dive (Full preset only)
 *
 * Strategy Consultant persona. Goes deep on the specific company
 * using the industry landscape as context.
 */

import { parseLLMJson } from "@/lib/toolkit/parse-llm-json";
import { resolveResearchEndpoint } from "../resolve-endpoint";
import type { LLMClient } from "@/lib/ports/llm-client";
import type { Logger } from "@/lib/ports/logger";
import type { DemoScope } from "../../types";
import type { CompanyStrategicProfile, IndustryLandscapeAnalysis } from "../types";
import { COMPANY_DEEP_DIVE_PROMPT } from "../prompts";

export async function runCompanyDeepDive(
  customerName: string,
  industryName: string,
  industryLandscape: IndustryLandscapeAnalysis,
  sourceText: string,
  scope: DemoScope | undefined,
  opts: {
    llm: LLMClient;
    logger: Logger;
    signal?: AbortSignal;
    maxTokens: number;
  },
): Promise<CompanyStrategicProfile> {
  const { llm, logger: log, signal, maxTokens } = opts;

  const division = scope?.division ?? "the company";
  const scopeContext = scope
    ? `Division: ${scope.division ?? "Full Enterprise"}\nFunctional Focus: ${scope.functionalFocus?.join(", ") ?? "All"}\nObjective: ${scope.demoObjective ?? "General demo"}`
    : "Full Enterprise scope.";

  const prompt = COMPANY_DEEP_DIVE_PROMPT
    .replace("{customer_name}", customerName)
    .replace("{industry_name}", industryName)
    .replace("{division}", division)
    .replace("{scope_context}", scopeContext)
    .replace("{industry_landscape_json}", JSON.stringify(industryLandscape).slice(0, 8_000))
    .replace("{source_text}", sourceText.slice(0, 12_000));

  const endpoint = resolveResearchEndpoint();

  const response = await llm.chat({
    endpoint,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.3,
    maxTokens,
    responseFormat: "json_object",
    signal,
  });

  const result = parseLLMJson(response.content, "company-deep-dive") as CompanyStrategicProfile;

  log.info("Company deep-dive complete", {
    statedPriorities: result.statedPriorities?.length ?? 0,
    strategicGaps: result.strategicGaps?.length ?? 0,
    suggestedDivisions: result.suggestedDivisions?.length ?? 0,
  });

  return result;
}

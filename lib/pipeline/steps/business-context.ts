/**
 * Pipeline Step 1: Business Context Generation
 *
 * Calls ai_query to generate a structured business context from the
 * organisation name and user-supplied configuration.
 */

import { executeAIQuery, parseJSONResponse } from "@/lib/ai/agent";
import type { BusinessContext, PipelineContext } from "@/lib/domain/types";

const DEFAULT_CONTEXT: BusinessContext = {
  industries: "General",
  strategicGoals: "Improve operational efficiency and drive growth",
  businessPriorities: "Increase Revenue",
  strategicInitiative: "Data-driven decision making",
  valueChain: "Standard business operations",
  revenueModel: "Standard revenue model",
  additionalContext: "",
};

export async function runBusinessContext(
  ctx: PipelineContext
): Promise<BusinessContext> {
  const { config } = ctx.run;

  try {
    const result = await executeAIQuery({
      promptKey: "BUSINESS_CONTEXT_WORKER_PROMPT",
      variables: {
        industry: config.businessDomains || config.businessName,
        name: config.businessName,
        type_description: "Full business context research",
        type_label: "business organisation",
      },
      modelEndpoint: config.aiModel,
      maxTokens: 4096,
    });

    const parsed = parseJSONResponse<Record<string, unknown>>(
      result.rawResponse
    );

    const context: BusinessContext = {
      industries: String(parsed.industries ?? DEFAULT_CONTEXT.industries),
      strategicGoals: String(
        parsed.strategic_goals ?? DEFAULT_CONTEXT.strategicGoals
      ),
      businessPriorities: String(
        parsed.business_priorities ?? config.businessPriorities.join(", ")
      ),
      strategicInitiative: String(
        parsed.strategic_initiative ?? DEFAULT_CONTEXT.strategicInitiative
      ),
      valueChain: String(parsed.value_chain ?? DEFAULT_CONTEXT.valueChain),
      revenueModel: String(
        parsed.revenue_model ?? DEFAULT_CONTEXT.revenueModel
      ),
      additionalContext: String(parsed.additional_context ?? ""),
    };

    // Merge user overrides
    if (config.strategicGoals) {
      context.strategicGoals = config.strategicGoals;
    }
    if (config.businessDomains) {
      context.industries = config.businessDomains;
    }

    return context;
  } catch (error) {
    console.error("[business-context] ai_query failed, using defaults:", error);
    return {
      ...DEFAULT_CONTEXT,
      businessPriorities: config.businessPriorities.join(", "),
      strategicGoals:
        config.strategicGoals || DEFAULT_CONTEXT.strategicGoals,
    };
  }
}

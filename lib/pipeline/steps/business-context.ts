/**
 * Pipeline Step 1: Business Context Generation
 *
 * Calls Model Serving to generate a structured business context from the
 * organisation name and user-supplied configuration.
 */

import { executeAIQuery, parseJSONResponse } from "@/lib/ai/agent";
import { getFastServingEndpoint } from "@/lib/dbx/client";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { buildIndustryContextPrompt } from "@/lib/domain/industry-outcomes-server";
import { logger } from "@/lib/logger";
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

/**
 * Safely convert any value to a human-readable string.
 *
 * The LLM may return strings, arrays, or nested objects for business context
 * fields. `String()` on an object produces "[object Object]", so we need to
 * handle arrays and objects explicitly.
 */
function toReadableString(value: unknown, fallback: string): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);

  // Array of primitives or objects
  if (Array.isArray(value)) {
    const items = value.map((item) => {
      if (typeof item === "string") return item;
      if (typeof item === "object" && item !== null) {
        // Object with a "name", "goal", "title", "description", or "label" key
        const obj = item as Record<string, unknown>;
        const label =
          obj.name ?? obj.goal ?? obj.title ?? obj.label ?? obj.description;
        if (typeof label === "string") return label;
        // Fallback: join all values
        return Object.values(obj)
          .filter((v) => typeof v === "string" || typeof v === "number")
          .join(" – ");
      }
      return String(item);
    });
    return items.filter(Boolean).join("; ") || fallback;
  }

  // Plain object -- try common shapes, then join values
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const desc = obj.description ?? obj.summary ?? obj.text ?? obj.name;
    if (typeof desc === "string") return desc;
    // Join all string/number values
    const parts = Object.entries(obj)
      .filter(([, v]) => typeof v === "string" || typeof v === "number")
      .map(([k, v]) => `${k}: ${v}`);
    return parts.join("; ") || fallback;
  }

  return fallback;
}

export async function runBusinessContext(
  ctx: PipelineContext,
  runId?: string
): Promise<BusinessContext> {
  const { config } = ctx.run;

  try {
    if (runId) await updateRunMessage(runId, `Researching business context for ${config.businessName}...`);
    // Inject industry context from outcome maps when an industry is selected
    const industryContext = config.industry
      ? await buildIndustryContextPrompt(config.industry)
      : "";

    const result = await executeAIQuery({
      promptKey: "BUSINESS_CONTEXT_WORKER_PROMPT",
      variables: {
        industry: config.businessDomains || config.businessName,
        name: config.businessName,
        type_description: "Full business context research",
        type_label: "business organisation",
        industry_context: industryContext,
      },
      modelEndpoint: getFastServingEndpoint(),
      responseFormat: "json_object",
      runId,
      step: "business-context",
    });

    let parsed: Record<string, unknown>;
    try {
      parsed = parseJSONResponse<Record<string, unknown>>(result.rawResponse);
    } catch (parseErr) {
      logger.warn("Failed to parse business context JSON, using defaults", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return {
        ...DEFAULT_CONTEXT,
        businessPriorities: config.businessPriorities.join(", "),
        strategicGoals: config.strategicGoals || DEFAULT_CONTEXT.strategicGoals,
      };
    }

    const context: BusinessContext = {
      industries: toReadableString(parsed.industries, DEFAULT_CONTEXT.industries),
      strategicGoals: toReadableString(
        parsed.strategic_goals,
        DEFAULT_CONTEXT.strategicGoals
      ),
      businessPriorities: toReadableString(
        parsed.business_priorities,
        config.businessPriorities.join(", ")
      ),
      strategicInitiative: toReadableString(
        parsed.strategic_initiative,
        DEFAULT_CONTEXT.strategicInitiative
      ),
      valueChain: toReadableString(parsed.value_chain, DEFAULT_CONTEXT.valueChain),
      revenueModel: toReadableString(
        parsed.revenue_model,
        DEFAULT_CONTEXT.revenueModel
      ),
      additionalContext: toReadableString(parsed.additional_context, ""),
    };

    if (runId) await updateRunMessage(runId, `Business context generated: ${context.industries}`);

    // Merge user overrides
    if (config.strategicGoals) {
      context.strategicGoals = config.strategicGoals;
    }
    if (config.businessDomains) {
      context.industries = config.businessDomains;
    }

    return context;
  } catch (error) {
    logger.error("Business context LLM call failed, using defaults", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...DEFAULT_CONTEXT,
      businessPriorities: config.businessPriorities.join(", "),
      strategicGoals:
        config.strategicGoals || DEFAULT_CONTEXT.strategicGoals,
    };
  }
}

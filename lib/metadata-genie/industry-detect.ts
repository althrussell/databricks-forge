/**
 * Industry detection for the Meta Data Genie.
 *
 * Uses a single fast LLM call to detect industry from table/schema names,
 * then maps the result to a canonical outcome map ID via the same
 * `detectIndustryFromContext()` function used by the main pipeline.
 */

import { executeAIQuery } from "@/lib/ai/agent";
import { getFastServingEndpoint } from "@/lib/dbx/client";
import {
  detectIndustryFromContext,
  getIndustryOutcomeAsync,
} from "@/lib/domain/industry-outcomes-server";
import { logger } from "@/lib/logger";
import type {
  IndustryDetectionOutput,
  IndustryDetectionResult,
} from "./types";

const FALLBACK_DETECTION: IndustryDetectionResult = {
  industries: "",
  domains: [],
  duplication_notes: [],
};

/**
 * Detect the industry and business domains from a list of table FQNs.
 *
 * 1. Summarises table names into a compact string for the LLM
 * 2. Calls METADATA_GENIE_INDUSTRY_DETECT_PROMPT (fast model)
 * 3. Maps the LLM's `industries` string to a canonical outcome map ID
 *    via `detectIndustryFromContext()`
 */
export async function detectIndustry(
  tableNames: string[]
): Promise<IndustryDetectionOutput> {
  const summary = buildTableNameSummary(tableNames);

  let llmDetection: IndustryDetectionResult;
  try {
    const result = await executeAIQuery({
      promptKey: "METADATA_GENIE_INDUSTRY_DETECT_PROMPT",
      variables: { table_names: summary },
      modelEndpoint: getFastServingEndpoint(),
      responseFormat: "json_object",
    });

    const parsed = JSON.parse(result.rawResponse);
    llmDetection = {
      industries: parsed.industries ?? "",
      domains: Array.isArray(parsed.domains) ? parsed.domains : [],
      duplication_notes: Array.isArray(parsed.duplication_notes)
        ? parsed.duplication_notes
        : [],
    };
  } catch (err) {
    logger.warn("Industry detection LLM call failed, using fallback", {
      error: err instanceof Error ? err.message : String(err),
    });
    llmDetection = FALLBACK_DETECTION;
  }

  let outcomeMapId: string | null = null;
  let outcomeMap = null;

  if (llmDetection.industries) {
    try {
      outcomeMapId = await detectIndustryFromContext(llmDetection.industries);
      if (outcomeMapId) {
        outcomeMap = (await getIndustryOutcomeAsync(outcomeMapId)) ?? null;
      }
    } catch (err) {
      logger.warn("Outcome map matching failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Metadata Genie industry detection complete", {
    industries: llmDetection.industries,
    outcomeMapId,
    domainCount: llmDetection.domains.length,
  });

  return { outcomeMap, outcomeMapId, llmDetection };
}

/**
 * Build a compact summary of table names suitable for the LLM prompt.
 * Groups by catalog.schema and truncates to avoid exceeding token limits.
 */
function buildTableNameSummary(tableNames: string[]): string {
  const grouped = new Map<string, string[]>();

  for (const fqn of tableNames) {
    const parts = fqn.split(".");
    if (parts.length !== 3) continue;
    const key = `${parts[0]}.${parts[1]}`;
    const existing = grouped.get(key) ?? [];
    existing.push(parts[2]);
    grouped.set(key, existing);
  }

  const lines: string[] = [];
  for (const [schema, tables] of grouped.entries()) {
    lines.push(`${schema}: ${tables.join(", ")}`);
  }

  const summary = lines.join("\n");
  if (summary.length > 8000) {
    return summary.slice(0, 8000) + "\n... (truncated)";
  }
  return summary;
}

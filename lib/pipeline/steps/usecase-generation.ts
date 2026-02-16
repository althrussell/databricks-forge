/**
 * Pipeline Step 4: Use Case Generation
 *
 * Generates AI and statistical use cases in parallel batches using ai_query.
 * Each batch processes a subset of tables.
 */

import { executeAIQuery, parseCSVResponse } from "@/lib/ai/agent";
import {
  generateAIFunctionsSummary,
  generateStatisticalFunctionsSummary,
} from "@/lib/ai/functions";
import { buildSchemaMarkdown, buildForeignKeyMarkdown } from "@/lib/queries/metadata";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";
import type { PipelineContext, UseCase, UseCaseType } from "@/lib/domain/types";
import { v4 as uuidv4 } from "uuid";

const MAX_TABLES_PER_BATCH = 20;
const MAX_CONCURRENT_BATCHES = 3;

/**
 * CSV columns: No, Name, type, Analytics Technique, Statement, Solution,
 * Business Value, Beneficiary, Sponsor, Tables Involved, Technical Design
 */
const CSV_COLUMNS = 11;

export async function runUsecaseGeneration(
  ctx: PipelineContext,
  runId?: string
): Promise<UseCase[]> {
  const { run, metadata, filteredTables } = ctx;
  if (!metadata) throw new Error("Metadata not available");
  if (!run.businessContext) throw new Error("Business context not available");

  const bc = run.businessContext;

  // Filter metadata to only business-relevant tables
  const tables = metadata.tables.filter((t) => filteredTables.includes(t.fqn));
  const columns = metadata.columns.filter((c) =>
    filteredTables.includes(c.tableFqn)
  );

  // Create batches of tables
  const batches: typeof tables[] = [];
  for (let i = 0; i < tables.length; i += MAX_TABLES_PER_BATCH) {
    batches.push(tables.slice(i, i + MAX_TABLES_PER_BATCH));
  }

  logger.info("Use case generation starting", { tableCount: tables.length, batchCount: batches.length });

  const allUseCases: UseCase[] = [];
  const fkMarkdown = buildForeignKeyMarkdown(metadata.foreignKeys);

  // Build focus areas instruction from config if business domains provided
  const focusAreasInstruction = run.config.businessDomains
    ? `**FOCUS AREAS**: Focus your use cases on these business areas: ${run.config.businessDomains}. At least 60% of generated use cases should directly address these domains.`
    : "";

  // Process batches with controlled concurrency and cross-batch feedback
  let batchGroupIdx = 0;
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    batchGroupIdx++;
    const totalGroups = Math.ceil(batches.length / MAX_CONCURRENT_BATCHES);
    if (runId) await updateRunMessage(runId, `Generating AI & statistical use cases (batch group ${batchGroupIdx} of ${totalGroups})...`);
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);

    // Build cross-batch feedback: list of already-generated use case names
    const previousFeedback = buildPreviousUseCasesFeedback(allUseCases);

    const batchPromises = concurrentBatches.flatMap((batch) => {
      const batchColumns = columns.filter((c) =>
        batch.some((t) => t.fqn === c.tableFqn)
      );
      const schemaMarkdown = buildSchemaMarkdown(batch, batchColumns);

      // Quantity guidance: 8-15 per batch, scaled by table count
      const tableCount = batch.length;
      const targetCount = Math.max(8, Math.min(15, tableCount));

      const baseVars: Record<string, string> = {
        business_context: JSON.stringify(bc),
        strategic_goals: bc.strategicGoals,
        business_priorities: bc.businessPriorities,
        strategic_initiative: bc.strategicInitiative,
        value_chain: bc.valueChain,
        revenue_model: bc.revenueModel,
        additional_context_section: bc.additionalContext || "None provided.",
        focus_areas_instruction: focusAreasInstruction,
        schema_markdown: schemaMarkdown,
        foreign_key_relationships: fkMarkdown,
        previous_use_cases_feedback: previousFeedback,
        target_use_case_count: String(targetCount),
      };

      // Generate both AI and Stats use cases per batch
      return [
        generateBatch(
          "AI_USE_CASE_GEN_PROMPT",
          {
            ...baseVars,
            ai_functions_summary: generateAIFunctionsSummary(),
            statistical_functions_detailed: "",
          },
          "AI",
          run.runId,
          run.config.aiModel
        ),
        generateBatch(
          "STATS_USE_CASE_GEN_PROMPT",
          {
            ...baseVars,
            ai_functions_summary: "",
            statistical_functions_detailed:
              generateStatisticalFunctionsSummary(),
          },
          "Statistical",
          run.runId,
          run.config.aiModel
        ),
      ];
    });

    const results = await Promise.allSettled(batchPromises);
    for (const result of results) {
      if (result.status === "fulfilled") {
        allUseCases.push(...result.value);
      } else {
        logger.warn("Use case generation batch failed", { error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
      }
    }
  }

  // Re-number use cases
  allUseCases.forEach((uc, idx) => {
    uc.useCaseNo = idx + 1;
  });

  if (runId) await updateRunMessage(runId, `Generated ${allUseCases.length} raw use cases from ${tables.length} tables`);

  logger.info("Use case generation complete", { useCaseCount: allUseCases.length });

  return allUseCases;
}

/**
 * Build a feedback string listing previously generated use case names so
 * subsequent batches avoid duplicating them.
 */
function buildPreviousUseCasesFeedback(existing: UseCase[]): string {
  if (existing.length === 0) {
    return "None -- this is the first batch.";
  }

  const names = existing.map((uc) => uc.name).filter(Boolean);
  return (
    `The following ${names.length} use cases have ALREADY been generated. ` +
    `Do NOT generate similar or overlapping use cases:\n` +
    names.map((n) => `- ${n}`).join("\n")
  );
}

async function generateBatch(
  promptKey: "AI_USE_CASE_GEN_PROMPT" | "STATS_USE_CASE_GEN_PROMPT",
  variables: Record<string, string>,
  type: UseCaseType,
  runId: string,
  aiModel: string
): Promise<UseCase[]> {
  const result = await executeAIQuery({
    promptKey,
    variables,
    modelEndpoint: aiModel,
    maxTokens: 8192,
  });

  let rows: string[][];
  try {
    rows = parseCSVResponse(result.rawResponse, CSV_COLUMNS);
  } catch (parseErr) {
    logger.warn("Failed to parse use case generation CSV", {
      promptKey,
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    return [];
  }

  return rows.map((row) => {
    const tablesStr = row[9] ?? "";
    const tablesInvolved = tablesStr
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    return {
      id: uuidv4(),
      runId,
      useCaseNo: parseInt(row[0] ?? "0", 10),
      name: row[1] ?? "",
      type: (row[2]?.trim() as UseCaseType) || type,
      analyticsTechnique: row[3] ?? "",
      statement: row[4] ?? "",
      solution: row[5] ?? "",
      businessValue: row[6] ?? "",
      beneficiary: row[7] ?? "",
      sponsor: row[8] ?? "",
      domain: "", // assigned in Step 5
      subdomain: "", // assigned in Step 5
      tablesInvolved,
      priorityScore: 0, // scored in Step 6
      feasibilityScore: 0,
      impactScore: 0,
      overallScore: 0,
      sqlCode: null,
      sqlStatus: null,
    };
  });
}

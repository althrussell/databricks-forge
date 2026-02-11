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
  ctx: PipelineContext
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

  console.log(
    `[usecase-generation] Processing ${tables.length} tables in ${batches.length} batches`
  );

  const allUseCases: UseCase[] = [];
  const fkMarkdown = buildForeignKeyMarkdown(metadata.foreignKeys);

  // Process batches with controlled concurrency
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);

    const batchPromises = concurrentBatches.flatMap((batch) => {
      const batchColumns = columns.filter((c) =>
        batch.some((t) => t.fqn === c.tableFqn)
      );
      const schemaMarkdown = buildSchemaMarkdown(batch, batchColumns);

      const baseVars: Record<string, string> = {
        business_context: JSON.stringify(bc),
        strategic_goals: bc.strategicGoals,
        business_priorities: bc.businessPriorities,
        strategic_initiative: bc.strategicInitiative,
        value_chain: bc.valueChain,
        revenue_model: bc.revenueModel,
        additional_context_section: bc.additionalContext || "None provided.",
        focus_areas_instruction: "",
        schema_markdown: schemaMarkdown,
        foreign_key_relationships: fkMarkdown,
        previous_use_cases_feedback: "None -- this is the first pass.",
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
        console.warn("[usecase-generation] Batch failed:", result.reason);
      }
    }
  }

  // Re-number use cases
  allUseCases.forEach((uc, idx) => {
    uc.useCaseNo = idx + 1;
  });

  console.log(
    `[usecase-generation] Generated ${allUseCases.length} use cases`
  );

  return allUseCases;
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

  const rows = parseCSVResponse(result.rawResponse, CSV_COLUMNS);

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

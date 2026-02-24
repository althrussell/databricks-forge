/**
 * Pipeline Step 4: Use Case Generation
 *
 * Generates AI and statistical use cases in parallel batches using Model
 * Serving (JSON mode). Each batch processes a subset of tables.
 */

import { executeAIQuery, parseJSONResponse } from "@/lib/ai/agent";
import {
  generateAIFunctionsSummary,
  generateStatisticalFunctionsSummary,
  generateGeospatialFunctionsSummary,
} from "@/lib/ai/functions";
import { buildSchemaMarkdown, buildForeignKeyMarkdown } from "@/lib/queries/metadata";
import { buildReferenceUseCasesPrompt } from "@/lib/domain/industry-outcomes-server";
import { buildTokenAwareBatches, estimateTokens } from "@/lib/ai/token-budget";
import { fetchSampleData } from "@/lib/pipeline/sample-data";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";
import type { PipelineContext, UseCase, UseCaseType, LineageGraph } from "@/lib/domain/types";
import { DEFAULT_DEPTH_CONFIGS } from "@/lib/domain/types";
import { v4 as uuidv4 } from "uuid";

const MAX_CONCURRENT_BATCHES = 2;

/** Shape of each use case object in the JSON array returned by the LLM. */
interface UseCaseItem {
  no?: number;
  name?: string;
  type?: string;
  analytics_technique?: string;
  statement?: string;
  solution?: string;
  business_value?: string;
  beneficiary?: string;
  sponsor?: string;
  tables_involved?: string[] | string;
  technical_design?: string;
}

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

  const sampleRows = run.config.sampleRowsPerTable ?? 0;

  // Build shared context that goes into every prompt (used for base token calc)
  const fkMarkdown = buildForeignKeyMarkdown(metadata.foreignKeys);
  const depth = run.config.discoveryDepth ?? "balanced";
  const dc = run.config.depthConfig ?? DEFAULT_DEPTH_CONFIGS[depth];
  const targetRange = { min: dc.batchTargetMin, max: dc.batchTargetMax };

  const lineageContext = ctx.lineageGraph
    ? buildFilteredLineageSummary(ctx.lineageGraph, filteredTables, 30)
    : "";

  const focusAreasInstruction = run.config.businessDomains
    ? `**FOCUS AREAS**: Focus your use cases on these business areas: ${run.config.businessDomains}. At least 60% of generated use cases should directly address these domains.`
    : "";

  const industryReferenceUseCases = run.config.industry
    ? await buildReferenceUseCasesPrompt(run.config.industry, run.config.businessDomains)
    : "";

  // Load accepted use cases from prior runs as few-shot examples
  let feedbackExamplesSection = "";
  try {
    const { getFeedbackExamples } = await import("@/lib/lakebase/usecases");
    const examples = await getFeedbackExamples(run.config.ucMetadata, 8);
    if (examples.length > 0) {
      feedbackExamplesSection = "\n\n**USER-APPROVED USE CASES FROM PRIOR RUNS** (generate similar quality and style):\n" +
        examples.map((ex, i) => `${i + 1}. "${ex.name}" (${ex.type}) — ${ex.statement}`).join("\n");
    }
  } catch {
    // Non-critical: proceed without feedback examples
  }

  // Estimate base token cost (everything except schema_markdown which varies per batch)
  const sharedContextTokens = estimateTokens(
    JSON.stringify(bc) +
    fkMarkdown +
    lineageContext +
    focusAreasInstruction +
    industryReferenceUseCases +
    generateAIFunctionsSummary() +
    generateGeospatialFunctionsSummary()
  );
  // Add overhead for the prompt template itself (~2000 tokens)
  const baseTokens = sharedContextTokens + 2000;

  // Token-aware batching: renderItem estimates the per-table schema size
  const columnsByTable = new Map<string, typeof columns>();
  for (const col of columns) {
    const existing = columnsByTable.get(col.tableFqn) ?? [];
    existing.push(col);
    columnsByTable.set(col.tableFqn, existing);
  }

  const batches = buildTokenAwareBatches(
    tables,
    (table) => buildSchemaMarkdown([table], columnsByTable.get(table.fqn) ?? []),
    baseTokens
  );

  logger.info("Use case generation starting", {
    tableCount: tables.length,
    batchCount: batches.length,
    sampleRowsPerTable: sampleRows,
  });

  const allUseCases: UseCase[] = [];

  // Process batches with controlled concurrency and cross-batch feedback
  let batchGroupIdx = 0;
  for (let i = 0; i < batches.length; i += MAX_CONCURRENT_BATCHES) {
    batchGroupIdx++;
    const totalGroups = Math.ceil(batches.length / MAX_CONCURRENT_BATCHES);
    const samplingNote = sampleRows > 0 ? ` with ${sampleRows}-row sampling` : "";
    if (runId) await updateRunMessage(runId, `Generating AI & statistical use cases${samplingNote} (batch group ${batchGroupIdx} of ${totalGroups})...`);
    const concurrentBatches = batches.slice(i, i + MAX_CONCURRENT_BATCHES);

    // Build cross-batch feedback: list of already-generated use case names
    const previousFeedback = buildPreviousUseCasesFeedback(allUseCases);

    // Fetch sample data for all tables in this concurrent group (if enabled)
    const concurrentTableFqns = concurrentBatches
      .flat()
      .map((t) => t.fqn);
    let sampleDataSection = "";
    if (sampleRows > 0 && concurrentTableFqns.length > 0) {
      const sampleResult = await fetchSampleData(concurrentTableFqns, sampleRows);
      sampleDataSection = sampleResult.markdown;
      // Accumulate structured sample data for downstream Genie Engine use
      if (sampleResult.structured.size > 0) {
        if (!ctx.sampleData) ctx.sampleData = new Map();
        for (const [fqn, entry] of sampleResult.structured) {
          ctx.sampleData.set(fqn, entry);
        }
      }
      if (sampleResult.tablesSampled > 0) {
        logger.info("Sample data fetched for use case generation batch", {
          batchGroup: batchGroupIdx,
          tablesSampled: sampleResult.tablesSampled,
          tablesSkipped: sampleResult.tablesSkipped,
          totalRows: sampleResult.totalRows,
        });
      }
    }

    const batchPromises = concurrentBatches.flatMap((batch) => {
      const batchColumns = columns.filter((c) =>
        batch.some((t) => t.fqn === c.tableFqn)
      );
      const schemaMarkdown = buildSchemaMarkdown(batch, batchColumns);

      const tableCount = batch.length;
      const targetCount = Math.max(targetRange.min, Math.min(targetRange.max, tableCount));

      const baseVars: Record<string, string> = {
        business_context: JSON.stringify(bc),
        strategic_goals: bc.strategicGoals,
        business_priorities: bc.businessPriorities,
        strategic_initiative: bc.strategicInitiative,
        value_chain: bc.valueChain,
        revenue_model: bc.revenueModel,
        additional_context_section: bc.additionalContext || "None provided.",
        focus_areas_instruction: focusAreasInstruction,
        industry_reference_use_cases: industryReferenceUseCases,
        schema_markdown: schemaMarkdown,
        foreign_key_relationships: fkMarkdown,
        sample_data_section: sampleDataSection,
        previous_use_cases_feedback: previousFeedback + feedbackExamplesSection,
        target_use_case_count: String(targetCount),
        lineage_context: lineageContext,
      };

      // Generate both AI and Stats use cases per batch
      return [
        generateBatch(
          "AI_USE_CASE_GEN_PROMPT",
          {
            ...baseVars,
            ai_functions_summary: generateAIFunctionsSummary(),
            statistical_functions_detailed: "",
            geospatial_functions_summary: generateGeospatialFunctionsSummary(),
          },
          "AI",
          run.runId,
          run.config.aiModel,
          runId
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
          run.config.aiModel,
          runId
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
  useCaseRunId: string,
  aiModel: string,
  logRunId?: string
): Promise<UseCase[]> {
  const result = await executeAIQuery({
    promptKey,
    variables,
    modelEndpoint: aiModel,
    responseFormat: "json_object",
    runId: logRunId,
    step: "usecase-generation",
  });

  let items: UseCaseItem[];
  try {
    const parsed = parseJSONResponse<UseCaseItem[] | { use_cases: UseCaseItem[] }>(result.rawResponse);
    // Handle both direct array and wrapped object responses
    items = Array.isArray(parsed) ? parsed : (parsed.use_cases ?? []);
  } catch (parseErr) {
    logger.warn("Failed to parse use case generation JSON", {
      promptKey,
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    return [];
  }

  return items
    .filter((item) => item.name)
    .map((item) => {
      // tables_involved can be an array (expected) or comma-separated string (fallback)
      let tablesInvolved: string[];
      if (Array.isArray(item.tables_involved)) {
        tablesInvolved = item.tables_involved.map((t) => t.trim()).filter(Boolean);
      } else if (typeof item.tables_involved === "string") {
        tablesInvolved = item.tables_involved.split(",").map((t) => t.trim()).filter(Boolean);
      } else {
        tablesInvolved = [];
      }

      return {
        id: uuidv4(),
        runId: useCaseRunId,
        useCaseNo: item.no ?? 0,
        name: item.name ?? "",
        type: ((item.type?.trim() as UseCaseType) || type),
        analyticsTechnique: item.analytics_technique ?? "",
        statement: item.statement ?? "",
        solution: item.solution ?? "",
        businessValue: item.business_value ?? "",
        beneficiary: item.beneficiary ?? "",
        sponsor: item.sponsor ?? "",
        domain: "", // assigned in Step 5
        subdomain: "", // assigned in Step 5
        tablesInvolved,
        priorityScore: 0, // scored in Step 6
        feasibilityScore: 0,
        impactScore: 0,
        overallScore: 0,
        userPriorityScore: null,
        userFeasibilityScore: null,
        userImpactScore: null,
        userOverallScore: null,
        sqlCode: null,
        sqlStatus: null,
        feedback: null,
        feedbackAt: null,
      };
    });
}

/**
 * Build a lineage summary filtered to business-relevant tables.
 * Only includes edges where at least one endpoint survived table filtering,
 * which naturally excludes bronze/raw staging tables that were classified as technical.
 */
function buildFilteredLineageSummary(
  graph: LineageGraph,
  filteredTables: string[],
  maxEdges: number
): string {
  if (graph.edges.length === 0) return "";

  const filteredSet = new Set(filteredTables);
  const relevant = graph.edges.filter(
    (e) => filteredSet.has(e.sourceTableFqn) || filteredSet.has(e.targetTableFqn)
  );
  if (relevant.length === 0) return "";

  const edges = relevant.slice(0, maxEdges);
  const lines = edges.map((e) =>
    `${e.sourceTableFqn} -> ${e.targetTableFqn}${e.entityType ? ` (via ${e.entityType})` : ""}`
  );
  const header = "**Data Lineage Context** (actual pipeline data flows):";
  const suffix = relevant.length > maxEdges
    ? `\n... and ${relevant.length - maxEdges} more data flow edges`
    : "";
  return `${header}\n${lines.join("\n")}${suffix}`;
}

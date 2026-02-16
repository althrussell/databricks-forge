/**
 * Pipeline Step 3: Table Filtering
 *
 * Classifies tables as business-relevant vs technical using ai_query.
 * Returns a filtered list of FQNs to include in use case generation.
 */

import { executeAIQuery, parseCSVResponse } from "@/lib/ai/agent";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";
import type { PipelineContext, TableInfo } from "@/lib/domain/types";

const BATCH_SIZE = 100; // tables per ai_query call

/**
 * Build a markdown table list for the prompt.
 */
function buildTablesMarkdown(tables: TableInfo[]): string {
  return tables
    .map((t) => {
      const comment = t.comment ? ` -- ${t.comment}` : "";
      return `- ${t.fqn} (${t.tableType})${comment}`;
    })
    .join("\n");
}

export async function runTableFiltering(
  ctx: PipelineContext,
  runId?: string
): Promise<string[]> {
  const { run, metadata } = ctx;
  if (!metadata) throw new Error("Metadata not available for table filtering");
  if (!run.businessContext) throw new Error("Business context not available");

  const tables = metadata.tables;

  // If very few tables, skip filtering -- include all
  if (tables.length <= 5) {
    if (runId) await updateRunMessage(runId, `Skipping filter — only ${tables.length} tables, including all`);
    return tables.map((t) => t.fqn);
  }

  const businessTables: string[] = [];
  const totalBatches = Math.ceil(tables.length / BATCH_SIZE);

  // Process in batches
  for (let i = 0; i < tables.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = tables.slice(i, i + BATCH_SIZE);
    if (runId) await updateRunMessage(runId, `Filtering tables (batch ${batchNum} of ${totalBatches})...`);
    try {
      const filtered = await filterBatch(batch, run.config.businessName, run.businessContext, run.config.aiModel);
      businessTables.push(...filtered);
    } catch (error) {
      // Fail-open: include all tables from failed batch
      logger.warn("Table filtering batch failed, including all tables", {
        batch: batchNum,
        error: error instanceof Error ? error.message : String(error),
      });
      businessTables.push(...batch.map((t) => t.fqn));
    }
  }

  if (runId) await updateRunMessage(runId, `Identified ${businessTables.length} business-relevant tables out of ${tables.length}`);

  logger.info("Table filtering complete", {
    businessTables: businessTables.length,
    totalTables: tables.length,
  });

  return businessTables;
}

async function filterBatch(
  tables: TableInfo[],
  businessName: string,
  businessContext: { industries: string },
  aiModel: string
): Promise<string[]> {
  const result = await executeAIQuery({
    promptKey: "FILTER_BUSINESS_TABLES_PROMPT",
    variables: {
      business_name: businessName,
      industry: businessContext.industries,
      business_context: JSON.stringify(businessContext),
      exclusion_strategy:
        "Exclude only tables that are PURELY technical infrastructure (system logs, audit trails, internal monitoring). When in doubt, classify as business.",
      additional_context_section: "",
      strategy_rules:
        "Default to BUSINESS classification. Only mark as TECHNICAL if the table has zero business relevance.",
      tables_markdown: buildTablesMarkdown(tables),
    },
    modelEndpoint: aiModel,
  });

  let rows: string[][];
  try {
    rows = parseCSVResponse(result.rawResponse, 3);
  } catch (parseErr) {
    logger.warn("Failed to parse table filtering CSV, including all tables", {
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    return tables.map((t) => t.fqn);
  }

  const businessFQNs: string[] = [];

  for (const row of rows) {
    const fqn = row[0]?.trim();
    const classification = row[1]?.trim().toLowerCase();
    if (fqn && classification === "business") {
      businessFQNs.push(fqn);
    }
  }

  // If the model classified nothing as business, include all (fail-open)
  if (businessFQNs.length === 0) {
    return tables.map((t) => t.fqn);
  }

  return businessFQNs;
}

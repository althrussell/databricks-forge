/**
 * Pipeline Step 3: Table Filtering
 *
 * Classifies tables as business-relevant vs technical using ai_query.
 * Returns a filtered list of FQNs to include in use case generation.
 */

import { executeAIQuery, parseCSVResponse } from "@/lib/ai/agent";
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
  ctx: PipelineContext
): Promise<string[]> {
  const { run, metadata } = ctx;
  if (!metadata) throw new Error("Metadata not available for table filtering");
  if (!run.businessContext) throw new Error("Business context not available");

  const tables = metadata.tables;

  // If very few tables, skip filtering -- include all
  if (tables.length <= 5) {
    return tables.map((t) => t.fqn);
  }

  const businessTables: string[] = [];

  // Process in batches
  for (let i = 0; i < tables.length; i += BATCH_SIZE) {
    const batch = tables.slice(i, i + BATCH_SIZE);
    try {
      const filtered = await filterBatch(batch, run.config.businessName, run.businessContext, run.config.aiModel);
      businessTables.push(...filtered);
    } catch (error) {
      // Fail-open: include all tables from failed batch
      console.warn(
        `[table-filtering] Batch ${i / BATCH_SIZE + 1} failed, including all tables:`,
        error
      );
      businessTables.push(...batch.map((t) => t.fqn));
    }
  }

  console.log(
    `[table-filtering] ${businessTables.length}/${tables.length} tables classified as business-relevant`
  );

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
    maxTokens: 4096,
  });

  // CSV: table_fqn, classification, reason
  const rows = parseCSVResponse(result.rawResponse, 3);
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

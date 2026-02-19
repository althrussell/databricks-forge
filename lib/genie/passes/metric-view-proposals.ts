/**
 * Pass 6: Metric View Proposals (LLM)
 *
 * Analyzes domain tables and generated measures to propose metric view
 * YAML definitions. Outputs CREATE VIEW ... WITH METRICS DDL that can
 * be reviewed and deployed by the customer.
 */

import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import type { MetadataSnapshot, UseCase } from "@/lib/domain/types";
import type { MetricViewProposal, EnrichedSqlSnippetMeasure, EnrichedSqlSnippetDimension } from "../types";
import { buildSchemaContextBlock, type SchemaAllowlist } from "../schema-allowlist";

const TEMPERATURE = 0.2;

export interface MetricViewProposalsInput {
  domain: string;
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  useCases: UseCase[];
  measures: EnrichedSqlSnippetMeasure[];
  dimensions: EnrichedSqlSnippetDimension[];
  endpoint: string;
}

export interface MetricViewProposalsOutput {
  proposals: MetricViewProposal[];
}

export async function runMetricViewProposals(
  input: MetricViewProposalsInput
): Promise<MetricViewProposalsOutput> {
  const { domain, tableFqns, metadata, useCases, measures, dimensions, endpoint } = input;

  if (tableFqns.length === 0 || measures.length === 0) {
    return { proposals: [] };
  }

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);

  const measuresBlock = measures
    .slice(0, 15)
    .map((m) => `- ${m.name}: ${m.sql}`)
    .join("\n");

  const dimensionsBlock = dimensions
    .filter((d) => !d.isTimePeriod)
    .slice(0, 10)
    .map((d) => `- ${d.name}: ${d.sql}`)
    .join("\n");

  const timeDimensions = dimensions
    .filter((d) => d.isTimePeriod)
    .slice(0, 5)
    .map((d) => `- ${d.name}: ${d.sql}`)
    .join("\n");

  const systemMessage = `You are a Databricks SQL expert creating metric view definitions.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

Create 1-3 metric view proposals for the "${domain}" domain. Each metric view should:
1. Use one source table (the most central/important one)
2. Define meaningful dimensions from the columns
3. Include time-based dimensions (DATE_TRUNC)
4. Define measures using aggregations (SUM, COUNT, AVG, etc.) with FILTER clauses where appropriate
5. Add clear comments for all components

Output format for each proposal (JSON):
{
  "name": "metric_view_name",
  "description": "What this metric view measures",
  "yaml": "version: 1.1\\ncomment: ...\\nsource: catalog.schema.table\\n...",
  "ddl": "CREATE OR REPLACE VIEW catalog.schema.metric_view_name\\nWITH METRICS\\nLANGUAGE YAML\\nAS $$\\n...\\n$$",
  "sourceTables": ["catalog.schema.table"]
}

Return JSON: { "proposals": [...] }`;

  const userMessage = `${schemaBlock}

### MEASURES ALREADY IDENTIFIED
${measuresBlock || "(none)"}

### DIMENSIONS ALREADY IDENTIFIED
${dimensionsBlock || "(none)"}

### TIME DIMENSIONS
${timeDimensions || "(none)"}

### DOMAIN USE CASES (for context)
${useCases.slice(0, 5).map((uc) => `- ${uc.name}: ${uc.statement}`).join("\n")}

Create metric view proposals for this domain.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  try {
    const result = await chatCompletion({
      endpoint,
      messages,
      temperature: TEMPERATURE,
      responseFormat: "json_object",
    });

    const content = result.content ?? "";
    const parsed = parseLLMJson(content) as Record<string, unknown>;
    const items: Record<string, unknown>[] = Array.isArray(parsed.proposals)
      ? parsed.proposals
      : Array.isArray(parsed) ? parsed : [];

    const proposals: MetricViewProposal[] = items
      .map((p) => ({
        name: String(p.name ?? ""),
        description: String(p.description ?? ""),
        yaml: String(p.yaml ?? ""),
        ddl: String(p.ddl ?? ""),
        sourceTables: Array.isArray(p.sourceTables) ? p.sourceTables.map(String) : [],
      }))
      .filter((p) => p.name.length > 0 && p.ddl.length > 0);

    return { proposals };
  } catch (err) {
    logger.warn("Metric view proposal generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { proposals: [] };
  }
}

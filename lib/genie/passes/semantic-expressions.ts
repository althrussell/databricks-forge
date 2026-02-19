/**
 * Pass 2: Semantic SQL Expressions
 *
 * Phase A: Rule-based auto-generation of standard time-period filters and
 * dimensions from date/timestamp columns with fiscal year support.
 *
 * Phase B: LLM-generated business-semantic measures, filters, and dimensions
 * grounded to the physical schema allowlist.
 */

import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import type { MetadataSnapshot, UseCase, BusinessContext } from "@/lib/domain/types";
import type {
  GenieEngineConfig,
  GlossaryEntry,
  EnrichedSqlSnippetMeasure,
  EnrichedSqlSnippetFilter,
  EnrichedSqlSnippetDimension,
} from "../types";
import { buildSchemaContextBlock, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";
import { generateTimePeriods } from "../time-periods";

const TEMPERATURE = 0.2;

export interface SemanticExpressionsInput {
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  useCases: UseCase[];
  businessContext: BusinessContext | null;
  config: GenieEngineConfig;
  endpoint: string;
}

export interface SemanticExpressionsOutput {
  measures: EnrichedSqlSnippetMeasure[];
  filters: EnrichedSqlSnippetFilter[];
  dimensions: EnrichedSqlSnippetDimension[];
}

export async function runSemanticExpressions(
  input: SemanticExpressionsInput
): Promise<SemanticExpressionsOutput> {
  const { tableFqns, metadata, allowlist, useCases, businessContext, config, endpoint } = input;

  // Phase A: auto-generate time periods
  let timeFilters: EnrichedSqlSnippetFilter[] = [];
  let timeDimensions: EnrichedSqlSnippetDimension[] = [];

  if (config.autoTimePeriods) {
    const tp = generateTimePeriods(metadata.columns, tableFqns, {
      fiscalYearStartMonth: config.fiscalYearStartMonth,
      targetDateColumns: config.timePeriodDateColumns.length > 0
        ? config.timePeriodDateColumns
        : undefined,
    });
    timeFilters = tp.filters;
    timeDimensions = tp.dimensions;
  }

  // Phase B: LLM-generated expressions
  let llmMeasures: EnrichedSqlSnippetMeasure[] = [];
  let llmFilters: EnrichedSqlSnippetFilter[] = [];
  let llmDimensions: EnrichedSqlSnippetDimension[] = [];

  if (config.llmRefinement) {
    try {
      const llmResult = await generateLLMExpressions(
        tableFqns, metadata, useCases, businessContext, config.glossary, endpoint
      );
      llmMeasures = llmResult.measures.filter((m) =>
        validateSqlExpression(allowlist, m.sql, `measure:${m.name}`)
      );
      llmFilters = llmResult.filters.filter((f) =>
        validateSqlExpression(allowlist, f.sql, `filter:${f.name}`)
      );
      llmDimensions = llmResult.dimensions.filter((d) =>
        validateSqlExpression(allowlist, d.sql, `dimension:${d.name}`)
      );
    } catch (err) {
      logger.warn("LLM expression generation failed, using time periods only", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Merge custom expressions from config
  const customMeasures: EnrichedSqlSnippetMeasure[] = config.customMeasures.map((m) => ({
    name: m.name,
    sql: m.sql,
    synonyms: m.synonyms,
    instructions: m.instructions,
  }));
  const customFilters: EnrichedSqlSnippetFilter[] = config.customFilters.map((f) => ({
    name: f.name,
    sql: f.sql,
    synonyms: f.synonyms,
    instructions: f.instructions,
    isTimePeriod: false,
  }));
  const customDimensions: EnrichedSqlSnippetDimension[] = config.customDimensions.map((d) => ({
    name: d.name,
    sql: d.sql,
    synonyms: d.synonyms,
    instructions: d.instructions,
    isTimePeriod: false,
  }));

  return {
    measures: dedup([...llmMeasures, ...customMeasures], (m) => m.name),
    filters: dedup([...timeFilters, ...llmFilters, ...customFilters], (f) => f.name),
    dimensions: dedup([...timeDimensions, ...llmDimensions, ...customDimensions], (d) => d.name),
  };
}

async function generateLLMExpressions(
  tableFqns: string[],
  metadata: MetadataSnapshot,
  useCases: UseCase[],
  businessContext: BusinessContext | null,
  glossary: GlossaryEntry[],
  endpoint: string
): Promise<{ measures: EnrichedSqlSnippetMeasure[]; filters: EnrichedSqlSnippetFilter[]; dimensions: EnrichedSqlSnippetDimension[] }> {
  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);

  const sqlExamples = useCases
    .filter((uc) => uc.sqlCode)
    .slice(0, 10)
    .map((uc) => `-- ${uc.name}\n${uc.sqlCode}`)
    .join("\n\n");

  const glossaryBlock = glossary.length > 0
    ? `### BUSINESS GLOSSARY\n${glossary.map((g) => `- **${g.term}**: ${g.definition} (synonyms: ${g.synonyms.join(", ")})`).join("\n")}`
    : "";

  const bizContext = businessContext
    ? `Industry: ${businessContext.industries}\nPriorities: ${businessContext.businessPriorities}\nGoals: ${businessContext.strategicGoals}`
    : "";

  const systemMessage = `You are a SQL analytics expert building knowledge store expressions for a Databricks Genie space.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

Generate SQL expressions in three categories:
1. **Measures**: Aggregate KPIs (SUM, COUNT, AVG, etc.) with business-friendly names
2. **Filters**: Common WHERE conditions with business-friendly names
3. **Dimensions**: GROUP BY expressions with business-friendly names

For each expression provide:
- name: Business-friendly display name
- sql: Valid Databricks SQL expression using ONLY identifiers from the schema
- synonyms: Array of alternative terms users might say
- instructions: When and how to use this expression

Return JSON: { "measures": [...], "filters": [...], "dimensions": [...] }`;

  const userMessage = `${schemaBlock}

${bizContext ? `### BUSINESS CONTEXT\n${bizContext}\n` : ""}
${glossaryBlock}

### USE CASE SQL EXAMPLES
${sqlExamples || "(no SQL examples available)"}

Generate measures, filters, and dimensions for a Genie space serving this domain.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  const result = await chatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    responseFormat: "json_object",
  });

  const content = result.content ?? "";
  return parseLLMExpressions(content);
}

function parseLLMExpressions(content: string): {
  measures: EnrichedSqlSnippetMeasure[];
  filters: EnrichedSqlSnippetFilter[];
  dimensions: EnrichedSqlSnippetDimension[];
} {
  try {
    const parsed = JSON.parse(content);
    return {
      measures: parseArray(parsed.measures).map((m) => ({
        name: String(m.name ?? ""),
        sql: String(m.sql ?? ""),
        synonyms: Array.isArray(m.synonyms) ? m.synonyms.map(String) : [],
        instructions: String(m.instructions ?? ""),
      })),
      filters: parseArray(parsed.filters).map((f) => ({
        name: String(f.name ?? ""),
        sql: String(f.sql ?? ""),
        synonyms: Array.isArray(f.synonyms) ? f.synonyms.map(String) : [],
        instructions: String(f.instructions ?? ""),
        isTimePeriod: false,
      })),
      dimensions: parseArray(parsed.dimensions).map((d) => ({
        name: String(d.name ?? ""),
        sql: String(d.sql ?? ""),
        synonyms: Array.isArray(d.synonyms) ? d.synonyms.map(String) : [],
        instructions: String(d.instructions ?? ""),
        isTimePeriod: false,
      })),
    };
  } catch (err) {
    logger.warn("Failed to parse LLM expressions", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { measures: [], filters: [], dimensions: [] };
  }
}

function parseArray(val: unknown): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
}

function dedup<T>(items: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

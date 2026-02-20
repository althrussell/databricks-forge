/**
 * Pass 3: Trusted Asset Authoring (LLM, grounded)
 *
 * Converts top SQL examples into parameterized queries (trusted assets)
 * and generates UDF SQL definitions for frequently-asked question patterns.
 * All SQL is validated against the schema allowlist.
 */

import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import type { UseCase, MetadataSnapshot } from "@/lib/domain/types";
import type {
  TrustedAssetQuery,
  TrustedAssetFunction,
  EntityMatchingCandidate,
} from "../types";
import { buildSchemaContextBlock, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";

const TEMPERATURE = 0.2;
const BATCH_SIZE = 3;

export interface TrustedAssetsInput {
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  useCases: UseCase[];
  entityCandidates: EntityMatchingCandidate[];
  endpoint: string;
}

export interface TrustedAssetsOutput {
  queries: TrustedAssetQuery[];
  functions: TrustedAssetFunction[];
}

export async function runTrustedAssetAuthoring(
  input: TrustedAssetsInput
): Promise<TrustedAssetsOutput> {
  const { tableFqns, metadata, allowlist, useCases, entityCandidates, endpoint } = input;

  const topUseCases = useCases
    .filter((uc) => uc.sqlCode && uc.sqlStatus === "generated")
    .slice(0, 8);

  if (topUseCases.length === 0) {
    return { queries: [], functions: [] };
  }

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);
  const entityBlock = buildEntityBlock(entityCandidates);

  const batches: UseCase[][] = [];
  for (let i = 0; i < topUseCases.length; i += BATCH_SIZE) {
    batches.push(topUseCases.slice(i, i + BATCH_SIZE));
  }

  logger.info("Trusted asset authoring: batching use cases", {
    totalUseCases: topUseCases.length,
    batchCount: batches.length,
    batchSize: BATCH_SIZE,
  });

  const allQueries: TrustedAssetQuery[] = [];
  const allFunctions: TrustedAssetFunction[] = [];

  for (const batch of batches) {
    try {
      const result = await processTrustedAssetBatch(
        batch, schemaBlock, entityBlock, allowlist, endpoint
      );
      allQueries.push(...result.queries);
      allFunctions.push(...result.functions);
    } catch (err) {
      logger.warn("Trusted asset batch failed, continuing with remaining batches", {
        batchSize: batch.length,
        batchUseCases: batch.map((uc) => uc.name),
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { queries: allQueries, functions: allFunctions };
}

function buildEntityBlock(entityCandidates: EntityMatchingCandidate[]): string {
  if (entityCandidates.length === 0) return "";
  return `### ENTITY MATCHING COLUMNS (use these values in parameter comments)\n${
    entityCandidates
      .filter((c) => c.sampleValues.length > 0)
      .slice(0, 20)
      .map((c) => `- ${c.tableFqn}.${c.columnName}: [${c.sampleValues.slice(0, 15).join(", ")}]`)
      .join("\n")
  }`;
}

async function processTrustedAssetBatch(
  batch: UseCase[],
  schemaBlock: string,
  entityBlock: string,
  allowlist: SchemaAllowlist,
  endpoint: string,
): Promise<TrustedAssetsOutput> {
  const sqlExamples = batch
    .map((uc) => `Question: ${uc.name}\nSQL:\n${uc.sqlCode}`)
    .join("\n\n---\n\n");

  const systemMessage = `You are a SQL expert creating trusted assets for a Databricks Genie space.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

From the provided SQL examples, create:

1. **Parameterized queries**: Convert WHERE clause values into named parameters using :param_name syntax.
   - Type each parameter (String, Date, Numeric) based on the column's data type
   - For entity-matching columns, include sample values in the parameter comment
   - Include DEFAULT NULL for optional parameters

2. **SQL functions (UDFs)**: For the most common question patterns, create a CREATE FUNCTION statement.
   - Use table-valued functions (RETURNS TABLE)
   - Include descriptive COMMENT on the function and parameters
   - Handle NULL parameters with ISNULL() checks

Return JSON: {
  "queries": [{ "question": "...", "sql": "...", "parameters": [{ "name": "...", "type": "String|Date|Numeric", "comment": "...", "defaultValue": null }] }],
  "functions": [{ "name": "...", "ddl": "CREATE OR REPLACE FUNCTION...", "description": "..." }]
}`;

  const userMessage = `${schemaBlock}

${entityBlock}

### SQL EXAMPLES TO PARAMETERIZE
${sqlExamples}

Create parameterized queries and UDF functions from these examples.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  const result = await chatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens: 4096,
    responseFormat: "json_object",
  });

  const content = result.content ?? "";
  const parsed = parseLLMJson(content) as Record<string, unknown>;

  const queries: TrustedAssetQuery[] = parseArray(parsed.queries)
    .map((q) => ({
      question: String(q.question ?? ""),
      sql: String(q.sql ?? ""),
      parameters: parseArray(q.parameters).map((p) => ({
        name: String(p.name ?? ""),
        type: (["String", "Date", "Numeric"].includes(String(p.type)) ? String(p.type) : "String") as "String" | "Date" | "Numeric",
        comment: String(p.comment ?? ""),
        defaultValue: p.defaultValue ? String(p.defaultValue) : null,
      })),
    }))
    .filter((q) => validateSqlExpression(allowlist, q.sql, `trusted_query:${q.question}`));

  const functions: TrustedAssetFunction[] = parseArray(parsed.functions)
    .map((f) => ({
      name: String(f.name ?? ""),
      ddl: String(f.ddl ?? ""),
      description: String(f.description ?? ""),
    }))
    .filter((f) => f.ddl.length > 0 && f.name.length > 0);

  return { queries, functions };
}

function parseArray(val: unknown): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
}

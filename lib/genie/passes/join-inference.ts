/**
 * Pass 2.5: LLM Join Inference (config-gated)
 *
 * When FK-derived and SQL-mined joins are sparse (< 3), uses an LLM to
 * discover implicit table relationships from column naming patterns
 * (e.g. orders.customer_id -> customers.customerID).
 *
 * All inferred joins are validated against the schema allowlist.
 */

import { type ChatMessage } from "@/lib/dbx/model-serving";
import { cachedChatCompletion } from "../llm-cache";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import type { MetadataSnapshot } from "@/lib/domain/types";
import { buildSchemaContextBlock, isValidTable, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";

const TEMPERATURE = 0.1;

export interface JoinInferenceInput {
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  existingJoinKeys: Set<string>;
  endpoint: string;
  signal?: AbortSignal;
}

export interface JoinInferenceOutput {
  joins: Array<{
    leftTable: string;
    rightTable: string;
    sql: string;
    relationshipType: "many_to_one";
  }>;
}

export async function runJoinInference(
  input: JoinInferenceInput
): Promise<JoinInferenceOutput> {
  const { tableFqns, metadata, allowlist, existingJoinKeys, endpoint, signal } = input;

  if (tableFqns.length < 2) {
    return { joins: [] };
  }

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);

  const existingList = [...existingJoinKeys]
    .map((k) => k.replace("|", " <-> "))
    .join("\n");

  const systemMessage = `You are a data modeling expert identifying table relationships for a Databricks Genie space.

Given the schema context, identify JOIN relationships between tables based on:
1. Column naming conventions (e.g. customer_id in one table matching customerID in another)
2. Primary key / foreign key patterns (e.g. table.id being referenced as table_id elsewhere)
3. Common data modeling patterns (fact-dimension relationships)

Rules:
- ONLY reference tables and columns from the SCHEMA CONTEXT below.
- Do NOT duplicate any already-known relationships listed below.
- For each join, provide the exact column-level join condition.
- Return at most 10 joins.

Return JSON: { "joins": [{ "leftTable": "catalog.schema.table1", "rightTable": "catalog.schema.table2", "joinCondition": "table1.col = table2.col" }] }`;

  const userMessage = `${schemaBlock}

${existingList ? `### ALREADY KNOWN RELATIONSHIPS (do not duplicate)\n${existingList}\n` : ""}

Identify additional table join relationships from column naming patterns.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  const result = await cachedChatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens: 2048,
    responseFormat: "json_object",
    signal,
  });

  const content = result.content ?? "";
  const parsed = parseLLMJson(content) as Record<string, unknown>;
  const items = Array.isArray(parsed.joins) ? parsed.joins : [];

  const joins = (items as Record<string, unknown>[])
    .map((j) => ({
      leftTable: String(j.leftTable ?? j.left_table ?? ""),
      rightTable: String(j.rightTable ?? j.right_table ?? ""),
      sql: String(j.joinCondition ?? j.join_condition ?? j.sql ?? ""),
    }))
    .filter((j) => {
      if (!j.leftTable || !j.rightTable || !j.sql) return false;
      if (!isValidTable(allowlist, j.leftTable) || !isValidTable(allowlist, j.rightTable)) return false;
      if (!validateSqlExpression(allowlist, j.sql, `join:${j.leftTable}->${j.rightTable}`)) return false;

      const pairKey = `${j.leftTable.toLowerCase()}|${j.rightTable.toLowerCase()}`;
      const reverseKey = `${j.rightTable.toLowerCase()}|${j.leftTable.toLowerCase()}`;
      if (existingJoinKeys.has(pairKey) || existingJoinKeys.has(reverseKey)) return false;

      return true;
    })
    .map((j) => ({
      ...j,
      relationshipType: "many_to_one" as const,
    }));

  if (joins.length > 0) {
    logger.info("LLM join inference discovered relationships", {
      count: joins.length,
      pairs: joins.map((j) => `${j.leftTable} -> ${j.rightTable}`),
    });
  }

  return { joins };
}

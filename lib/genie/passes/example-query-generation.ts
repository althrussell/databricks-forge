import { type ChatMessage } from "@/lib/dbx/model-serving";
import { cachedChatCompletion } from "../llm-cache";
import { parseLLMJson } from "./parse-llm-json";
import { buildSchemaContextBlock, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";
import type { MetadataSnapshot } from "@/lib/domain/types";
import type { TrustedAssetQuery } from "../types";
import { logger } from "@/lib/logger";
import { sanitizeUserContext } from "./title-generation";

const TEMPERATURE = 0.2;
const MAX_QUERIES = 6;
const PII_COLUMN_PATTERN = /(email|phone|ssn|social_security|tax_id|dob|birth|address)/i;
const NUMERIC_TYPE_PATTERN = /^(int|bigint|smallint|tinyint|float|double|decimal|numeric|real)/i;
const DATE_TYPE_PATTERN = /(date|timestamp|time)/i;

interface JoinSpecInput {
  leftTable: string;
  rightTable: string;
  sql: string;
}

export interface ExampleQueryGenerationInput {
  domain: string;
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  joinSpecs: JoinSpecInput[];
  endpoint: string;
  fallbackEndpoint?: string;
  sensitiveColumns?: Set<string>;
  signal?: AbortSignal;
}

export interface ExampleQueryGenerationOutput {
  queries: TrustedAssetQuery[];
  source: "llm" | "fallback";
}

function isSafeColumnName(column: string, sensitiveColumns?: Set<string>): boolean {
  if (sensitiveColumns?.has(column.toLowerCase())) return false;
  return !PII_COLUMN_PATTERN.test(column);
}

export function buildDeterministicExampleQueries(
  domain: string,
  tableFqns: string[],
  metadata: MetadataSnapshot,
  allowlist: SchemaAllowlist,
  joinSpecs: JoinSpecInput[],
  sensitiveColumns?: Set<string>,
): TrustedAssetQuery[] {
  const queries: TrustedAssetQuery[] = [];
  const colsByTable = new Map<string, typeof metadata.columns>();
  for (const col of metadata.columns) {
    const key = col.tableFqn.toLowerCase();
    const arr = colsByTable.get(key) ?? [];
    arr.push(col);
    colsByTable.set(key, arr);
  }

  for (const table of tableFqns.slice(0, 3)) {
    const cols = colsByTable.get(table.toLowerCase()) ?? [];
    const timeCol = cols.find((c) => DATE_TYPE_PATTERN.test(c.dataType) && isSafeColumnName(c.columnName, sensitiveColumns));
    const numericCol = cols.find((c) => NUMERIC_TYPE_PATTERN.test(c.dataType) && isSafeColumnName(c.columnName, sensitiveColumns));
    const groupCol = cols.find(
      (c) =>
        !DATE_TYPE_PATTERN.test(c.dataType) &&
        !NUMERIC_TYPE_PATTERN.test(c.dataType) &&
        isSafeColumnName(c.columnName, sensitiveColumns),
    );
    if (!groupCol) continue;

    const tableName = table.split(".").pop() ?? table;
    const selectMetric = numericCol
      ? `SUM(${table}.${numericCol.columnName}) AS total_value`
      : "COUNT(*) AS total_value";
    const whereTime = timeCol
      ? `WHERE ${table}.${timeCol.columnName} >= DATEADD(day, -90, CURRENT_DATE())`
      : "";

    const sql = [
      `SELECT ${table}.${groupCol.columnName} AS category, ${selectMetric}`,
      `FROM ${table}`,
      whereTime,
      `GROUP BY ${table}.${groupCol.columnName}`,
      "ORDER BY total_value DESC",
      "LIMIT 10",
    ]
      .filter(Boolean)
      .join("\n");

    if (validateSqlExpression(allowlist, sql, `example_query:${tableName}`, true)) {
      queries.push({
        question: `Top ${groupCol.columnName.replace(/_/g, " ")} trends in ${domain}`,
        sql,
        parameters: [],
      });
    }
  }

  if (joinSpecs.length > 0) {
    const join = joinSpecs[0];
    const leftName = join.leftTable.split(".").pop() ?? join.leftTable;
    const rightName = join.rightTable.split(".").pop() ?? join.rightTable;
    const joinSql = [
      "SELECT COUNT(*) AS linked_records",
      `FROM ${join.leftTable}`,
      `JOIN ${join.rightTable} ON ${join.sql}`,
    ].join("\n");
    if (validateSqlExpression(allowlist, joinSql, "example_query:join_coverage", true)) {
      queries.unshift({
        question: `How strongly are ${leftName} linked to ${rightName}?`,
        sql: joinSql,
        parameters: [],
      });
    }
  }

  return queries.slice(0, MAX_QUERIES);
}

async function generateWithEndpoint(input: ExampleQueryGenerationInput, endpoint: string): Promise<TrustedAssetQuery[]> {
  const schemaBlock = buildSchemaContextBlock(input.metadata, input.tableFqns);
  const joinBlock = input.joinSpecs
    .slice(0, 8)
    .map((j) => `- ${j.leftTable} JOIN ${j.rightTable} ON ${j.sql}`)
    .join("\n");

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "You generate practical Databricks SQL example questions for Genie.\n" +
        "Output strict JSON: {\"queries\":[{\"question\":\"...\",\"sql\":\"...\"}]}\n" +
        "Rules: only use schema identifiers provided, avoid sensitive columns (email/phone/ssn/address/dob and classified sensitive columns), max 6 queries.",
    },
    {
      role: "user",
      content: [
        `Domain: ${sanitizeUserContext(input.domain)}`,
        schemaBlock,
        joinBlock ? `Known joins:\n${joinBlock}` : "Known joins: none",
        "Generate 3-6 concise analytical example queries. Prioritize grouped trends, time windows, and one join-based query when joins exist.",
      ].join("\n\n"),
    },
  ];

  const response = await cachedChatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens: 1800,
    responseFormat: "json_object",
    signal: input.signal,
  });
  const parsed = parseLLMJson(response.content ?? "") as Record<string, unknown>;
  const rawQueries = Array.isArray(parsed.queries) ? parsed.queries : [];
  return (rawQueries as Record<string, unknown>[])
    .map((q) => ({
      question: String(q.question ?? "").trim(),
      sql: String(q.sql ?? "").trim(),
      parameters: [],
    }))
    .filter((q) => q.question.length > 0 && q.sql.length > 0)
    .filter((q) => validateSqlExpression(input.allowlist, q.sql, `example_query:${q.question}`, true))
    .slice(0, MAX_QUERIES);
}

export async function runExampleQueryGeneration(
  input: ExampleQueryGenerationInput,
): Promise<ExampleQueryGenerationOutput> {
  try {
    const llmQueries = await generateWithEndpoint(input, input.endpoint);
    if (llmQueries.length > 0) {
      return { queries: llmQueries, source: "llm" };
    }
  } catch (error) {
    logger.warn("Fast example query generation failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (input.fallbackEndpoint && input.fallbackEndpoint !== input.endpoint) {
    try {
      const fallbackQueries = await generateWithEndpoint(input, input.fallbackEndpoint);
      if (fallbackQueries.length > 0) {
        return { queries: fallbackQueries, source: "llm" };
      }
    } catch (error) {
      logger.warn("Fallback example query generation failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    queries: buildDeterministicExampleQueries(
      input.domain,
      input.tableFqns,
      input.metadata,
      input.allowlist,
      input.joinSpecs,
      input.sensitiveColumns,
    ),
    source: "fallback",
  };
}

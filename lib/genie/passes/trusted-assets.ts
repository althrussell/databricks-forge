/**
 * Pass 3: Trusted Asset Authoring (LLM, grounded)
 *
 * Converts top SQL examples into parameterized queries (trusted assets)
 * and generates UDF SQL definitions for frequently-asked question patterns.
 * All SQL is validated against the schema allowlist.
 */

import { type ChatMessage } from "@/lib/dbx/model-serving";
import { cachedChatCompletion } from "../llm-cache";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import type { UseCase, MetadataSnapshot } from "@/lib/domain/types";
import type {
  TrustedAssetQuery,
  TrustedAssetFunction,
  EntityMatchingCandidate,
} from "../types";
import { buildSchemaContextBlock, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";
import { DATABRICKS_SQL_RULES_COMPACT } from "@/lib/ai/sql-rules";
import { mapWithConcurrency } from "../concurrency";

const TEMPERATURE = 0.2;
const BATCH_SIZE = 3;
const BATCH_CONCURRENCY = 3;

export interface JoinSpecInput {
  leftTable: string;
  rightTable: string;
  sql: string;
  relationshipType: string;
}

export interface TrustedAssetsInput {
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  useCases: UseCase[];
  entityCandidates: EntityMatchingCandidate[];
  joinSpecs: JoinSpecInput[];
  endpoint: string;
  signal?: AbortSignal;
}

export interface TrustedAssetsOutput {
  queries: TrustedAssetQuery[];
  functions: TrustedAssetFunction[];
}

export async function runTrustedAssetAuthoring(
  input: TrustedAssetsInput
): Promise<TrustedAssetsOutput> {
  const { tableFqns, metadata, allowlist, useCases, entityCandidates, joinSpecs, endpoint, signal } = input;

  const topUseCases = useCases
    .filter((uc) => uc.sqlCode && uc.sqlStatus === "generated")
    .slice(0, 12);

  if (topUseCases.length === 0) {
    return { queries: [], functions: [] };
  }

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);
  const entityBlock = buildEntityBlock(entityCandidates);
  const joinBlock = buildJoinBlock(joinSpecs);

  const batches: UseCase[][] = [];
  for (let i = 0; i < topUseCases.length; i += BATCH_SIZE) {
    batches.push(topUseCases.slice(i, i + BATCH_SIZE));
  }

  logger.info("Trusted asset authoring: batching use cases", {
    totalUseCases: topUseCases.length,
    batchCount: batches.length,
    batchSize: BATCH_SIZE,
  });

  const batchResults = await mapWithConcurrency(
    batches.map((batch) => async () => {
      try {
        return await processTrustedAssetBatch(
          batch, schemaBlock, entityBlock, joinBlock, allowlist, endpoint, signal
        );
      } catch (err) {
        logger.warn("Trusted asset batch failed, continuing with remaining batches", {
          batchSize: batch.length,
          batchUseCases: batch.map((uc) => uc.name),
          error: err instanceof Error ? err.message : String(err),
        });
        return { queries: [] as TrustedAssetQuery[], functions: [] as TrustedAssetFunction[] };
      }
    }),
    BATCH_CONCURRENCY,
  );

  const allQueries: TrustedAssetQuery[] = [];
  const allFunctions: TrustedAssetFunction[] = [];
  for (const result of batchResults) {
    allQueries.push(...result.queries);
    allFunctions.push(...result.functions);
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

function buildJoinBlock(joinSpecs: JoinSpecInput[]): string {
  if (joinSpecs.length === 0) return "";
  const lines = joinSpecs.map(
    (j) => `- ${j.leftTable} JOIN ${j.rightTable} ON ${j.sql} (${j.relationshipType})`
  );
  return `### TABLE RELATIONSHIPS (use these exact join conditions)\n${lines.join("\n")}`;
}

async function processTrustedAssetBatch(
  batch: UseCase[],
  schemaBlock: string,
  entityBlock: string,
  joinBlock: string,
  allowlist: SchemaAllowlist,
  endpoint: string,
  signal?: AbortSignal,
): Promise<TrustedAssetsOutput> {
  const MAX_SQL_CHARS = 3000;
  const sqlExamples = batch
    .map((uc) => {
      const sql = (uc.sqlCode ?? "").length > MAX_SQL_CHARS
        ? uc.sqlCode!.slice(0, MAX_SQL_CHARS) + "\n-- (truncated)"
        : uc.sqlCode;
      return `Question: ${uc.name}\nSQL:\n${sql}`;
    })
    .join("\n\n---\n\n");

  const systemMessage = `You are a SQL expert creating trusted assets for a Databricks Genie space.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

From the provided SQL examples, create:

1. **Parameterized queries** (primary output): Convert WHERE clause values into named parameters using :param_name syntax.
   - Type each parameter (String, Date, Numeric) based on the column's data type
   - For entity-matching columns, include sample values in the parameter comment
   - Include DEFAULT NULL for optional parameters
   - PRESERVE all human-readable identifying columns (e.g. email_address, customer_name, product_name) in the SELECT output -- do not strip them during parameterization
   - For top-N queries, use ORDER BY ... LIMIT N, NOT RANK()/DENSE_RANK() (ties can return more than N rows)
   - Parameterized queries are the RIGHT place for complex analytics: multi-CTE queries, window functions, statistical functions, correlation analysis, anomaly detection, benchmarking, etc. Genie learns from these patterns.

2. **SQL functions (UDFs)** (sparingly -- only when genuinely useful): Simple, focused utility functions.
   Functions in Genie are "certified answers" -- Genie calls them directly and shows the result. It CANNOT compose on top of them (no extra WHERE, no GROUP BY changes). Therefore:
   - ONLY create a function when the pattern is a simple parameterized lookup, entity summary, or reusable calculation
   - Functions MUST be short: max 1 CTE, max ~30 lines of SQL in the body
   - Good function examples: get_customer_summary(name), find_top_products(city), lookup_order_by_id(id)
   - BAD function examples: anomaly detection, multi-CTE benchmarks, statistical reports, correlation analyses -- these MUST be parameterized queries instead
   - Do NOT wrap complex analytical SQL in a function. If a use case has CTEs with window functions, statistical aggregates, or multi-step analytical logic, it belongs as a parameterized query, NOT a function.
   - Use table-valued functions (RETURNS TABLE)
   - Include descriptive COMMENT on the function and parameters
   - Handle NULL parameters with ISNULL() checks
   - Include identifying columns (name, email, etc.) in the RETURNS TABLE definition
   - LIMIT values MUST be integer literals (e.g. LIMIT 10), NOT parameters -- Databricks requires LIMIT to be a constant
   - PARAMETER TYPE RESTRICTION: Genie certified answer functions only support STRING, INT, LONG, DOUBLE, DECIMAL, and BOOLEAN parameter types. Do NOT use DATE or TIMESTAMP as parameter types. For date parameters, use STRING and CAST inside the function body.

SQL PRESERVATION RULES (apply to parameterized queries):
- PRESERVE the full CTE structure and all business logic from the source SQL. Do NOT simplify, remove CTEs, drop analytical columns, or reduce query complexity.
- PRESERVE all columns in the SELECT list exactly as they appear in the source SQL. Do NOT add columns not present in the source or remove columns that are present.
- PRESERVE exact threshold values (LIMIT N, WHERE conditions, >= comparisons). Do NOT change numeric thresholds, filter conditions, or row limits.
- PRESERVE window function ordering (ASC/DESC) exactly. NTILE, RANK, ROW_NUMBER semantics depend on sort direction -- reversing ORDER BY reverses the business meaning.
- PRESERVE all statistical and advanced functions (CORR, REGR_SLOPE, REGR_INTERCEPT, REGR_R2, PERCENTILE_APPROX, SKEWNESS, KURTOSIS, CUME_DIST). These are analytical requirements, not optional embellishments.

QUANTITY RULES:
- Produce exactly 1 parameterized query per use case provided. If a use case has complex SQL with multiple analytical angles, you may produce 2 queries.
- Produce 0 or 1 functions per batch. Only create a function if there is a genuinely simple, reusable lookup pattern. It is perfectly fine to produce 0 functions.

${DATABRICKS_SQL_RULES_COMPACT}

Return JSON: {
  "queries": [{ "question": "...", "sql": "...", "parameters": [{ "name": "...", "type": "String|Date|Numeric", "comment": "...", "defaultValue": null }] }],
  "functions": [{ "name": "...", "ddl": "CREATE OR REPLACE FUNCTION...", "description": "..." }]
}`;

  const userMessage = `${schemaBlock}

${entityBlock}

${joinBlock}

### SQL EXAMPLES TO PARAMETERIZE
${sqlExamples}

Create parameterized queries and UDF functions from these examples.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  const result = await cachedChatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens: 8192,
    responseFormat: "json_object",
    signal,
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
    .filter((f) => f.ddl.length > 0 && f.name.length > 0)
    .filter((f) => validateSqlExpression(allowlist, f.ddl, `trusted_fn:${f.name}`))
    .filter((f) => {
      if (isFunctionTooComplex(f.ddl)) {
        logger.info("Rejecting overly complex function — should be a SQL example", {
          name: f.name,
          cteCount: (f.ddl.match(/\bAS\s*\(/gi) ?? []).length,
          lineCount: f.ddl.split("\n").length,
        });
        return false;
      }
      return true;
    });

  return { queries, functions };
}

/**
 * Reject functions that are too complex for Genie certified answers.
 * Complex analytics belong as parameterized queries (SQL examples),
 * not as functions that Genie calls opaquely.
 */
function isFunctionTooComplex(ddl: string): boolean {
  const bodyMatch = ddl.match(/\bRETURN\b([\s\S]*)/i);
  if (!bodyMatch) return false;
  const body = bodyMatch[1];

  const cteCount = (body.match(/\bAS\s*\(/gi) ?? []).length;
  if (cteCount > 2) return true;

  const lineCount = body.split("\n").filter((l) => l.trim().length > 0).length;
  if (lineCount > 50) return true;

  const windowFnCount = (body.match(/\bOVER\s*\(/gi) ?? []).length;
  if (windowFnCount > 1) return true;

  const statFns = /\b(STDDEV_POP|STDDEV_SAMP|SKEWNESS|KURTOSIS|REGR_SLOPE|REGR_R2|REGR_INTERCEPT|CUME_DIST|CORR)\b/gi;
  if (statFns.test(body)) return true;

  return false;
}

function parseArray(val: unknown): Record<string, unknown>[] {
  if (!Array.isArray(val)) return [];
  return val.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
}

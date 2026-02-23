/**
 * Pass 5: Benchmark Generation (LLM, grounded)
 *
 * Generates benchmark questions with expected SQL answers for quality
 * assurance of Genie spaces. Includes alternate phrasings, time-period
 * variants, and entity-matching test questions.
 */

import { type ChatMessage } from "@/lib/dbx/model-serving";
import { cachedChatCompletion } from "../llm-cache";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import type { UseCase, MetadataSnapshot } from "@/lib/domain/types";
import type { BenchmarkInput, EntityMatchingCandidate } from "../types";
import { buildSchemaContextBlock, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";
import { DATABRICKS_SQL_RULES_COMPACT } from "@/lib/ai/sql-rules";
import { mapWithConcurrency } from "../concurrency";

const TEMPERATURE = 0.1;
const BENCHMARKS_PER_BATCH = 4;
const BATCH_SIZE = 3;
const BATCH_CONCURRENCY = 3;

interface JoinSpecInput {
  leftTable: string;
  rightTable: string;
  sql: string;
  relationshipType: string;
}

export interface BenchmarkGenerationInput {
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  useCases: UseCase[];
  entityCandidates: EntityMatchingCandidate[];
  customerBenchmarks: BenchmarkInput[];
  joinSpecs: JoinSpecInput[];
  endpoint: string;
  signal?: AbortSignal;
}

export interface BenchmarkGenerationOutput {
  benchmarks: BenchmarkInput[];
}

export async function runBenchmarkGeneration(
  input: BenchmarkGenerationInput
): Promise<BenchmarkGenerationOutput> {
  const {
    tableFqns, metadata, allowlist, useCases,
    entityCandidates, customerBenchmarks, joinSpecs, endpoint, signal,
  } = input;

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);

  const joinBlock = joinSpecs.length > 0
    ? `### TABLE RELATIONSHIPS (use these exact join conditions in expectedSql)\n${
        joinSpecs.map((j) => `- ${j.leftTable} JOIN ${j.rightTable} ON ${j.sql} (${j.relationshipType})`).join("\n")
      }`
    : "";

  const entityBlock = entityCandidates
    .filter((c) => c.sampleValues.length > 0)
    .slice(0, 10)
    .map((c) => `${c.tableFqn}.${c.columnName}: [${c.sampleValues.slice(0, 8).join(", ")}]`)
    .join("\n");

  const useCasesWithSql = useCases.filter((uc) => uc.sqlCode).slice(0, 10);

  const batches: UseCase[][] = [];
  for (let i = 0; i < useCasesWithSql.length; i += BATCH_SIZE) {
    batches.push(useCasesWithSql.slice(i, i + BATCH_SIZE));
  }

  if (batches.length === 0) {
    batches.push([]);
  }

  logger.info("Benchmark generation: batching use cases", {
    totalUseCases: useCasesWithSql.length,
    batchCount: batches.length,
    batchSize: BATCH_SIZE,
    benchmarksPerBatch: BENCHMARKS_PER_BATCH,
  });

  const batchResults = await mapWithConcurrency(
    batches.map((batch) => async () => {
      try {
        return await processBenchmarkBatch(
          batch, schemaBlock, entityBlock, joinBlock, allowlist, endpoint, signal
        );
      } catch (err) {
        logger.warn("Benchmark batch failed, continuing with remaining batches", {
          batchSize: batch.length,
          error: err instanceof Error ? err.message : String(err),
        });
        return [] as BenchmarkInput[];
      }
    }),
    BATCH_CONCURRENCY,
  );

  const allBenchmarks: BenchmarkInput[] = batchResults.flat();

  const customerQuestions = new Set(customerBenchmarks.map((b) => b.question.toLowerCase()));
  const deduped = dedup(allBenchmarks, (b) => b.question.toLowerCase());
  const merged = [
    ...customerBenchmarks,
    ...deduped.filter((b) => !customerQuestions.has(b.question.toLowerCase())),
  ];

  return { benchmarks: merged };
}

async function processBenchmarkBatch(
  batch: UseCase[],
  schemaBlock: string,
  entityBlock: string,
  joinBlock: string,
  allowlist: SchemaAllowlist,
  endpoint: string,
  signal?: AbortSignal,
): Promise<BenchmarkInput[]> {
  const MAX_SQL_CHARS = 3000;
  const useCaseContext = batch
    .map((uc) => {
      const sql = (uc.sqlCode ?? "").length > MAX_SQL_CHARS
        ? uc.sqlCode!.slice(0, MAX_SQL_CHARS) + "\n-- (truncated)"
        : uc.sqlCode;
      return `Use case: ${uc.name}\nQuestion: ${uc.statement}\nGROUND TRUTH SQL (use this as the expectedSql, do NOT simplify):\n${sql}`;
    })
    .join("\n\n---\n\n");

  const systemMessage = `You are a QA expert creating benchmark questions for a Databricks Genie space.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

Generate ${BENCHMARKS_PER_BATCH} benchmark questions with expected SQL answers. Include:
1. Direct questions from the use cases
2. Alternate phrasings of the same questions (2-4 phrasings per concept)
3. Time-period variants: "last month", "this quarter", "YTD"
4. Entity-matching tests: use conversational language that requires mapping to coded values

For each benchmark:
- question: The natural language question
- expectedSql: Valid SQL that correctly answers the question
- alternatePhrasings: 2-4 different ways to ask the same question

SQL rules for expectedSql:
- For top-N queries (e.g. "top 10 customers"), ALWAYS use ORDER BY ... LIMIT N. NEVER use RANK() or DENSE_RANK() because ties can return more than N rows.
- Always include human-readable identifying columns (e.g. email_address, customer_name, product_name) in the SELECT alongside IDs and metrics when the query is entity-level.

SQL PRESERVATION RULES (critical -- violations cause benchmark failures):
- The expectedSql MUST faithfully reproduce the full analytical complexity of the source use case SQL. Do NOT simplify CTEs, remove scoring logic, drop statistical functions, or reduce the number of output columns.
- PRESERVE exact thresholds (LIMIT values, WHERE filter conditions, minimum row counts). The ground truth SQL specifies these for a reason.
- PRESERVE all window function ORDER BY directions exactly (ASC vs DESC). NTILE(5) OVER (ORDER BY x ASC) assigns quintile 5 to the highest values. NTILE(5) OVER (ORDER BY x DESC) assigns quintile 1 to the highest values. Reversing the direction reverses tier/segment assignments.
- PRESERVE all advanced analytics: CORR, REGR_SLOPE, REGR_INTERCEPT, PERCENTILE_APPROX, SKEWNESS, KURTOSIS, CUME_DIST, cross-join correlation CTEs, revenue share calculations.
- Do NOT add columns not present in the source SQL (e.g., do not add "country" if the source SQL does not include it).
- Do NOT remove columns present in the source SQL (e.g., do not drop email_address, scoring columns, or percentile baselines).

${DATABRICKS_SQL_RULES_COMPACT}

Return JSON: { "benchmarks": [{ "question": "...", "expectedSql": "...", "alternatePhrasings": ["..."] }] }`;

  const userMessage = `${schemaBlock}

${entityBlock ? `### ENTITY MATCHING VALUES\n${entityBlock}\n` : ""}
${joinBlock ? `${joinBlock}\n` : ""}
### USE CASES WITH SQL
${useCaseContext || "(no use case SQL available)"}

Generate ${BENCHMARKS_PER_BATCH} benchmark questions with expected SQL and alternate phrasings.`;

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
  const items: Record<string, unknown>[] = Array.isArray(parsed.benchmarks)
    ? parsed.benchmarks
    : Array.isArray(parsed) ? parsed : [];

  return items
    .map((b) => ({
      question: String(b.question ?? ""),
      expectedSql: String(b.expectedSql ?? b.expected_sql ?? ""),
      alternatePhrasings: Array.isArray(b.alternatePhrasings ?? b.alternate_phrasings)
        ? (b.alternatePhrasings as string[] ?? b.alternate_phrasings as string[]).map(String)
        : [],
    }))
    .filter((b) => b.question.length > 0 && b.expectedSql.length > 0)
    .filter((b) => validateSqlExpression(allowlist, b.expectedSql, `benchmark:${b.question}`));
}

function dedup(items: BenchmarkInput[], keyFn: (item: BenchmarkInput) => string): BenchmarkInput[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

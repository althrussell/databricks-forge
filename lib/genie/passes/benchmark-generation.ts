/**
 * Pass 5: Benchmark Generation (LLM, grounded)
 *
 * Generates benchmark questions with expected SQL answers for quality
 * assurance of Genie spaces. Includes alternate phrasings, time-period
 * variants, and entity-matching test questions.
 */

import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import type { UseCase, MetadataSnapshot } from "@/lib/domain/types";
import type { BenchmarkInput, EntityMatchingCandidate } from "../types";
import { buildSchemaContextBlock, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";

const TEMPERATURE = 0.3;
const BENCHMARKS_PER_BATCH = 5;
const BATCH_SIZE = 4;

export interface BenchmarkGenerationInput {
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  useCases: UseCase[];
  entityCandidates: EntityMatchingCandidate[];
  customerBenchmarks: BenchmarkInput[];
  endpoint: string;
}

export interface BenchmarkGenerationOutput {
  benchmarks: BenchmarkInput[];
}

export async function runBenchmarkGeneration(
  input: BenchmarkGenerationInput
): Promise<BenchmarkGenerationOutput> {
  const {
    tableFqns, metadata, allowlist, useCases,
    entityCandidates, customerBenchmarks, endpoint,
  } = input;

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);

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

  const allBenchmarks: BenchmarkInput[] = [];

  for (const batch of batches) {
    try {
      const batchResult = await processBenchmarkBatch(
        batch, schemaBlock, entityBlock, allowlist, endpoint
      );
      allBenchmarks.push(...batchResult);
    } catch (err) {
      logger.warn("Benchmark batch failed, continuing with remaining batches", {
        batchSize: batch.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

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
  allowlist: SchemaAllowlist,
  endpoint: string,
): Promise<BenchmarkInput[]> {
  const useCaseContext = batch
    .map((uc) => `Use case: ${uc.name}\nQuestion: ${uc.statement}\nSQL: ${uc.sqlCode}`)
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

Return JSON: { "benchmarks": [{ "question": "...", "expectedSql": "...", "alternatePhrasings": ["..."] }] }`;

  const userMessage = `${schemaBlock}

${entityBlock ? `### ENTITY MATCHING VALUES\n${entityBlock}\n` : ""}

### USE CASES WITH SQL
${useCaseContext || "(no use case SQL available)"}

Generate ${BENCHMARKS_PER_BATCH} benchmark questions with expected SQL and alternate phrasings.`;

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

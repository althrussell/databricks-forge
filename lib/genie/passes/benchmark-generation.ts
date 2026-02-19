/**
 * Pass 5: Benchmark Generation (LLM, grounded)
 *
 * Generates benchmark questions with expected SQL answers for quality
 * assurance of Genie spaces. Includes alternate phrasings, time-period
 * variants, and entity-matching test questions.
 */

import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import type { UseCase, MetadataSnapshot } from "@/lib/domain/types";
import type { BenchmarkInput, EntityMatchingCandidate } from "../types";
import { buildSchemaContextBlock, validateSqlExpression, type SchemaAllowlist } from "../schema-allowlist";

const TEMPERATURE = 0.3;
const TARGET_BENCHMARKS = 15;

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

  const useCaseContext = useCases
    .filter((uc) => uc.sqlCode)
    .slice(0, 10)
    .map((uc) => `Use case: ${uc.name}\nQuestion: ${uc.statement}\nSQL: ${uc.sqlCode}`)
    .join("\n\n---\n\n");

  const entityBlock = entityCandidates
    .filter((c) => c.sampleValues.length > 0)
    .slice(0, 10)
    .map((c) => `${c.tableFqn}.${c.columnName}: [${c.sampleValues.slice(0, 8).join(", ")}]`)
    .join("\n");

  const systemMessage = `You are a QA expert creating benchmark questions for a Databricks Genie space.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

Generate ${TARGET_BENCHMARKS} benchmark questions with expected SQL answers. Include:
1. Direct questions from the use cases
2. Alternate phrasings of the same questions (2-4 phrasings per concept)
3. Time-period variants: "last month", "this quarter", "YTD"
4. Entity-matching tests: use conversational language that requires mapping to coded values

For each benchmark:
- question: The natural language question
- expectedSql: Valid SQL that correctly answers the question
- alternatePhrasings: 2-4 different ways to ask the same question

Return JSON: { "benchmarks": [{ "question": "...", "expectedSql": "...", "alternatePhrasings": ["..."] }] }`;

  const userMessage = `${schemaBlock}

${entityBlock ? `### ENTITY MATCHING VALUES\n${entityBlock}\n` : ""}

### USE CASES WITH SQL
${useCaseContext || "(no use case SQL available)"}

Generate ${TARGET_BENCHMARKS} benchmark questions with expected SQL and alternate phrasings.`;

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
    const parsed = JSON.parse(content);
    const items: Record<string, unknown>[] = Array.isArray(parsed.benchmarks)
      ? parsed.benchmarks
      : Array.isArray(parsed) ? parsed : [];

    const llmBenchmarks: BenchmarkInput[] = items
      .map((b) => ({
        question: String(b.question ?? ""),
        expectedSql: String(b.expectedSql ?? b.expected_sql ?? ""),
        alternatePhrasings: Array.isArray(b.alternatePhrasings ?? b.alternate_phrasings)
          ? (b.alternatePhrasings as string[] ?? b.alternate_phrasings as string[]).map(String)
          : [],
      }))
      .filter((b) => b.question.length > 0 && b.expectedSql.length > 0)
      .filter((b) => validateSqlExpression(allowlist, b.expectedSql, `benchmark:${b.question}`));

    // Merge with customer-provided benchmarks (customer takes priority)
    const customerQuestions = new Set(customerBenchmarks.map((b) => b.question.toLowerCase()));
    const merged = [
      ...customerBenchmarks,
      ...llmBenchmarks.filter((b) => !customerQuestions.has(b.question.toLowerCase())),
    ];

    return { benchmarks: merged };
  } catch (err) {
    logger.warn("Benchmark generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { benchmarks: [...customerBenchmarks] };
  }
}

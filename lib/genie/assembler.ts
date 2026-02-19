/**
 * SerializedSpace Assembler — builds a complete Genie API v2 payload
 * from the aggregated pass outputs, with full schema-allowlist validation.
 */

import { createHash } from "crypto";
import type {
  SerializedSpace,
  SampleQuestion,
  DataSourceTable,
  DataSourceMetricView,
  ExampleQuestionSql,
  JoinSpec,
  SqlSnippetMeasure,
  SqlSnippetFilter,
  SqlSnippetExpression,
  TextInstruction,
  BenchmarkQuestion,
  GenieEnginePassOutputs,
  GenieSpaceRecommendation,
} from "./types";
import type { MetadataSnapshot } from "@/lib/domain/types";
import { isValidTable, validateSqlExpression, type SchemaAllowlist } from "./schema-allowlist";
import { logger } from "@/lib/logger";

function makeId(seed: string, category: string, index: number): string {
  const hash = createHash("md5")
    .update(`${seed}:${category}:${index}`)
    .digest("hex");
  return hash.slice(0, 32);
}

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

export interface AssembleOptions {
  runId: string;
  businessName: string;
  allowlist: SchemaAllowlist;
  metadata: MetadataSnapshot;
}

/**
 * Assemble a complete SerializedSpace from engine pass outputs.
 * Every identifier is validated against the schema allowlist.
 */
export function assembleSerializedSpace(
  outputs: GenieEnginePassOutputs,
  opts: AssembleOptions
): SerializedSpace {
  const { runId, allowlist, metadata } = opts;
  const { domain } = outputs;
  const seed = `${runId}:${domain}`;

  // Table comments lookup
  const tableComments = new Map<string, string>();
  for (const t of metadata.tables) {
    if (t.comment) tableComments.set(t.fqn, t.comment);
  }

  // Metric view comments lookup
  const mvComments = new Map<string, string>();
  for (const mv of metadata.metricViews) {
    if (mv.comment) mvComments.set(mv.fqn, mv.comment);
  }

  // 1. Data source tables (validated)
  const validTables = outputs.tables.filter((fqn) => {
    if (!isValidTable(allowlist, fqn)) {
      logger.warn("Assembler rejected unknown table", { domain, table: fqn });
      return false;
    }
    return true;
  });

  const dataTables: DataSourceTable[] = validTables
    .sort((a, b) => a.localeCompare(b))
    .map((fqn) => {
      const comment = tableComments.get(fqn);
      return comment ? { identifier: fqn, description: [comment] } : { identifier: fqn };
    });

  // 2. Data source metric views
  const dataMetricViews: DataSourceMetricView[] = outputs.metricViews
    .sort((a, b) => a.localeCompare(b))
    .map((fqn) => {
      const comment = mvComments.get(fqn);
      return comment ? { identifier: fqn, description: [comment] } : { identifier: fqn };
    });

  // 3. Sample questions
  const sampleQuestions: SampleQuestion[] = outputs.sampleQuestions
    .slice(0, 5)
    .map((q, i) => ({
      id: makeId(seed, "q", i),
      question: [q],
    }));

  // 4. SQL examples (from trusted queries + use case SQL)
  const exampleSqls: ExampleQuestionSql[] = outputs.trustedQueries
    .slice(0, 10)
    .map((tq, i) => ({
      id: makeId(seed, "sql", i),
      question: [tq.question],
      sql: [tq.sql],
    }));

  // 5. Join specs
  const joinSpecs: JoinSpec[] = outputs.joinSpecs
    .map((j, i) => ({
      id: makeId(seed, "join", i),
      left: { identifier: j.leftTable },
      right: { identifier: j.rightTable },
      sql: [j.sql],
    }));

  // 6. SQL snippets (measures, filters, dimensions)
  const measures: SqlSnippetMeasure[] = outputs.measures
    .filter((m) => validateSqlExpression(allowlist, m.sql, `asm_measure:${m.name}`))
    .slice(0, 20)
    .map((m, i) => ({
      id: makeId(seed, "measure", i),
      alias: m.name,
      sql: [m.sql],
    }));

  const filters: SqlSnippetFilter[] = outputs.filters
    .filter((f) => validateSqlExpression(allowlist, f.sql, `asm_filter:${f.name}`))
    .slice(0, 20)
    .map((f, i) => ({
      id: makeId(seed, "filter", i),
      sql: [f.sql],
      display_name: f.name,
    }));

  const expressions: SqlSnippetExpression[] = outputs.dimensions
    .filter((d) => validateSqlExpression(allowlist, d.sql, `asm_dim:${d.name}`))
    .slice(0, 20)
    .map((d, i) => ({
      id: makeId(seed, "expr", i),
      alias: d.name,
      sql: [d.sql],
    }));

  // 7. Text instructions
  const textInstructions: TextInstruction[] = outputs.textInstructions
    .filter((t) => t.trim().length > 0)
    .map((t, i) => ({
      id: makeId(seed, "instr", i),
      content: [t],
    }));

  // 8. Benchmarks
  const benchmarks: BenchmarkQuestion[] = outputs.benchmarkQuestions
    .slice(0, 50)
    .map((b, i) => ({
      id: makeId(seed, "bench", i),
      question: [b.question, ...b.alternatePhrasings],
      answer: b.expectedSql ? [{ format: "sql", content: [b.expectedSql] }] : undefined,
    }));

  const space: SerializedSpace = {
    version: 2,
    config: { sample_questions: [...sampleQuestions].sort(byId) },
    data_sources: {
      tables: dataTables,
      ...(dataMetricViews.length > 0 ? { metric_views: dataMetricViews } : {}),
    },
    instructions: {
      text_instructions: [...textInstructions].sort(byId),
      example_question_sqls: [...exampleSqls].sort(byId),
      join_specs: [...joinSpecs].sort(byId),
      sql_snippets: {
        measures: [...measures].sort(byId),
        filters: [...filters].sort(byId),
        expressions: [...expressions].sort(byId),
      },
    },
    ...(benchmarks.length > 0 ? { benchmarks: { questions: [...benchmarks].sort(byId) } } : {}),
  };

  return space;
}

/**
 * Build a GenieSpaceRecommendation from engine pass outputs + assembled space.
 */
export function buildRecommendation(
  outputs: GenieEnginePassOutputs,
  space: SerializedSpace,
  businessName: string
): GenieSpaceRecommendation {
  const title = `${businessName} - ${outputs.domain} Analytics`;

  const descParts: string[] = [
    `Genie space for the ${outputs.domain} domain of ${businessName}.`,
  ];
  if (outputs.subdomains.length > 0) {
    descParts.push(`Covers: ${outputs.subdomains.join(", ")}.`);
  }
  descParts.push(
    `${outputs.measures.length} measures, ${outputs.filters.length} filters, ${outputs.dimensions.length} dimensions.`
  );

  return {
    domain: outputs.domain,
    subdomains: outputs.subdomains,
    title,
    description: descParts.join(" "),
    tableCount: outputs.tables.length,
    metricViewCount: outputs.metricViews.length,
    useCaseCount: 0, // Will be set by the engine
    sqlExampleCount: space.instructions.example_question_sqls.length,
    joinCount: space.instructions.join_specs.length,
    measureCount: space.instructions.sql_snippets.measures.length,
    filterCount: space.instructions.sql_snippets.filters.length,
    dimensionCount: space.instructions.sql_snippets.expressions.length,
    tables: outputs.tables,
    metricViews: outputs.metricViews,
    serializedSpace: JSON.stringify(space),
  };
}

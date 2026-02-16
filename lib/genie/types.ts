/**
 * TypeScript types for Databricks Genie Spaces integration.
 *
 * Covers the REST API payloads (serialized_space v2 format), the
 * recommendation engine output, and the local tracking model.
 */

// ---------------------------------------------------------------------------
// Genie REST API Types
// ---------------------------------------------------------------------------

/** Top-level response from List / Get / Create / Update endpoints. */
export interface GenieSpaceResponse {
  space_id: string;
  title: string;
  description?: string;
  warehouse_id?: string;
  serialized_space?: string; // JSON string -- only in Get / Create / Update
}

export interface GenieListResponse {
  spaces: GenieSpaceResponse[];
  next_page_token?: string;
}

// ---------------------------------------------------------------------------
// Serialized Space (v2 format)
// ---------------------------------------------------------------------------

export interface SerializedSpace {
  version: 2;
  config: SerializedSpaceConfig;
  data_sources: SerializedDataSources;
  instructions: SerializedInstructions;
  benchmarks?: SerializedBenchmarks;
}

export interface SerializedSpaceConfig {
  sample_questions: SampleQuestion[];
}

export interface SampleQuestion {
  id: string;
  question: string[];
}

export interface SerializedDataSources {
  tables: DataSourceTable[];
  metric_views?: DataSourceMetricView[];
}

export interface DataSourceTable {
  identifier: string; // catalog.schema.table
  description?: string[];
}

export interface DataSourceMetricView {
  identifier: string; // catalog.schema.metric_view
  description?: string[];
}

export interface SerializedInstructions {
  text_instructions: TextInstruction[];
  example_question_sqls: ExampleQuestionSql[];
  sql_functions?: SqlFunction[];
  join_specs: JoinSpec[];
  sql_snippets: SqlSnippets;
}

export interface TextInstruction {
  id: string;
  content: string[];
}

export interface ExampleQuestionSql {
  id: string;
  question: string[];
  sql: string[];
}

export interface SqlFunction {
  id: string;
  identifier: string;
}

export interface JoinSpec {
  id: string;
  left: { identifier: string };
  right: { identifier: string };
  sql: string[];
}

export interface SqlSnippets {
  measures: SqlSnippetMeasure[];
  filters: SqlSnippetFilter[];
  expressions: SqlSnippetExpression[];
}

export interface SqlSnippetMeasure {
  id: string;
  alias: string;
  sql: string[];
}

export interface SqlSnippetFilter {
  id: string;
  sql: string[];
  display_name: string;
}

export interface SqlSnippetExpression {
  id: string;
  alias: string;
  sql: string[];
}

export interface SerializedBenchmarks {
  questions: BenchmarkQuestion[];
}

export interface BenchmarkQuestion {
  id: string;
  question: string[];
  answer?: { format: string; content: string[] }[];
}

// ---------------------------------------------------------------------------
// Recommendation Engine Output
// ---------------------------------------------------------------------------

export interface GenieSpaceRecommendation {
  domain: string;
  subdomains: string[];
  title: string;
  description: string;
  tableCount: number;
  metricViewCount: number;
  useCaseCount: number;
  sqlExampleCount: number;
  joinCount: number;
  measureCount: number;
  filterCount: number;
  dimensionCount: number;
  tables: string[];
  metricViews: string[];
  serializedSpace: string; // JSON string ready for the Create API
}

// ---------------------------------------------------------------------------
// Tracking (local Lakebase persistence)
// ---------------------------------------------------------------------------

export type GenieSpaceStatus = "created" | "updated" | "trashed";

export interface TrackedGenieSpace {
  id: string;
  spaceId: string;
  runId: string;
  domain: string;
  title: string;
  status: GenieSpaceStatus;
  createdAt: string;
  updatedAt: string;
}

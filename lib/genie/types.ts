/**
 * TypeScript types for Databricks Genie Spaces integration.
 *
 * Covers the REST API payloads (serialized_space v2 format), the
 * recommendation engine output, the Genie Engine configuration,
 * pass output types, and the local tracking model.
 */

// ---------------------------------------------------------------------------
// Genie Engine Configuration (customer-editable)
// ---------------------------------------------------------------------------

export interface GlossaryEntry {
  term: string;
  definition: string;
  synonyms: string[];
}

export interface ColumnOverride {
  tableFqn: string;
  columnName: string;
  hidden?: boolean;
  displayName?: string;
  description?: string;
  synonyms?: string[];
}

export interface CustomSqlExpression {
  name: string;
  sql: string;
  synonyms: string[];
  instructions: string;
}

export interface TableGroupOverride {
  tableFqn: string;
  targetDomain: string;
}

export interface JoinOverride {
  leftTable: string;
  rightTable: string;
  joinSql: string;
  relationshipType: "many_to_one" | "one_to_many" | "one_to_one";
  enabled: boolean;
}

export interface ClarificationRule {
  topic: string;
  missingDetails: string[];
  clarificationQuestion: string;
}

export interface EntityMatchingOverride {
  tableFqn: string;
  columnName: string;
  enabled: boolean;
}

export interface BenchmarkInput {
  question: string;
  expectedSql: string;
  alternatePhrasings: string[];
}

export interface GenieEngineConfig {
  glossary: GlossaryEntry[];
  columnOverrides: ColumnOverride[];

  customMeasures: CustomSqlExpression[];
  customFilters: CustomSqlExpression[];
  customDimensions: CustomSqlExpression[];

  fiscalYearStartMonth: number;
  autoTimePeriods: boolean;
  timePeriodDateColumns: string[];

  tableGroupOverrides: TableGroupOverride[];
  maxTablesPerSpace: number;
  joinOverrides: JoinOverride[];

  entityMatchingMode: "auto" | "manual" | "off";
  entityMatchingOverrides: EntityMatchingOverride[];

  clarificationRules: ClarificationRule[];
  summaryInstructions: string;
  globalInstructions: string;

  benchmarkQuestions: BenchmarkInput[];

  generateMetricViews: boolean;
  generateTrustedAssets: boolean;
  generateBenchmarks: boolean;
  llmRefinement: boolean;
}

export function defaultGenieEngineConfig(): GenieEngineConfig {
  return {
    glossary: [],
    columnOverrides: [],
    customMeasures: [],
    customFilters: [],
    customDimensions: [],
    fiscalYearStartMonth: 1,
    autoTimePeriods: true,
    timePeriodDateColumns: [],
    tableGroupOverrides: [],
    maxTablesPerSpace: 25,
    joinOverrides: [],
    entityMatchingMode: "auto",
    entityMatchingOverrides: [],
    clarificationRules: [],
    summaryInstructions: "",
    globalInstructions: "",
    benchmarkQuestions: [],
    generateMetricViews: true,
    generateTrustedAssets: true,
    generateBenchmarks: true,
    llmRefinement: true,
  };
}

// ---------------------------------------------------------------------------
// Engine Pass Outputs
// ---------------------------------------------------------------------------

export interface ColumnEnrichment {
  tableFqn: string;
  columnName: string;
  description: string | null;
  synonyms: string[];
  hidden: boolean;
  entityMatchingCandidate: boolean;
}

export interface EntityMatchingCandidate {
  tableFqn: string;
  columnName: string;
  sampleValues: string[];
  distinctCount: number;
  confidence: "high" | "medium" | "low";
  conversationalMappings: string[];
}

export interface EnrichedSqlSnippetMeasure {
  name: string;
  sql: string;
  synonyms: string[];
  instructions: string;
}

export interface EnrichedSqlSnippetFilter {
  name: string;
  sql: string;
  synonyms: string[];
  instructions: string;
  isTimePeriod: boolean;
}

export interface EnrichedSqlSnippetDimension {
  name: string;
  sql: string;
  synonyms: string[];
  instructions: string;
  isTimePeriod: boolean;
}

export interface TrustedAssetQuery {
  question: string;
  sql: string;
  parameters: TrustedAssetParameter[];
}

export interface TrustedAssetParameter {
  name: string;
  type: "String" | "Date" | "Numeric";
  comment: string;
  defaultValue: string | null;
}

export interface TrustedAssetFunction {
  name: string;
  ddl: string;
  description: string;
}

export interface MetricViewProposal {
  name: string;
  description: string;
  yaml: string;
  ddl: string;
  sourceTables: string[];
  hasJoins: boolean;
  hasFilteredMeasures: boolean;
  hasWindowMeasures: boolean;
  hasMaterialization: boolean;
  validationStatus: "valid" | "warning" | "error";
  validationIssues: string[];
}

/** Aggregated output from all engine passes for a single domain. */
export interface GenieEnginePassOutputs {
  domain: string;
  subdomains: string[];
  tables: string[];
  metricViews: string[];
  columnEnrichments: ColumnEnrichment[];
  entityMatchingCandidates: EntityMatchingCandidate[];
  measures: EnrichedSqlSnippetMeasure[];
  filters: EnrichedSqlSnippetFilter[];
  dimensions: EnrichedSqlSnippetDimension[];
  trustedQueries: TrustedAssetQuery[];
  trustedFunctions: TrustedAssetFunction[];
  textInstructions: string[];
  sampleQuestions: string[];
  benchmarkQuestions: BenchmarkInput[];
  metricViewProposals: MetricViewProposal[];
  joinSpecs: Array<{
    leftTable: string;
    rightTable: string;
    sql: string;
    relationshipType: "many_to_one" | "one_to_many" | "one_to_one";
  }>;
}

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
  usage_guidance?: string[];
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
  relationship_type?: "one_to_one" | "one_to_many" | "many_to_one";
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
  synonyms?: string[];
  instructions?: string[];
}

export interface SqlSnippetFilter {
  id: string;
  sql: string[];
  display_name: string;
  synonyms?: string[];
  instructions?: string[];
}

export interface SqlSnippetExpression {
  id: string;
  alias: string;
  sql: string[];
  synonyms?: string[];
  instructions?: string[];
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
  benchmarkCount: number;
  instructionCount: number;
  sampleQuestionCount: number;
  sqlFunctionCount: number;
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

// ---------------------------------------------------------------------------
// Extended Recommendation (engine-generated)
// ---------------------------------------------------------------------------

export interface GenieEngineRecommendation extends GenieSpaceRecommendation {
  benchmarks: string | null;
  columnEnrichments: string | null;
  metricViewProposals: string | null;
  trustedFunctions: string | null;
  engineConfigVersion: number;
}

// ---------------------------------------------------------------------------
// Sample Data Cache (structured data for entity extraction)
// ---------------------------------------------------------------------------

export interface SampleDataEntry {
  columns: string[];
  columnTypes: string[];
  rows: unknown[][];
}

export type SampleDataCache = Map<string, SampleDataEntry>;

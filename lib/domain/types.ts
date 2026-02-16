/**
 * Core domain types for Databricks Inspire AI.
 *
 * These types are shared across the entire application: API routes,
 * pipeline steps, UI components, and persistence.
 */

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export enum PipelineStep {
  BusinessContext = "business-context",
  MetadataExtraction = "metadata-extraction",
  TableFiltering = "table-filtering",
  UsecaseGeneration = "usecase-generation",
  DomainClustering = "domain-clustering",
  Scoring = "scoring",
  SqlGeneration = "sql-generation",
}

export type RunStatus = "pending" | "running" | "completed" | "failed";

export type Operation = "Discover Usecases" | "Re-generate SQL" | "Generate Sample Result";

export const BUSINESS_PRIORITIES = [
  "Increase Revenue",
  "Reduce Cost",
  "Optimize Operations",
  "Mitigate Risk",
  "Empower Talent",
  "Enhance Experience",
  "Drive Innovation",
  "Achieve ESG",
  "Protect Revenue",
  "Execute Strategy",
] as const;

export type BusinessPriority = (typeof BUSINESS_PRIORITIES)[number];

export const GENERATION_OPTIONS = [
  "SQL Code",
  "PDF Catalog",
  "Presentation",
  "dashboards",
  "Unstructured Data Usecases",
] as const;

export type GenerationOption = (typeof GENERATION_OPTIONS)[number];

export const SUPPORTED_LANGUAGES = [
  "English",
  "Arabic",
  "Chinese",
  "French",
  "German",
  "Hindi",
  "Italian",
  "Japanese",
  "Korean",
  "Portuguese",
  "Russian",
  "Spanish",
  "Turkish",
  "Dutch",
  "Polish",
  "Swedish",
  "Thai",
  "Vietnamese",
  "Indonesian",
  "Malay",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

// ---------------------------------------------------------------------------
// Pipeline Run
// ---------------------------------------------------------------------------

export interface PipelineRunConfig {
  businessName: string;
  ucMetadata: string;
  operation: Operation;
  businessDomains: string;
  businessPriorities: BusinessPriority[];
  strategicGoals: string;
  generationOptions: GenerationOption[];
  generationPath: string;
  languages: SupportedLanguage[];
  aiModel: string;
  sampleRowsPerTable: number; // 0 = disabled, 5-50 = rows to sample per table for SQL gen
  industry: string; // industry outcome map id, empty = not selected
}

/** Per-step timing and metadata logged during pipeline execution. */
export interface StepLogEntry {
  step: PipelineStep;
  startedAt: string; // ISO timestamp
  completedAt?: string; // ISO timestamp
  durationMs?: number;
  error?: string;
  honestyScores?: Record<string, number>; // promptKey -> score
  itemCount?: number; // items produced/processed in this step
}

export interface PipelineRun {
  runId: string;
  config: PipelineRunConfig;
  status: RunStatus;
  currentStep: PipelineStep | null;
  progressPct: number;
  statusMessage: string | null;
  businessContext: BusinessContext | null;
  errorMessage: string | null;
  appVersion: string | null;
  promptVersions: Record<string, string> | null; // promptKey -> SHA-256 hash
  stepLog: StepLogEntry[];
  industryAutoDetected: boolean; // true when the industry was set by auto-detection, not user
  createdBy: string | null; // email of the user who created this run
  createdAt: string; // ISO timestamp
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Business Context
// ---------------------------------------------------------------------------

export interface BusinessContext {
  industries: string;
  strategicGoals: string;
  businessPriorities: string;
  strategicInitiative: string;
  valueChain: string;
  revenueModel: string;
  additionalContext: string;
}

// ---------------------------------------------------------------------------
// Use Case
// ---------------------------------------------------------------------------

export type UseCaseType = "AI" | "Statistical";

export interface UseCase {
  id: string;
  runId: string;
  useCaseNo: number;
  name: string;
  type: UseCaseType;
  analyticsTechnique: string;
  statement: string;
  solution: string;
  businessValue: string;
  beneficiary: string;
  sponsor: string;
  domain: string;
  subdomain: string;
  tablesInvolved: string[]; // FQNs
  priorityScore: number;
  feasibilityScore: number;
  impactScore: number;
  overallScore: number;
  sqlCode: string | null;
  sqlStatus: string | null;
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export interface TableInfo {
  catalog: string;
  schema: string;
  tableName: string;
  fqn: string; // catalog.schema.table
  tableType: string;
  comment: string | null;
}

export interface ColumnInfo {
  tableFqn: string;
  columnName: string;
  dataType: string;
  ordinalPosition: number;
  isNullable: boolean;
  comment: string | null;
}

export interface ForeignKey {
  constraintName: string;
  tableFqn: string;
  columnName: string;
  referencedTableFqn: string;
  referencedColumnName: string;
}

export interface MetricViewInfo {
  catalog: string;
  schema: string;
  name: string;
  fqn: string; // catalog.schema.metric_view
  comment: string | null;
}

export interface MetadataSnapshot {
  cacheKey: string;
  ucPath: string;
  tables: TableInfo[];
  columns: ColumnInfo[];
  foreignKeys: ForeignKey[];
  metricViews: MetricViewInfo[];
  schemaMarkdown: string;
  tableCount: number;
  columnCount: number;
  cachedAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export type ExportFormat = "excel" | "pdf" | "pptx" | "notebooks";

export interface ExportRecord {
  exportId: string;
  runId: string;
  format: ExportFormat;
  filePath: string;
  createdAt: string; // ISO timestamp
}

// ---------------------------------------------------------------------------
// Pipeline Step Context (passed between steps)
// ---------------------------------------------------------------------------

export interface PipelineContext {
  run: PipelineRun;
  metadata: MetadataSnapshot | null;
  filteredTables: string[]; // FQNs of business-relevant tables
  useCases: UseCase[];
}

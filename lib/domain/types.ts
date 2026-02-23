/**
 * Core domain types for Databricks Forge AI.
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
  GenieRecommendations = "genie-recommendations",
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

export const DISCOVERY_DEPTHS = ["focused", "balanced", "comprehensive"] as const;
export type DiscoveryDepth = (typeof DISCOVERY_DEPTHS)[number];

/** Tunable parameters for a single discovery depth level. */
export interface DiscoveryDepthConfig {
  batchTargetMin: number;
  batchTargetMax: number;
  qualityFloor: number;
  adaptiveCap: number;
  lineageDepth: number;
}

/** Factory defaults -- used when no user override is stored. */
export const DEFAULT_DEPTH_CONFIGS: Record<DiscoveryDepth, DiscoveryDepthConfig> = {
  focused:       { batchTargetMin: 8,  batchTargetMax: 12, qualityFloor: 0.4, adaptiveCap: 75,  lineageDepth: 3  },
  balanced:      { batchTargetMin: 12, batchTargetMax: 18, qualityFloor: 0.3, adaptiveCap: 150, lineageDepth: 5  },
  comprehensive: { batchTargetMin: 15, batchTargetMax: 22, qualityFloor: 0.2, adaptiveCap: 250, lineageDepth: 10 },
};

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
  sampleRowsPerTable: number; // 0 = disabled, 5-50 = rows to sample per table for discovery & SQL gen
  industry: string; // industry outcome map id, empty = not selected
  discoveryDepth: DiscoveryDepth; // controls generation volume, quality floor, and adaptive cap
  depthConfig?: DiscoveryDepthConfig; // resolved parameters for the selected depth (from settings or defaults)
  estateScanEnabled: boolean; // run estate scan (environment intelligence enrichment) during metadata extraction
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

export type UseCaseType = "AI" | "Statistical" | "Geospatial";

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
  /** User-adjusted scores (null = user hasn't overridden system score) */
  userPriorityScore: number | null;
  userFeasibilityScore: number | null;
  userImpactScore: number | null;
  userOverallScore: number | null;
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
  dataSourceFormat?: string | null;
  comment: string | null;
  discoveredVia?: "selected" | "lineage";
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
  lineageDiscoveredFqns: string[];
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
  lineageGraph: LineageGraph | null;
  /** Cached sample rows from data sampling, keyed by table FQN. Used by Genie Engine for entity extraction. */
  sampleData: import("@/lib/genie/types").SampleDataCache | null;
}

// ---------------------------------------------------------------------------
// Environment Scan — enriched metadata intelligence
// ---------------------------------------------------------------------------

/** Extended table metadata from DESCRIBE DETAIL + enrichment. */
export interface TableDetail {
  /** Core identity (same as TableInfo) */
  catalog: string;
  schema: string;
  tableName: string;
  fqn: string;
  tableType: string;
  comment: string | null;

  /** DESCRIBE DETAIL fields + statistics */
  sizeInBytes: number | null;
  numFiles: number | null;
  numRows: number | null; // from spark.sql.statistics.numRows (ANALYZE TABLE) or operationMetrics
  format: string | null; // delta, parquet, csv, etc.
  partitionColumns: string[];
  clusteringColumns: string[];
  location: string | null;
  owner: string | null;
  provider: string | null;
  isManaged: boolean;
  deltaMinReaderVersion: number | null;
  deltaMinWriterVersion: number | null;
  createdAt: string | null; // ISO timestamp
  lastModified: string | null; // ISO timestamp
  tableProperties: Record<string, string>;

  /** How this table was found */
  discoveredVia: "selected" | "lineage";

  /** LLM-derived fields (filled by intelligence layer) */
  dataDomain: string | null;
  dataSubdomain: string | null;
  dataTier: DataTier | null;
  generatedDescription: string | null;
  sensitivityLevel: SensitivityLevel | null;
  governancePriority: GovernancePriority | null;
}

export type DataTier = "bronze" | "silver" | "gold" | "system";
export type SensitivityLevel = "public" | "internal" | "confidential" | "restricted";
export type GovernancePriority = "critical" | "high" | "medium" | "low";

/** Aggregated history insights derived from DESCRIBE HISTORY. */
export interface TableHistorySummary {
  tableFqn: string;
  lastWriteTimestamp: string | null;
  lastWriteOperation: string | null;
  lastWriteRows: number | null; // numOutputRows from the latest write's operationMetrics
  lastWriteBytes: number | null; // numOutputBytes from the latest write's operationMetrics
  totalWriteOps: number;
  totalStreamingOps: number;
  totalOptimizeOps: number;
  totalVacuumOps: number;
  totalMergeOps: number;
  lastOptimizeTimestamp: string | null;
  lastVacuumTimestamp: string | null;
  hasStreamingWrites: boolean;
  historyDays: number;
  topOperations: Record<string, number>;
}

/** A single lineage edge from system.access.table_lineage. */
export interface LineageEdge {
  sourceTableFqn: string;
  targetTableFqn: string;
  sourceType: string; // TABLE, VIEW, STREAMING_TABLE, etc.
  targetType: string;
  lastEventTime: string | null;
  entityType: string | null; // JOB, NOTEBOOK, PIPELINE, etc.
  eventCount: number;
}

/** Full lineage context for a scan. */
export interface LineageGraph {
  edges: LineageEdge[];
  seedTables: string[];
  discoveredTables: string[];
  upstreamDepth: number;
  downstreamDepth: number;
}

/** A Unity Catalog table tag. */
export interface TableTag {
  tableFqn: string;
  tagName: string;
  tagValue: string;
}

/** A Unity Catalog column tag. */
export interface ColumnTag {
  tableFqn: string;
  columnName: string;
  tagName: string;
  tagValue: string;
}

// ---------------------------------------------------------------------------
// LLM Intelligence Types
// ---------------------------------------------------------------------------

/** A business domain assigned to a group of tables. */
export interface DataDomain {
  domain: string;
  subdomain: string;
  tables: string[]; // FQNs
  description: string;
}

/** PII/sensitive data classification per column. */
export interface SensitivityClassification {
  tableFqn: string;
  columnName: string;
  classification: "PII" | "Financial" | "Health" | "Authentication" | "Internal" | "Public";
  confidence: "high" | "medium" | "low";
  reason: string;
  regulation: string | null; // GDPR, HIPAA, PCI-DSS, etc.
}

/** Inferred foreign key from column naming patterns. */
export interface ImplicitRelationship {
  sourceTableFqn: string;
  sourceColumn: string;
  targetTableFqn: string;
  targetColumn: string;
  confidence: "high" | "medium" | "low";
  reasoning: string;
}

/** Two tables that appear to be duplicates or near-duplicates. */
export interface RedundancyPair {
  tableA: string;
  tableB: string;
  similarityPercent: number;
  sharedColumns: string[];
  reason: string;
  recommendation: "consolidate" | "archive" | "investigate";
}

/** A logical grouping of tables forming a data product. */
export interface DataProduct {
  productName: string;
  description: string;
  tables: string[];
  primaryDomain: string;
  maturityLevel: "raw" | "curated" | "productised";
  ownerHint: string | null;
}

/** Per-table governance gap assessment. */
export interface GovernanceGap {
  tableFqn: string;
  overallScore: number; // 0-100
  gaps: Array<{
    category: "documentation" | "ownership" | "sensitivity" | "access_control" | "maintenance" | "lineage" | "tagging";
    severity: "critical" | "high" | "medium" | "low";
    detail: string;
    recommendation: string;
  }>;
}

/** Per-table health insight (rule-based, not LLM). */
export interface TableHealthInsight {
  tableFqn: string;
  healthScore: number; // 0-100
  issues: string[];
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// Environment Scan Record
// ---------------------------------------------------------------------------

/** Top-level scan record linking all enrichment data. */
export interface EnvironmentScan {
  scanId: string;
  runId: string | null; // null for standalone scans
  ucPath: string;
  scannedAt: string; // ISO timestamp
  tableCount: number;
  totalSizeBytes: number;
  totalFiles: number;
  totalRows: number; // sum of numRows across all tables (where available)
  tablesWithStreaming: number;
  tablesWithCDF: number;
  tablesNeedingOptimize: number;
  tablesNeedingVacuum: number;
  lineageDiscoveredCount: number;
  domainCount: number;
  piiTablesCount: number;
  redundancyPairsCount: number;
  dataProductCount: number;
  avgGovernanceScore: number;
  scanDurationMs: number;
  passResults: Record<string, "success" | "failed" | "skipped">;
}

/** Aggregated results from all intelligence passes. */
export interface IntelligenceResult {
  domains: DataDomain[];
  sensitivities: SensitivityClassification[];
  generatedDescriptions: Map<string, string>; // fqn -> description
  redundancies: RedundancyPair[];
  implicitRelationships: ImplicitRelationship[];
  tierAssignments: Map<string, { tier: DataTier; reasoning: string }>;
  dataProducts: DataProduct[];
  governanceGaps: GovernanceGap[];
  passResults: Record<string, "success" | "failed" | "skipped">;
}

// ---------------------------------------------------------------------------
// ERD Types
// ---------------------------------------------------------------------------

/** A table node in the ERD graph. */
export interface ERDNode {
  tableFqn: string;
  displayName: string;
  description: string | null;
  columns: Array<{
    name: string;
    type: string;
    description: string | null;
    isPK: boolean;
    isFK: boolean;
  }>;
  domain: string | null;
  tier: DataTier | null;
  hasPII: boolean;
  size: number | null;
  rowCount: number | null;
  x: number;
  y: number;
}

/** A relationship edge in the ERD graph. */
export interface ERDEdge {
  id: string;
  source: string; // table FQN
  target: string; // table FQN
  edgeType: "fk" | "implicit" | "lineage";
  sourceColumn?: string;
  targetColumn?: string;
  label: string;
  confidence?: "high" | "medium" | "low";
  entityType?: string; // for lineage: JOB, NOTEBOOK, etc.
}

/** Complete ERD graph. */
export interface ERDGraph {
  nodes: ERDNode[];
  edges: ERDEdge[];
  domains: string[];
  stats: {
    fkCount: number;
    implicitCount: number;
    lineageCount: number;
  };
}

/**
 * TypeScript types for Databricks AI/BI Dashboard (Lakeview) integration.
 *
 * Covers the LLM-generated dashboard design, the Lakeview JSON format,
 * the recommendation output, and the local tracking model.
 */

// ---------------------------------------------------------------------------
// LLM Output: Dashboard Design
// ---------------------------------------------------------------------------

export type DatasetPurpose = "kpi" | "trend" | "breakdown" | "detail";

export type WidgetType =
  | "counter"
  | "bar"
  | "line"
  | "pie"
  | "table"
  | "filter-multi-select"
  | "filter-single-select"
  | "filter-date-range-picker";

export type FieldRole = "x" | "y" | "value" | "color" | "column" | "filter";

export interface DatasetDesign {
  name: string;
  displayName: string;
  sql: string;
  purpose: DatasetPurpose;
}

export interface WidgetFieldDesign {
  name: string;
  expression: string;
  role: FieldRole;
}

export interface WidgetDesign {
  type: WidgetType;
  title: string;
  datasetName: string;
  fields: WidgetFieldDesign[];
  /** For filter widgets: the column to filter on (must exist in the dataset). */
  filterField?: string;
}

export interface DashboardDesign {
  title: string;
  description: string;
  datasets: DatasetDesign[];
  widgets: WidgetDesign[];
}

// ---------------------------------------------------------------------------
// Lakeview Dashboard JSON (Databricks API format)
// ---------------------------------------------------------------------------

export interface LakeviewDataset {
  name: string;
  displayName: string;
  queryLines: string[];
}

export interface LakeviewWidgetField {
  name: string;
  expression: string;
}

export interface LakeviewWidgetQuery {
  name: string;
  query: {
    datasetName: string;
    fields: LakeviewWidgetField[];
    disaggregated: boolean;
  };
}

export interface LakeviewPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LakeviewCounterEncoding {
  value: { fieldName: string; displayName: string };
}

export interface LakeviewAxisEncoding {
  fieldName: string;
  scale: { type: "temporal" | "quantitative" | "categorical" };
  displayName: string;
}

export interface LakeviewChartEncodings {
  x: LakeviewAxisEncoding;
  y:
    | LakeviewAxisEncoding
    | { scale: { type: "quantitative" }; fields: { fieldName: string; displayName: string }[] };
  color?: { fieldName: string; scale: { type: "categorical" }; displayName: string };
}

export interface LakeviewColumnEncoding {
  fieldName: string;
  displayName: string;
}

export interface LakeviewTableEncodings {
  columns: LakeviewColumnEncoding[];
}

export interface LakeviewPieEncodings {
  angle: { fieldName: string; scale: { type: "quantitative" }; displayName: string };
  color: { fieldName: string; scale: { type: "categorical" }; displayName: string };
}

export interface LakeviewFilterEncoding {
  fields: Array<{
    fieldName: string;
    displayName: string;
    queryName: string;
  }>;
}

export interface LakeviewFrame {
  showTitle: boolean;
  title: string;
}

export interface LakeviewWidgetSpec {
  version: number;
  widgetType: string;
  encodings:
    | LakeviewCounterEncoding
    | LakeviewChartEncodings
    | LakeviewTableEncodings
    | LakeviewPieEncodings
    | LakeviewFilterEncoding;
  frame: LakeviewFrame;
}

export interface LakeviewWidget {
  widget: {
    name: string;
    multilineTextboxSpec?: { lines: string[] };
    queries?: LakeviewWidgetQuery[];
    spec?: LakeviewWidgetSpec;
  };
  position: LakeviewPosition;
}

export interface LakeviewPage {
  name: string;
  displayName: string;
  pageType: "PAGE_TYPE_CANVAS" | "PAGE_TYPE_GLOBAL_FILTERS";
  layout: LakeviewWidget[];
}

export interface SerializedLakeviewDashboard {
  datasets: LakeviewDataset[];
  pages: LakeviewPage[];
}

// ---------------------------------------------------------------------------
// Databricks Lakeview REST API Types
// ---------------------------------------------------------------------------

export interface LakeviewDashboardResponse {
  dashboard_id: string;
  display_name: string;
  warehouse_id?: string;
  serialized_dashboard?: string;
  path?: string;
  parent_path?: string;
  lifecycle_state?: string;
  create_time?: string;
  update_time?: string;
}

// ---------------------------------------------------------------------------
// Recommendation Engine Output
// ---------------------------------------------------------------------------

export interface DashboardRecommendation {
  domain: string;
  subdomains: string[];
  title: string;
  description: string;
  datasetCount: number;
  widgetCount: number;
  useCaseIds: string[];
  serializedDashboard: string;
  dashboardDesign: DashboardDesign;
  /** "new" (default), "enhancement" (existing dashboard found), or "replacement" */
  recommendationType?: "new" | "enhancement" | "replacement";
  /** Dashboard ID of the existing asset when recommendationType is "enhancement" */
  existingAssetId?: string;
  /** Human-readable summary of what changed vs the existing dashboard */
  changeSummary?: string;
}

// ---------------------------------------------------------------------------
// Tracking (local Lakebase persistence)
// ---------------------------------------------------------------------------

export type DashboardStatus = "created" | "updated" | "trashed";

export interface TrackedDashboard {
  id: string;
  dashboardId: string;
  runId: string;
  domain: string;
  title: string;
  status: DashboardStatus;
  dashboardUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Prompt Enrichment Types
// ---------------------------------------------------------------------------

export interface FilterCandidate {
  name: string;
  column: string;
  tableFqn: string;
  dataType: string;
}

export interface MetricViewForDashboard {
  fqn: string;
  name: string;
  description: string;
  dimensions: Array<{ name: string; expr: string }>;
  measures: Array<{ name: string; expr: string }>;
}

// ---------------------------------------------------------------------------
// Engine Dependencies (DI)
// ---------------------------------------------------------------------------

/**
 * Injectable dependencies for the Dashboard Engine.
 *
 * When provided via `DashboardEngineInput.deps`, the engine uses these
 * instead of hard-coded imports. This enables portability and testing.
 */
export interface DashboardEngineDeps {
  /** LLM client. Falls back to chatCompletion from model-serving. */
  llm?: import("@/lib/ports/llm-client").LLMClient;
  /** Logger. Falls back to @/lib/logger. */
  logger?: import("@/lib/ports/logger").Logger;
  /** SQL review function. Falls back to reviewAndFixSql. */
  reviewAndFixSql?: typeof import("@/lib/ai/sql-reviewer").reviewAndFixSql;
  /** Review enabled gate. Falls back to isReviewEnabled. */
  isReviewEnabled?: (surface?: string) => boolean;
}

// ---------------------------------------------------------------------------
// Engine Input / Output
// ---------------------------------------------------------------------------

export interface DashboardEngineInput {
  run: import("@/lib/domain/types").PipelineRun;
  useCases: import("@/lib/domain/types").UseCase[];
  metadata: import("@/lib/domain/types").MetadataSnapshot;
  genieRecommendations?: import("@/lib/genie/types").GenieEngineRecommendation[];
  /** Existing dashboards discovered via asset discovery (for dedup and enhancement). */
  existingDashboards?: import("@/lib/discovery/types").DiscoveredDashboard[];
  domainFilter?: string[];
  onProgress?: (message: string, percent: number) => void;
  /** Injectable dependencies for portability and testing. */
  deps?: DashboardEngineDeps;
}

export interface DashboardEngineResult {
  recommendations: DashboardRecommendation[];
}

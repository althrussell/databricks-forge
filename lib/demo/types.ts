/**
 * Shared types for the Demo Mode feature.
 *
 * Used by both the Research Engine and Data Engine, plus the wizard UI
 * and API routes. Types specific to each engine live in their own
 * `types.ts` module.
 */

// ---------------------------------------------------------------------------
// Research Quality Presets
// ---------------------------------------------------------------------------

export type ResearchPreset = "quick" | "balanced" | "full";

export interface ResearchBudget {
  /** Which source-gathering passes to run. */
  sources: ("website" | "ir-discovery" | "user-docs")[];
  /** Which analytical passes to run (empty for quick -- uses quick-synthesis instead). */
  analyticalPasses: (
    | "industry-landscape"
    | "company-deep-dive"
    | "data-strategy-mapping"
    | "demo-narrative"
    | "strategy-and-narrative"
    | "quick-synthesis"
  )[];
  /** Max output tokens per analytical pass. */
  maxTokensPerPass: number;
  /** Estimated wall-clock seconds (min/max). */
  estimatedSeconds: { min: number; max: number };
}

const QUICK_BUDGET: ResearchBudget = {
  sources: ["website"],
  analyticalPasses: ["quick-synthesis"],
  maxTokensPerPass: 8_192,
  estimatedSeconds: { min: 20, max: 45 },
};

const BALANCED_BUDGET: ResearchBudget = {
  sources: ["website", "ir-discovery"],
  analyticalPasses: ["industry-landscape", "strategy-and-narrative"],
  maxTokensPerPass: 32_000,
  estimatedSeconds: { min: 60, max: 90 },
};

const FULL_BUDGET: ResearchBudget = {
  sources: ["website", "ir-discovery", "user-docs"],
  analyticalPasses: [
    "industry-landscape",
    "company-deep-dive",
    "data-strategy-mapping",
    "demo-narrative",
  ],
  maxTokensPerPass: 32_000,
  estimatedSeconds: { min: 120, max: 180 },
};

const RESEARCH_BUDGETS: Record<ResearchPreset, ResearchBudget> = {
  quick: QUICK_BUDGET,
  balanced: BALANCED_BUDGET,
  full: FULL_BUDGET,
};

export function resolveResearchBudget(preset: ResearchPreset): ResearchBudget {
  return RESEARCH_BUDGETS[preset];
}

// ---------------------------------------------------------------------------
// Demo Scope
// ---------------------------------------------------------------------------

export interface DemoScope {
  /** Business division or subsidiary. E.g. "Aluminium Division", "Wealth Management". */
  division?: string;
  /** Sub-vertical from the industry outcome map. E.g. "Retail Banking", "Digital / Neobank". */
  subVertical?: string;
  /** Functional focus areas (multi-select). Filters data assets by assetFamily. */
  functionalFocus?: string[];
  /** Specific departments the demo targets (free text tags). */
  departments?: string[];
  /** Free-text description of what the demo should emphasise. */
  demoObjective?: string;
}

export interface ResolvedDemoScope extends DemoScope {
  /** Asset families resolved from departments + functionalFocus. */
  resolvedAssetFamilies: string[];
  /** Divisions/subsidiaries discovered from source material (Pass 5). */
  suggestedDivisions?: string[];
}

// ---------------------------------------------------------------------------
// Source & Document Types
// ---------------------------------------------------------------------------

export type ResearchSourceType = "website" | "investor-doc" | "upload" | "paste";

export interface ResearchSource {
  type: ResearchSourceType;
  title: string;
  charCount: number;
  status: "pending" | "fetching" | "ready" | "failed";
  error?: string;
}

export interface ParsedDocument {
  filename: string;
  mimeType: string;
  text: string;
  charCount: number;
  category: "strategy" | "data-architecture" | "rfp" | "annual-report" | "other";
}

// ---------------------------------------------------------------------------
// Demo Session (matches ForgeDemoSession in Prisma)
// ---------------------------------------------------------------------------

export type DemoSessionStatus =
  | "draft"
  | "researching"
  | "designing"
  | "generating"
  | "completed"
  | "failed";

export interface DemoSessionSummary {
  sessionId: string;
  customerName: string;
  industryId: string;
  researchPreset: ResearchPreset;
  catalogName: string;
  schemaName: string;
  status: DemoSessionStatus;
  tablesCreated: number;
  totalRows: number;
  durationMs: number;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Data Narratives & Table Design
// ---------------------------------------------------------------------------

export interface DataNarrative {
  title: string;
  description: string;
  affectedTables: string[];
  pattern: "spike" | "trend" | "anomaly" | "seasonal" | "correlation";
}

export interface TableColumn {
  name: string;
  dataType: string;
  description: string;
  role: "pk" | "fk" | "measure" | "dimension" | "timestamp" | "flag";
  fkTarget?: string;
}

export interface TableDesign {
  name: string;
  assetId: string;
  description: string;
  tableType: "dimension" | "fact";
  columns: TableColumn[];
  rowTarget: number;
  creationOrder: number;
  narrativeLinks: string[];
}

// ---------------------------------------------------------------------------
// Data Engine Per-Table Phase Tracking
// ---------------------------------------------------------------------------

export type TablePhase =
  | "pending"
  | "generating-sql"
  | "executing"
  | "retrying"
  | "validating"
  | "completed"
  | "failed";

export interface TableGenerationStatus {
  tableName: string;
  phase: TablePhase;
  rowCount: number;
  error?: string;
  retryCount: number;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface ValidationResult {
  tableName: string;
  rowCount: number;
  fkIntegrity: { valid: boolean; orphanCount: number };
  distributionQuality: "good" | "acceptable" | "poor";
  issues: string[];
}

export interface ValidationSummary {
  totalTables: number;
  passedTables: number;
  totalRows: number;
  issues: string[];
}

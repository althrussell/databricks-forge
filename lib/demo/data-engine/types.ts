/**
 * Data Engine types.
 *
 * Defines inputs, deps, result, and per-table phase tracking types.
 */

import type { LLMClient } from "@/lib/ports/llm-client";
import type { SqlExecutor } from "@/lib/ports/sql-executor";
import type { Logger } from "@/lib/ports/logger";
import type {
  TableDesign,
  TablePhase,
  TableGenerationStatus,
  DataNarrative,
  ValidationSummary,
} from "../types";
import type { ResearchEngineResult } from "../research-engine/types";

// ---------------------------------------------------------------------------
// Engine Input & Deps
// ---------------------------------------------------------------------------

export interface DataEngineInput {
  sessionId: string;
  research: ResearchEngineResult;
  catalog: string;
  schema: string;
  targetRowCount: { min: number; max: number };
  signal?: AbortSignal;
  onProgress?: (message: string, percent: number) => void;
  onTablePhase?: (tableName: string, phase: TablePhase) => void;
  onTablesReady?: (tables: TableDesign[]) => void;
  deps?: DataEngineDeps;
}

export interface DataEngineDeps {
  llm?: LLMClient;
  sql?: SqlExecutor;
  logger?: Logger;
  reviewAndFixSql?: (
    sql: string,
    error: string,
    context?: string,
  ) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type DataPhase =
  | "narrative-design"
  | "schema-design"
  | "seed-generation"
  | "fact-generation"
  | "validation"
  | "complete";

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface TableResult {
  name: string;
  fqn: string;
  rowCount: number;
  status: "completed" | "failed";
  error?: string;
  retryCount: number;
}

export interface DataEngineResult {
  sessionId: string;
  catalog: string;
  schema: string;
  tables: TableResult[];
  narratives: DataNarrative[];
  designs: TableDesign[];
  totalRows: number;
  totalTables: number;
  validationSummary: ValidationSummary;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Status (for polling)
// ---------------------------------------------------------------------------

export interface DataJobStatus {
  sessionId: string;
  status: "generating" | "completed" | "failed" | "cancelled";
  message: string;
  percent: number;
  totalTables: number;
  completedTables: number;
  tableStatuses: TableGenerationStatus[];
  error?: string;
}

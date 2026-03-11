/**
 * Comment Engine types.
 *
 * @module ai/comment-engine/types
 */

import type { SchemaContext } from "@/lib/metadata/types";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Structured counters for the in-memory progress tracker. */
export interface MetadataCounters {
  tablesFound?: number;
  columnsFound?: number;
  lineageEdgesFound?: number;
  enrichedCount?: number;
  enrichTotal?: number;
  tablesGenerated?: number;
  columnsGenerated?: number;
  columnTablesProcessed?: number;
  currentTable?: string | null;
  tableBatches?: number;
  tableBatchesDone?: number;
  consistencyFixes?: number;
}

export interface CommentEngineConfig {
  industryId?: string;
  businessContext?: string;
  /** Enable the consistency review pass (Phase 4). Default: true. */
  enableConsistencyReview?: boolean;
  /** Fetch lineage from system.access.table_lineage. Default: true. */
  enableLineage?: boolean;
  /** Fetch Delta history + DESCRIBE DETAIL. Default: true. */
  enableHistory?: boolean;
  signal?: AbortSignal;
  /** Phase-level progress (phase name + human-readable detail). */
  onProgress?: CommentProgressCallback;
  /** Structured counter updates for the in-memory progress tracker. */
  onMetadataProgress?: (counters: MetadataCounters) => void;
}

export type CommentProgressCallback = (
  phase: string,
  pct: number,
  detail?: string,
) => void;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface CommentEngineResult {
  /** Table FQN -> generated description. */
  tableComments: Map<string, string>;
  /** Table FQN -> (column name -> generated description). */
  columnComments: Map<string, Map<string, string>>;
  /** The SchemaContext built during Phase 0+1 (exposed for downstream reuse). */
  schemaContext: SchemaContext;
  /** Issues found during consistency review (empty if review disabled or skipped). */
  consistencyFixes: ConsistencyFix[];
  stats: CommentEngineStats;
}

export interface CommentEngineStats {
  tables: number;
  columns: number;
  skipped: number;
  consistencyFixesApplied: number;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Consistency
// ---------------------------------------------------------------------------

export interface ConsistencyFix {
  tableFqn: string;
  columnName: string | null;
  issue: string;
  original: string;
  fixed: string;
}

// ---------------------------------------------------------------------------
// Internal pass types
// ---------------------------------------------------------------------------

export interface TableCommentInput {
  fqn: string;
  columns: Array<{ name: string; dataType: string }>;
  existingComment: string | null;
  domain: string | null;
  role: string | null;
  tier: string | null;
  dataAssetId: string | null;
  dataAssetName: string | null;
  writeFrequency: string | null;
  owner: string | null;
  tags: string[];
  relatedTableFqns: string[];
}

export interface ColumnCommentInput {
  tableFqn: string;
  tableDescription: string;
  tableDomain: string | null;
  tableRole: string | null;
  dataAssetId: string | null;
  dataAssetDescription: string | null;
  columns: Array<{
    name: string;
    dataType: string;
    isNullable: boolean;
    existingComment: string | null;
    inferredRole: string | null;
    inferredFkTarget: string | null;
  }>;
  /** Descriptions of tables in the same domain or with FK relationships. */
  relatedTables: Array<{ fqn: string; description: string }>;
}

/**
 * AI Comment generation -- facade layer.
 *
 * Delegates to the Comment Engine (`lib/ai/comment-engine/engine.ts`)
 * for the actual generation, then persists proposals to Lakebase and
 * updates the job record. This module preserves the existing API
 * contract consumed by the SSE route and frontend.
 *
 * Two entry paths:
 * 1. Fresh generation from UC metadata + Comment Engine (LLM-powered).
 * 2. Import from an existing estate scan (pre-populated, no LLM call).
 */

import { runCommentEngine } from "./comment-engine/engine";
import { createProposals } from "@/lib/lakebase/comment-proposals";
import { updateCommentJobStatus } from "@/lib/lakebase/comment-jobs";
import { logger } from "@/lib/logger";

export type ProgressCallback = (phase: string, pct: number, detail?: string) => void;

export interface GenerateCommentsInput {
  jobId: string;
  catalogs: string[];
  schemas?: string[];
  tables?: string[];
  industryId?: string;
  businessContext?: string;
  signal?: AbortSignal;
  onProgress?: ProgressCallback;
}

export interface GenerateCommentsResult {
  tableCount: number;
  columnCount: number;
}

/**
 * Run full Comment Engine generation for the given scope.
 * Writes proposals to Lakebase and updates the job record.
 */
export async function generateComments(
  input: GenerateCommentsInput,
): Promise<GenerateCommentsResult> {
  const { jobId, catalogs, schemas, tables, industryId, businessContext, signal, onProgress } =
    input;

  try {
    await updateCommentJobStatus(jobId, "generating");

    // Delegate to the Comment Engine
    const result = await runCommentEngine(
      { catalogs, schemas, tables },
      {
        industryId,
        businessContext,
        enableConsistencyReview: true,
        enableLineage: true,
        enableHistory: true,
        signal,
        onProgress,
      },
    );

    // Persist proposals to Lakebase
    const proposals: Array<{
      tableFqn: string;
      columnName?: string | null;
      originalComment?: string | null;
      proposedComment: string;
    }> = [];

    // Table-level proposals
    for (const [fqnLower, description] of result.tableComments) {
      const table = result.schemaContext.tables.find(
        (t) => t.fqn.toLowerCase() === fqnLower,
      );
      proposals.push({
        tableFqn: table?.fqn ?? fqnLower,
        columnName: null,
        originalComment: table?.comment ?? null,
        proposedComment: description,
      });
    }

    // Column-level proposals
    for (const [fqnLower, colMap] of result.columnComments) {
      const table = result.schemaContext.tables.find(
        (t) => t.fqn.toLowerCase() === fqnLower,
      );
      for (const [colName, description] of colMap) {
        const col = table?.columns.find(
          (c) => c.name.toLowerCase() === colName.toLowerCase(),
        );
        proposals.push({
          tableFqn: table?.fqn ?? fqnLower,
          columnName: colName,
          originalComment: col?.comment ?? null,
          proposedComment: description,
        });
      }
    }

    if (proposals.length > 0) {
      await createProposals(jobId, proposals);
    }

    const tableCount = result.stats.tables;
    const columnCount = result.stats.columns;

    await updateCommentJobStatus(jobId, "ready", { tableCount, columnCount });
    onProgress?.("done", 100, `${tableCount} table + ${columnCount} column descriptions ready`);

    logger.info("[comment-generator] Generation complete", {
      jobId,
      tableCount,
      columnCount,
      durationMs: result.stats.durationMs,
      consistencyFixesApplied: result.stats.consistencyFixesApplied,
    });

    return { tableCount, columnCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updateCommentJobStatus(jobId, "failed", { errorMessage: msg });
    throw err;
  }
}

/**
 * Import comments from an existing estate scan (ForgeTableDetail records).
 * Pre-populates proposals from generatedDescription without an LLM call.
 */
export async function importFromScan(
  jobId: string,
  scanDetails: Array<{
    tableFqn: string;
    comment: string | null;
    generatedDescription: string | null;
    columnsJson: string | null;
  }>,
): Promise<GenerateCommentsResult> {
  const proposals: Array<{
    tableFqn: string;
    columnName?: string | null;
    originalComment?: string | null;
    proposedComment: string;
  }> = [];

  for (const detail of scanDetails) {
    if (detail.generatedDescription) {
      proposals.push({
        tableFqn: detail.tableFqn,
        columnName: null,
        originalComment: detail.comment ?? null,
        proposedComment: detail.generatedDescription,
      });
    }
  }

  if (proposals.length > 0) {
    await createProposals(jobId, proposals);
  }

  const tableCount = proposals.filter((p) => !p.columnName).length;
  await updateCommentJobStatus(jobId, "ready", { tableCount, columnCount: 0 });

  return { tableCount, columnCount: 0 };
}

/**
 * DDL execution for applying / undoing AI-generated comments to Unity Catalog.
 *
 * Handles:
 * - Permission pre-checks via SHOW GRANTS
 * - Table comments via COMMENT ON TABLE
 * - Column comments via ALTER TABLE ... ALTER COLUMN ... COMMENT (Delta only)
 * - Column comments via ALTER VIEW ... ALTER COLUMN ... COMMENT (views)
 * - Batched execution with concurrency control
 * - Per-proposal error tracking
 */

import { executeSQL } from "@/lib/dbx/sql";
import { validateFqn, validateIdentifier } from "@/lib/validation";
import {
  markProposalsApplied,
  markProposalFailed,
  markProposalsUndone,
  type CommentProposal,
} from "@/lib/lakebase/comment-proposals";
import { updateCommentJobStatus } from "@/lib/lakebase/comment-jobs";

const APPLY_CONCURRENCY = 5;
const DELAY_BETWEEN_BATCHES_MS = 100;

/** Table types that support ALTER COLUMN COMMENT. */
const COLUMN_COMMENT_SUPPORTED_TYPES = new Set(["MANAGED", "EXTERNAL", "DELTA"]);
const VIEW_TYPES = new Set(["VIEW", "MATERIALIZED_VIEW"]);

// ---------------------------------------------------------------------------
// Permission checking
// ---------------------------------------------------------------------------

export interface PermissionResult {
  canModify: boolean;
  grants: string[];
  error?: string;
}

/**
 * Check whether the current user/SP has MODIFY permission on each table.
 * Uses SHOW GRANTS ON TABLE, falling back gracefully if SHOW GRANTS
 * is not accessible (e.g., on some workspace configurations).
 */
export async function checkPermissions(
  tableFqns: string[],
): Promise<Record<string, PermissionResult>> {
  const results: Record<string, PermissionResult> = {};

  for (const fqn of tableFqns) {
    try {
      const safeFqn = validateFqn(fqn, "table");
      const parts = safeFqn.split(".");
      const quotedFqn = parts.map((p) => `\`${p}\``).join(".");

      const resp = await executeSQL(`SHOW GRANTS ON TABLE ${quotedFqn}`);
      const grants = resp.rows.map((row) => row.join(" | "));
      const hasModify = resp.rows.some((row) =>
        row.some(
          (cell) =>
            cell.toUpperCase().includes("MODIFY") ||
            cell.toUpperCase().includes("ALL_PRIVILEGES") ||
            cell.toUpperCase().includes("ALL PRIVILEGES") ||
            cell.toUpperCase().includes("OWN"),
        ),
      );

      results[fqn] = { canModify: hasModify, grants };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      if (msg.includes("INSUFFICIENT_PERMISSIONS") || msg.includes("does not exist")) {
        results[fqn] = { canModify: false, grants: [], error: msg };
      } else {
        // SHOW GRANTS may not be accessible; assume permission exists
        // and let the actual ALTER fail if not
        results[fqn] = { canModify: true, grants: [], error: `Could not verify: ${msg}` };
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// DDL builders (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Multi-word SQL statement patterns that should never appear in a catalog
 * comment. Single words like "drop" or "delete" are allowed since they
 * can appear in legitimate business descriptions (e.g. "customer drop-off
 * rate", "soft delete flag").
 */
const DANGEROUS_SQL_PATTERNS = [
  /\bDROP\s+(TABLE|VIEW|SCHEMA|DATABASE|CATALOG|COLUMN|FUNCTION|INDEX)\b/i,
  /\bTRUNCATE\s+(TABLE)?\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+\S+\s+SET\b/i,
  /\bALTER\s+(TABLE|VIEW|SCHEMA|DATABASE|CATALOG)\b/i,
  /\bCREATE\s+(TABLE|VIEW|SCHEMA|DATABASE|FUNCTION|INDEX)\b/i,
  /\bGRANT\s+\S+\s+ON\b/i,
  /\bREVOKE\s+\S+\s+(ON|FROM)\b/i,
  /\bEXEC(UTE)?\s*\(/i,
  /\bCALL\s+\S+\s*\(/i,
  /;\s*(DROP|TRUNCATE|DELETE|INSERT|UPDATE|ALTER|CREATE|GRANT|REVOKE)\b/i,
];

/**
 * Validate that comment text does not contain destructive SQL patterns.
 * Throws if a dangerous pattern is detected.
 */
export function validateCommentText(comment: string): void {
  for (const pattern of DANGEROUS_SQL_PATTERNS) {
    if (pattern.test(comment)) {
      throw new Error(
        `Comment contains a disallowed SQL pattern: "${comment.match(pattern)?.[0]}". ` +
        "Comments must be plain descriptive text, not SQL statements.",
      );
    }
  }
}

/**
 * Escape a comment string for safe interpolation into a SQL string literal.
 *
 * Databricks SQL uses ANSI-standard single-quote doubling ('') as the only
 * escape inside string literals. Backslashes are literal characters, not
 * escape prefixes. We double single quotes and also strip NUL bytes and
 * control characters (U+0000-U+001F except tab/newline) as defense-in-depth.
 *
 * Also rejects comments containing destructive SQL statement patterns.
 */
export function escapeComment(comment: string): string {
  if (comment.length > 4000) {
    throw new Error("Comment exceeds maximum length (4000 characters)");
  }
  validateCommentText(comment);
  // Strip NUL and control characters except \t \n \r
  const sanitized = comment.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
  return sanitized.replace(/'/g, "''");
}

function quoteFqn(fqn: string): string {
  return validateFqn(fqn, "table")
    .split(".")
    .map((p) => `\`${p}\``)
    .join(".");
}

export function buildTableCommentDDL(fqn: string, comment: string | null): string {
  const quoted = quoteFqn(fqn);
  if (comment === null) {
    return `COMMENT ON TABLE ${quoted} IS NULL`;
  }
  return `COMMENT ON TABLE ${quoted} IS '${escapeComment(comment)}'`;
}

/**
 * Build column-level comment DDL. Uses ALTER VIEW for views.
 *
 * @param tableType - UC table type (e.g. "MANAGED", "EXTERNAL", "VIEW").
 *                    When undefined, defaults to ALTER TABLE.
 */
export function buildColumnCommentDDL(
  fqn: string,
  columnName: string,
  comment: string | null,
  tableType?: string,
): string {
  const quoted = quoteFqn(fqn);
  const safeCol = validateIdentifier(columnName, "column");
  const keyword = tableType && VIEW_TYPES.has(tableType.toUpperCase()) ? "VIEW" : "TABLE";
  const escapedComment = comment === null ? "''" : `'${escapeComment(comment)}'`;
  return `ALTER ${keyword} ${quoted} ALTER COLUMN \`${safeCol}\` COMMENT ${escapedComment}`;
}

/**
 * Returns true if column-level comments are supported for the given table type.
 * Column comments require Delta Lake tables or views with column mapping enabled.
 */
export function supportsColumnComments(tableType?: string | null): boolean {
  if (!tableType) return true; // optimistic default
  const upper = tableType.toUpperCase();
  return COLUMN_COMMENT_SUPPORTED_TYPES.has(upper) || VIEW_TYPES.has(upper);
}

// ---------------------------------------------------------------------------
// Apply proposals
// ---------------------------------------------------------------------------

export interface ApplyResult {
  applied: number;
  failed: number;
  skipped: number;
  errors: Array<{ proposalId: string; tableFqn: string; columnName: string | null; error: string }>;
}

/**
 * Apply accepted proposals as DDL statements to Unity Catalog.
 * Executes with bounded concurrency and tracks per-proposal errors.
 *
 * @param tableTypes - optional map of FQN -> table type for correct DDL generation
 */
export async function applyProposals(
  jobId: string,
  proposals: CommentProposal[],
  tableTypes?: Map<string, string>,
  onProgress?: (applied: number, total: number) => void,
): Promise<ApplyResult> {
  await updateCommentJobStatus(jobId, "applying");

  const result: ApplyResult = { applied: 0, failed: 0, skipped: 0, errors: [] };
  let completed = 0;

  for (let i = 0; i < proposals.length; i += APPLY_CONCURRENCY) {
    const batch = proposals.slice(i, i + APPLY_CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (proposal) => {
        const tblType = tableTypes?.get(proposal.tableFqn.toLowerCase());

        // Skip column comments for table types that don't support them
        if (proposal.columnName && !supportsColumnComments(tblType)) {
          return { proposalId: proposal.id, success: false, skipped: true, error: `Column comments not supported for ${tblType ?? "unknown"} table type` };
        }

        const comment = proposal.editedComment ?? proposal.proposedComment;
        const ddl = proposal.columnName
          ? buildColumnCommentDDL(proposal.tableFqn, proposal.columnName, comment, tblType)
          : buildTableCommentDDL(proposal.tableFqn, comment);

        try {
          await executeSQL(ddl);
          return { proposalId: proposal.id, success: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { proposalId: proposal.id, success: false, error: msg };
        }
      }),
    );

    const appliedIds: string[] = [];

    for (let j = 0; j < batchResults.length; j++) {
      const settled = batchResults[j];
      const proposal = batch[j];

      if (settled.status === "fulfilled" && settled.value.success) {
        appliedIds.push(settled.value.proposalId);
        result.applied++;
      } else {
        const errorMsg =
          settled.status === "fulfilled"
            ? settled.value.error!
            : settled.reason instanceof Error
              ? settled.reason.message
              : String(settled.reason);

        const isSkipped = settled.status === "fulfilled" && "skipped" in settled.value && settled.value.skipped;
        if (isSkipped) {
          result.skipped++;
        } else {
          result.failed++;
        }
        result.errors.push({
          proposalId: proposal.id,
          tableFqn: proposal.tableFqn,
          columnName: proposal.columnName,
          error: errorMsg,
        });

        await markProposalFailed(proposal.id, errorMsg).catch(() => {});
      }

      completed++;
    }

    if (appliedIds.length > 0) {
      await markProposalsApplied(appliedIds);
    }

    onProgress?.(completed, proposals.length);

    if (i + APPLY_CONCURRENCY < proposals.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  const finalStatus = result.failed === 0 && result.skipped === 0 ? "completed" : "ready";
  await updateCommentJobStatus(jobId, finalStatus, {
    appliedCount: result.applied,
    errorMessage: result.failed > 0 ? `${result.failed} proposals failed to apply` : undefined,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Undo proposals
// ---------------------------------------------------------------------------

/**
 * Undo previously applied proposals by restoring original comments.
 * Correctly handles null (no comment) vs empty string (empty comment).
 */
export async function undoProposals(
  jobId: string,
  proposals: CommentProposal[],
  tableTypes?: Map<string, string>,
  onProgress?: (undone: number, total: number) => void,
): Promise<ApplyResult> {
  const result: ApplyResult = { applied: 0, failed: 0, skipped: 0, errors: [] };
  let completed = 0;

  for (let i = 0; i < proposals.length; i += APPLY_CONCURRENCY) {
    const batch = proposals.slice(i, i + APPLY_CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (proposal) => {
        const tblType = tableTypes?.get(proposal.tableFqn.toLowerCase());
        const ddl = proposal.columnName
          ? buildColumnCommentDDL(proposal.tableFqn, proposal.columnName, proposal.originalComment, tblType)
          : buildTableCommentDDL(proposal.tableFqn, proposal.originalComment);

        try {
          await executeSQL(ddl);
          return { proposalId: proposal.id, success: true };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return { proposalId: proposal.id, success: false, error: msg };
        }
      }),
    );

    const undoneIds: string[] = [];

    for (let j = 0; j < batchResults.length; j++) {
      const settled = batchResults[j];
      const proposal = batch[j];

      if (settled.status === "fulfilled" && settled.value.success) {
        undoneIds.push(settled.value.proposalId);
        result.applied++;
      } else {
        const errorMsg =
          settled.status === "fulfilled"
            ? settled.value.error!
            : settled.reason instanceof Error
              ? settled.reason.message
              : String(settled.reason);

        result.failed++;
        result.errors.push({
          proposalId: proposal.id,
          tableFqn: proposal.tableFqn,
          columnName: proposal.columnName,
          error: errorMsg,
        });
      }

      completed++;
    }

    if (undoneIds.length > 0) {
      await markProposalsUndone(undoneIds);
    }

    onProgress?.(completed, proposals.length);

    if (i + APPLY_CONCURRENCY < proposals.length) {
      await new Promise((r) => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
    }
  }

  return result;
}

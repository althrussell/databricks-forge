/**
 * AI Comment generation engine.
 *
 * Two entry paths:
 * 1. From existing estate scan / pipeline run data (pre-populated, no LLM call).
 * 2. Fresh generation from UC metadata + LLM.
 *
 * Both paths produce CommentProposal rows persisted to Lakebase.
 */

import { type ChatMessage } from "@/lib/dbx/model-serving";
import { getFastServingEndpoint } from "@/lib/dbx/client";
import { cachedChatCompletion } from "@/lib/genie/llm-cache";
import { mapWithConcurrency } from "@/lib/genie/concurrency";
import { parseLLMJson } from "@/lib/genie/passes/parse-llm-json";
import { listColumns, fetchTableComments } from "@/lib/queries/metadata";
import { buildIndustryContextPrompt } from "@/lib/domain/industry-outcomes-server";
import { createProposals } from "@/lib/lakebase/comment-proposals";
import { updateCommentJobStatus } from "@/lib/lakebase/comment-jobs";
import { TABLE_COMMENT_PROMPT, COLUMN_COMMENT_PROMPT } from "./templates-comments";
import { logger } from "@/lib/logger";
import type { ColumnInfo } from "@/lib/domain/types";

const TABLE_BATCH_SIZE = 15;
const COLUMN_BATCH_CONCURRENCY = 8;
const TEMPERATURE = 0.2;

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
 * Run full LLM-powered comment generation for the given scope.
 * Writes proposals to Lakebase and updates the job record.
 */
export async function generateComments(
  input: GenerateCommentsInput,
): Promise<GenerateCommentsResult> {
  const { jobId, catalogs, schemas, tables, industryId, businessContext, signal, onProgress } =
    input;
  const endpoint = getFastServingEndpoint();

  try {
    await updateCommentJobStatus(jobId, "generating");
    onProgress?.("metadata", 0, "Fetching table metadata from Unity Catalog...");

    // --- 1. Fetch metadata ---
    const allColumns: ColumnInfo[] = [];
    const allComments = new Map<string, string>();

    for (const catalog of catalogs) {
      const schemaList = schemas ?? [undefined];
      for (const schema of schemaList) {
        const [cols, comments] = await Promise.all([
          listColumns(catalog, schema as string | undefined),
          fetchTableComments(catalog, schema as string | undefined),
        ]);
        for (const c of cols) allColumns.push(c);
        for (const [fqn, comment] of comments) allComments.set(fqn, comment);
      }
    }

    // Group columns by table
    const columnsByTable = new Map<string, ColumnInfo[]>();
    for (const col of allColumns) {
      const fqn = col.tableFqn.toLowerCase();
      if (!columnsByTable.has(fqn)) columnsByTable.set(fqn, []);
      columnsByTable.get(fqn)!.push(col);
    }

    // Determine target tables (filter if specific tables requested)
    let targetFqns = Array.from(columnsByTable.keys());
    if (tables && tables.length > 0) {
      const lowerSet = new Set(tables.map((t) => t.toLowerCase()));
      targetFqns = targetFqns.filter((fqn) => lowerSet.has(fqn));
    }

    if (targetFqns.length === 0) {
      await updateCommentJobStatus(jobId, "ready", { tableCount: 0, columnCount: 0 });
      return { tableCount: 0, columnCount: 0 };
    }

    onProgress?.("metadata", 100, `Found ${targetFqns.length} tables`);

    // --- 2. Build industry context ---
    let industryContext = "";
    if (industryId) {
      industryContext = await buildIndustryContextPrompt(industryId);
    }

    // --- 3. Generate table comments ---
    onProgress?.("tables", 0, "Generating table descriptions...");

    const tableBatches: string[][] = [];
    for (let i = 0; i < targetFqns.length; i += TABLE_BATCH_SIZE) {
      tableBatches.push(targetFqns.slice(i, i + TABLE_BATCH_SIZE));
    }

    const tableDescriptions = new Map<string, string>();
    let batchIdx = 0;

    for (const batch of tableBatches) {
      if (signal?.aborted) throw new Error("Cancelled");

      const tableList = batch
        .map((fqn) => {
          const cols = columnsByTable.get(fqn) ?? [];
          const colNames = cols
            .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
            .map((c) => `${c.columnName} (${c.dataType})`)
            .join(", ");
          const existing = allComments.get(fqn) ?? allComments.get(fqn.toLowerCase());
          const existingLine = existing ? `  Current comment: "${existing}"` : "";
          return `- ${fqn}: [${colNames}]${existingLine}`;
        })
        .join("\n");

      const prompt = TABLE_COMMENT_PROMPT.replace("{industry_context}", industryContext)
        .replace("{business_context}", businessContext ?? "")
        .replace("{table_list}", tableList)
        .replace("{lineage_context}", "");

      const messages: ChatMessage[] = [{ role: "user", content: prompt }];

      try {
        const resp = await cachedChatCompletion({
          endpoint,
          messages,
          temperature: TEMPERATURE,
          responseFormat: "json_object",
          signal,
        });

        const parsed = parseLLMJson(resp.content, "table-comments") as Array<{
          table_fqn: string;
          description: string;
        }>;

        for (const item of parsed) {
          if (item.table_fqn && item.description) {
            tableDescriptions.set(item.table_fqn.toLowerCase(), item.description);
          }
        }
      } catch (err) {
        logger.warn("[comment-generator] Table batch failed", {
          batch: batch.slice(0, 3),
          error: err instanceof Error ? err.message : String(err),
        });
      }

      batchIdx++;
      onProgress?.(
        "tables",
        Math.round((batchIdx / tableBatches.length) * 100),
        `${tableDescriptions.size} of ${targetFqns.length} tables`,
      );
    }

    // --- 4. Generate column comments (parallel per-table) ---
    onProgress?.("columns", 0, "Generating column descriptions...");

    const columnResults: Array<{ tableFqn: string; columnName: string; description: string }> = [];

    const columnTasks = targetFqns.map((fqn) => async () => {
      if (signal?.aborted) return [];

      const cols = columnsByTable.get(fqn) ?? [];
      if (cols.length === 0) return [];

      const tableDesc =
        tableDescriptions.get(fqn) ??
        allComments.get(fqn) ??
        "No description available";

      const columnList = cols
        .sort((a, b) => a.ordinalPosition - b.ordinalPosition)
        .map((c) => {
          const parts = [`- ${c.columnName}: ${c.dataType}${c.isNullable ? " (nullable)" : ""}`];
          if (c.comment) parts.push(`  Current comment: "${c.comment}"`);
          return parts.join("\n");
        })
        .join("\n");

      const prompt = COLUMN_COMMENT_PROMPT.replace("{industry_context}", industryContext)
        .replace("{table_fqn}", fqn)
        .replace("{table_description}", tableDesc)
        .replace("{column_list}", columnList);

      const messages: ChatMessage[] = [{ role: "user", content: prompt }];

      try {
        const resp = await cachedChatCompletion({
          endpoint,
          messages,
          temperature: TEMPERATURE,
          responseFormat: "json_object",
          signal,
        });

        const parsed = parseLLMJson(resp.content, "column-comments") as Array<{
          column_name: string;
          description: string | null;
        }>;

        return parsed
          .filter((item) => item.column_name && item.description)
          .map((item) => ({
            tableFqn: fqn,
            columnName: item.column_name,
            description: item.description!,
          }));
      } catch (err) {
        logger.warn("[comment-generator] Column batch failed", {
          table: fqn,
          error: err instanceof Error ? err.message : String(err),
        });
        return [];
      }
    });

    const columnBatchResults = await mapWithConcurrency(columnTasks, COLUMN_BATCH_CONCURRENCY);

    for (const batch of columnBatchResults) {
      for (const item of batch) {
        columnResults.push(item);
      }
    }

    onProgress?.("columns", 100, `${columnResults.length} column descriptions generated`);

    // --- 5. Persist proposals ---
    onProgress?.("saving", 0, "Saving proposals...");

    const proposals: Array<{
      tableFqn: string;
      columnName?: string | null;
      originalComment?: string | null;
      proposedComment: string;
    }> = [];

    // Table-level proposals
    for (const [fqn, description] of tableDescriptions) {
      const originalFqn = targetFqns.find((f) => f === fqn) ?? fqn;
      proposals.push({
        tableFqn: originalFqn,
        columnName: null,
        originalComment: allComments.get(fqn) ?? null,
        proposedComment: description,
      });
    }

    // Column-level proposals
    for (const item of columnResults) {
      const col = allColumns.find(
        (c) =>
          c.tableFqn.toLowerCase() === item.tableFqn.toLowerCase() &&
          c.columnName.toLowerCase() === item.columnName.toLowerCase(),
      );
      proposals.push({
        tableFqn: item.tableFqn,
        columnName: item.columnName,
        originalComment: col?.comment ?? null,
        proposedComment: item.description,
      });
    }

    if (proposals.length > 0) {
      await createProposals(jobId, proposals);
    }

    const tableCount = tableDescriptions.size;
    const columnCount = columnResults.length;

    await updateCommentJobStatus(jobId, "ready", { tableCount, columnCount });
    onProgress?.("done", 100, `${tableCount} table + ${columnCount} column descriptions ready`);

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

    // Column-level descriptions are not generated during estate scan;
    // the user can trigger fresh LLM generation via the full generation flow.
  }

  if (proposals.length > 0) {
    await createProposals(jobId, proposals);
  }

  const tableCount = proposals.filter((p) => !p.columnName).length;
  await updateCommentJobStatus(jobId, "ready", { tableCount, columnCount: 0 });

  return { tableCount, columnCount: 0 };
}

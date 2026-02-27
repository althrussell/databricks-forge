/**
 * Context builder for the Ask Forge assistant.
 *
 * Retrieves relevant information from the vector store and formats it
 * into structured context for the LLM. Combines RAG retrieval with
 * metadata lookups to provide comprehensive grounding.
 */

import { retrieveContext, formatRetrievedContext, provenanceLabel } from "@/lib/embeddings/retriever";
import type { RetrievedChunk } from "@/lib/embeddings/types";
import type { AssistantIntent } from "./intent";
import { isEmbeddingEnabled } from "@/lib/embeddings/config";
import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface TableEnrichment {
  tableFqn: string;
  owner: string | null;
  numRows: string | null;
  sizeInBytes: string | null;
  lastModified: string | null;
  createdBy: string | null;
  dataDomain: string | null;
  dataTier: string | null;
  healthScore: number | null;
  issues: string[];
  recommendations: string[];
  lastWriteTimestamp: string | null;
  lastWriteOperation: string | null;
  upstreamTables: string[];
  downstreamTables: string[];
}

export interface AssistantContext {
  ragContext: string;
  chunks: RetrievedChunk[];
  conversationHistory: string;
  tables: string[];
  tableEnrichments: TableEnrichment[];
  hasDataGaps: boolean;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const INTENT_SCOPES: Record<AssistantIntent, string | undefined> = {
  business: undefined,
  technical: "estate",
  dashboard: undefined,
  navigation: undefined,
  exploration: undefined,
};

/**
 * Build full LLM context for the assistant, combining RAG retrieval
 * with conversation history.
 */
export async function buildAssistantContext(
  question: string,
  intent: AssistantIntent,
  history: ConversationTurn[] = [],
): Promise<AssistantContext> {
  let chunks: RetrievedChunk[] = [];
  let ragContext = "";

  if (isEmbeddingEnabled()) {
    const scope = INTENT_SCOPES[intent];
    chunks = await retrieveContext(question, {
      scope: scope as "estate" | "usecases" | "genie" | "insights" | "documents" | undefined,
      topK: 15,
      minScore: 0.35,
    });

    ragContext = formatRetrievedContext(chunks, 12000);

    logger.debug("[assistant/context] Built RAG context", {
      chunkCount: chunks.length,
      contextLength: ragContext.length,
      topScore: chunks[0]?.score,
    });
  }

  const tables = extractTableReferences(chunks);
  const tableEnrichments = await fetchTableEnrichments(tables);

  if (tableEnrichments.length > 0) {
    ragContext += "\n\n## Estate Metadata for Referenced Tables\n\n" + formatTableEnrichments(tableEnrichments);
  }

  const conversationHistory = formatConversationHistory(history);

  return {
    ragContext,
    chunks,
    conversationHistory,
    tables,
    tableEnrichments,
    hasDataGaps: chunks.length === 0,
  };
}

/**
 * Build numbered source references for citation in the LLM response.
 */
export function buildSourceReferences(chunks: RetrievedChunk[]): Array<{
  index: number;
  label: string;
  kind: string;
  sourceId: string;
  score: number;
  metadata: Record<string, unknown> | null;
}> {
  return chunks.slice(0, 10).map((chunk, i) => ({
    index: i + 1,
    label: provenanceLabel(chunk),
    kind: chunk.kind,
    sourceId: chunk.sourceId,
    score: chunk.score,
    metadata: chunk.metadata,
  }));
}

function extractTableReferences(chunks: RetrievedChunk[]): string[] {
  const tables = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.kind === "table_detail" || chunk.kind === "column_profile") {
      tables.add(chunk.sourceId);
    }
    const fqn = chunk.metadata?.tableFqn as string | undefined;
    if (fqn) tables.add(fqn);
  }
  return [...tables];
}

function formatConversationHistory(history: ConversationTurn[]): string {
  if (history.length === 0) return "";

  const recent = history.slice(-10);
  return recent
    .map((turn) => {
      const role = turn.role === "user" ? "User" : "Assistant";
      const content = turn.content.length > 500
        ? turn.content.slice(0, 500) + "…"
        : turn.content;
      return `**${role}:** ${content}`;
    })
    .join("\n\n");
}

/**
 * Fetch enrichment metadata (health, staleness, owner, lineage) for
 * a list of table FQNs directly from Lakebase. Best-effort -- returns
 * whatever is available without failing the overall context build.
 */
async function fetchTableEnrichments(fqns: string[]): Promise<TableEnrichment[]> {
  if (fqns.length === 0) return [];

  try {
    return await withPrisma(async (prisma) => {
      const [details, histories, lineage] = await Promise.all([
        prisma.forgeTableDetail.findMany({
          where: { tableFqn: { in: fqns } },
          orderBy: { scan: { createdAt: "desc" } },
          distinct: ["tableFqn"],
        }),
        prisma.forgeTableHistorySummary.findMany({
          where: { tableFqn: { in: fqns } },
          orderBy: { scan: { createdAt: "desc" } },
          distinct: ["tableFqn"],
        }),
        prisma.forgeTableLineage.findMany({
          where: {
            OR: [
              { sourceTableFqn: { in: fqns } },
              { targetTableFqn: { in: fqns } },
            ],
          },
        }),
      ]);

      const historyByFqn = new Map(histories.map((h) => [h.tableFqn, h]));

      const upstreamByFqn = new Map<string, string[]>();
      const downstreamByFqn = new Map<string, string[]>();
      for (const edge of lineage) {
        const ds = downstreamByFqn.get(edge.sourceTableFqn) ?? [];
        ds.push(edge.targetTableFqn);
        downstreamByFqn.set(edge.sourceTableFqn, ds);

        const us = upstreamByFqn.get(edge.targetTableFqn) ?? [];
        us.push(edge.sourceTableFqn);
        upstreamByFqn.set(edge.targetTableFqn, us);
      }

      return details.map((d) => {
        const h = historyByFqn.get(d.tableFqn);
        const issues = parseJsonArray(h?.issuesJson);
        const recommendations = parseJsonArray(h?.recommendationsJson);

        return {
          tableFqn: d.tableFqn,
          owner: d.owner,
          numRows: d.numRows ? String(d.numRows) : null,
          sizeInBytes: d.sizeInBytes ? String(d.sizeInBytes) : null,
          lastModified: d.lastModified ? new Date(d.lastModified).toISOString() : null,
          createdBy: d.createdBy,
          dataDomain: d.dataDomain,
          dataTier: d.dataTier,
          healthScore: h?.healthScore ?? null,
          issues,
          recommendations,
          lastWriteTimestamp: h?.lastWriteTimestamp ? new Date(h.lastWriteTimestamp).toISOString() : null,
          lastWriteOperation: h?.lastWriteOperation ?? null,
          upstreamTables: upstreamByFqn.get(d.tableFqn) ?? [],
          downstreamTables: downstreamByFqn.get(d.tableFqn) ?? [],
        };
      });
    });
  } catch (err) {
    logger.warn("[assistant/context] Failed to fetch table enrichments", { error: String(err) });
    return [];
  }
}

function parseJsonArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function formatTableEnrichments(enrichments: TableEnrichment[]): string {
  return enrichments
    .map((t) => {
      const parts = [`**${t.tableFqn}**`];
      if (t.owner) parts.push(`- Owner: ${t.owner}`);
      if (t.createdBy) parts.push(`- Created by: ${t.createdBy}`);
      if (t.dataDomain) parts.push(`- Domain: ${t.dataDomain}${t.dataTier ? ` (${t.dataTier})` : ""}`);
      if (t.numRows) parts.push(`- Rows: ${Number(t.numRows).toLocaleString()}`);
      if (t.sizeInBytes) parts.push(`- Size: ${formatBytes(Number(t.sizeInBytes))}`);
      if (t.healthScore !== null) parts.push(`- Health score: ${t.healthScore}/100`);
      if (t.lastModified) parts.push(`- Last modified: ${t.lastModified}`);
      if (t.lastWriteTimestamp) parts.push(`- Last write: ${t.lastWriteTimestamp} (${t.lastWriteOperation ?? "unknown op"})`);
      if (t.issues.length > 0) parts.push(`- Issues: ${t.issues.join("; ")}`);
      if (t.upstreamTables.length > 0) parts.push(`- Upstream: ${t.upstreamTables.join(", ")}`);
      if (t.downstreamTables.length > 0) parts.push(`- Downstream: ${t.downstreamTables.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

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
import { logger } from "@/lib/logger";

export interface AssistantContext {
  ragContext: string;
  chunks: RetrievedChunk[];
  conversationHistory: string;
  tables: string[];
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
  const conversationHistory = formatConversationHistory(history);

  return {
    ragContext,
    chunks,
    conversationHistory,
    tables,
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

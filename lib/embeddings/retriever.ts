/**
 * RAG retrieval module.
 *
 * Provides a simple interface for retrieving relevant context from
 * the embedding store. Used by pipeline steps to inject grounding
 * context from uploaded documents and past intelligence into LLM prompts.
 */

import { generateEmbedding } from "./client";
import { searchByVector } from "./store";
import type { EmbeddingKind, RetrievedChunk, SearchResult } from "./types";
import { SEARCH_SCOPES } from "./types";
import { isEmbeddingEnabled } from "./config";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RetrieveOptions {
  /** Restrict to specific embedding kinds. */
  kinds?: EmbeddingKind[];
  /** Use a named scope (maps to a set of kinds). */
  scope?: keyof typeof SEARCH_SCOPES;
  /** Maximum results to return. */
  topK?: number;
  /** Minimum similarity score (0-1). */
  minScore?: number;
  /** Filter by run. */
  runId?: string;
  /** Filter by scan. */
  scanId?: string;
  /** JSONB metadata filter. */
  metadataFilter?: Record<string, unknown>;
}

/**
 * Retrieve relevant chunks for a given natural-language query.
 * Embeds the query, searches the vector store, and returns
 * ranked results with content and metadata.
 */
export async function retrieveContext(
  query: string,
  opts: RetrieveOptions = {},
): Promise<RetrievedChunk[]> {
  if (!isEmbeddingEnabled()) return [];

  const queryVector = await generateEmbedding(query);

  const kinds = opts.kinds ?? (opts.scope ? SEARCH_SCOPES[opts.scope] : undefined);

  const results: SearchResult[] = await searchByVector(queryVector, {
    kinds: kinds as EmbeddingKind[] | undefined,
    runId: opts.runId,
    scanId: opts.scanId,
    metadataFilter: opts.metadataFilter,
    topK: opts.topK ?? 10,
    minScore: opts.minScore ?? 0.4,
  });

  logger.debug("[retriever] Retrieved chunks", {
    query: query.slice(0, 80),
    resultCount: results.length,
    topScore: results[0]?.score,
  });

  return results.map((r) => ({
    content: r.contentText,
    kind: r.kind,
    sourceId: r.sourceId,
    score: r.score,
    metadata: r.metadataJson,
  }));
}

/**
 * Format retrieved chunks into a string suitable for injection into
 * an LLM system prompt. Includes source attribution.
 */
export function formatRetrievedContext(
  chunks: RetrievedChunk[],
  maxChars: number = 8000,
): string {
  if (chunks.length === 0) return "";

  const parts: string[] = [];
  let totalChars = 0;

  for (const chunk of chunks) {
    const entry = `[${chunk.kind}] ${chunk.content}`;
    if (totalChars + entry.length > maxChars) break;
    parts.push(entry);
    totalChars += entry.length;
  }

  return parts.join("\n\n---\n\n");
}

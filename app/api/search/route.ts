/**
 * API: /api/search
 *
 * GET -- Semantic search across all embedded estate and pipeline data.
 *
 * Query params:
 *   q         (required)  Natural language search query
 *   scope     (optional)  estate | usecases | genie | insights | documents | all (default: all)
 *   runId     (optional)  Filter to a specific pipeline run
 *   scanId    (optional)  Filter to a specific estate scan
 *   catalog   (optional)  Filter by UC catalog
 *   domain    (optional)  Filter by data domain
 *   tier      (optional)  Filter by data tier
 *   topK      (optional)  Max results (default: 20, max: 100)
 *   minScore  (optional)  Minimum similarity score 0-1 (default: 0.3)
 */

import { NextRequest, NextResponse } from "next/server";
import { generateEmbedding } from "@/lib/embeddings/client";
import { searchByVector, embeddingsTableExists } from "@/lib/embeddings/store";
import { SEARCH_SCOPES, type EmbeddingKind } from "@/lib/embeddings/types";
import { isEmbeddingEnabled } from "@/lib/embeddings/config";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    if (!isEmbeddingEnabled()) {
      return NextResponse.json({
        results: [],
        total: 0,
        enabled: false,
        message: "Semantic search is not available. The embedding endpoint (serving-endpoint-embedding) is not configured.",
      });
    }

    const params = request.nextUrl.searchParams;
    const q = params.get("q");

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 },
      );
    }

    const tableExists = await embeddingsTableExists();
    if (!tableExists) {
      return NextResponse.json({
        results: [],
        total: 0,
        enabled: true,
        message: "Semantic search is not yet available. Run an estate scan or pipeline to generate embeddings.",
      });
    }

    const scope = (params.get("scope") || "all") as keyof typeof SEARCH_SCOPES;
    const kinds: readonly EmbeddingKind[] = SEARCH_SCOPES[scope] ?? SEARCH_SCOPES.all;

    const runId = params.get("runId") || undefined;
    const scanId = params.get("scanId") || undefined;
    const topK = Math.min(parseInt(params.get("topK") || "20", 10) || 20, 100);
    const minScore = parseFloat(params.get("minScore") || "0.3") || 0.3;

    const metadataFilter: Record<string, unknown> = {};
    const catalog = params.get("catalog");
    const domain = params.get("domain");
    const tier = params.get("tier");
    if (catalog) metadataFilter.catalog = catalog;
    if (domain) metadataFilter.domain = domain;
    if (tier) metadataFilter.tier = tier;

    const queryVector = await generateEmbedding(q.trim());

    const results = await searchByVector(queryVector, {
      kinds,
      runId,
      scanId,
      metadataFilter: Object.keys(metadataFilter).length > 0 ? metadataFilter : undefined,
      topK,
      minScore,
    });

    return NextResponse.json({
      results: results.map((r) => ({
        id: r.id,
        kind: r.kind,
        sourceId: r.sourceId,
        runId: r.runId,
        scanId: r.scanId,
        content: r.contentText,
        metadata: r.metadataJson,
        score: Math.round(r.score * 1000) / 1000,
      })),
      total: results.length,
      query: q.trim(),
      scope,
    });
  } catch (error) {
    logger.error("[api/search] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 },
    );
  }
}

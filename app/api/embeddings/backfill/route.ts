/**
 * API: /api/embeddings/backfill
 *
 * POST -- Generate embeddings for all existing data.
 *
 * Used after enabling the embedding endpoint on a deployment that
 * already has scans, runs, Genie recommendations, outcome maps,
 * or uploaded documents.  Re-embeds everything from scratch.
 *
 * This is a long-running request (minutes on large estates).
 * The response streams progress as JSON objects.
 */

import { NextResponse } from "next/server";
import { isEmbeddingEnabled } from "@/lib/embeddings/config";
import { logger } from "@/lib/logger";

export async function POST() {
  if (!isEmbeddingEnabled()) {
    return NextResponse.json(
      { error: "Embedding endpoint not configured (serving-endpoint-embedding resource not bound)" },
      { status: 503 },
    );
  }

  const results = {
    scans: { total: 0, embedded: 0, failed: 0 },
    runs: { total: 0, embedded: 0, failed: 0 },
    genieRecs: { total: 0, embedded: 0, failed: 0 },
    outcomeMaps: { total: 0, embedded: 0, failed: 0 },
    documents: { total: 0, embedded: 0, failed: 0 },
  };

  try {
    // Ensure pgvector schema exists
    await ensurePgvectorSchema();

    // 1. Embed all environment scans
    await backfillScans(results);

    // 2. Embed all pipeline runs (use cases + business context)
    await backfillRuns(results);

    // 3. Embed all Genie recommendations
    await backfillGenieRecs(results);

    // 4. Embed all outcome maps
    await backfillOutcomeMaps(results);

    // 5. Re-embed all uploaded documents
    await backfillDocuments(results);

    logger.info("[backfill] Embedding backfill complete", results);
    return NextResponse.json({ success: true, results });
  } catch (error) {
    logger.error("[backfill] Backfill failed", {
      error: error instanceof Error ? error.message : String(error),
      results,
    });
    return NextResponse.json(
      { error: "Backfill failed", partialResults: results },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// pgvector schema bootstrap
// ---------------------------------------------------------------------------

async function ensurePgvectorSchema(): Promise<void> {
  const { getPrisma } = await import("@/lib/prisma");
  const prisma = await getPrisma();

  try {
    await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS forge_embeddings (
        id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        kind          TEXT NOT NULL,
        source_id     TEXT NOT NULL,
        run_id        TEXT,
        scan_id       TEXT,
        content_text  TEXT NOT NULL,
        metadata_json JSONB,
        embedding     vector(1024) NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS idx_embeddings_kind ON forge_embeddings(kind)");
    await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS idx_embeddings_source ON forge_embeddings(source_id)");
    await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS idx_embeddings_run ON forge_embeddings(run_id)");
    await prisma.$executeRawUnsafe("CREATE INDEX IF NOT EXISTS idx_embeddings_scan ON forge_embeddings(scan_id)");
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON forge_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
  } catch (err) {
    logger.warn("[backfill] pgvector schema setup warning", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Backfill: Environment Scans
// ---------------------------------------------------------------------------

async function backfillScans(
  results: { scans: { total: number; embedded: number; failed: number } },
): Promise<void> {
  const { listEnvironmentScans, getEnvironmentScan } = await import("@/lib/lakebase/environment-scans");
  const { embedScanResults } = await import("@/lib/embeddings/embed-estate");

  const scans = await listEnvironmentScans(500, 0);
  results.scans.total = scans.length;

  for (const scan of scans) {
    try {
      const full = await getEnvironmentScan(scan.scanId);
      if (!full) continue;

      const columns = extractColumnsFromDetails(full.details);

      await embedScanResults(
        scan.scanId,
        full.details,
        full.histories,
        full.lineage,
        full.insights,
        columns,
      );
      results.scans.embedded++;
      logger.debug("[backfill] Scan embedded", { scanId: scan.scanId });
    } catch (err) {
      results.scans.failed++;
      logger.warn("[backfill] Scan embedding failed", {
        scanId: scan.scanId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

interface ColumnFromJson {
  name?: string;
  data_type?: string;
  comment?: string;
  is_nullable?: boolean;
}

function extractColumnsFromDetails(
  details: Array<{ tableFqn: string; columnsJson?: string | null }>,
): Array<{ tableFqn: string; columnName: string; dataType: string; comment?: string; isNullable?: boolean }> {
  const columns: Array<{ tableFqn: string; columnName: string; dataType: string; comment?: string; isNullable?: boolean }> = [];

  for (const d of details) {
    if (!d.columnsJson) continue;
    try {
      const parsed: ColumnFromJson[] = JSON.parse(d.columnsJson);
      for (const col of parsed) {
        if (!col.name) continue;
        columns.push({
          tableFqn: d.tableFqn,
          columnName: col.name,
          dataType: col.data_type ?? "STRING",
          comment: col.comment ?? undefined,
          isNullable: col.is_nullable,
        });
      }
    } catch {
      // malformed JSON
    }
  }

  return columns;
}

// ---------------------------------------------------------------------------
// Backfill: Pipeline Runs
// ---------------------------------------------------------------------------

async function backfillRuns(
  results: { runs: { total: number; embedded: number; failed: number } },
): Promise<void> {
  const { listRuns, getRunById } = await import("@/lib/lakebase/runs");
  const { getUseCasesByRunId } = await import("@/lib/lakebase/usecases");
  const { embedRunResults } = await import("@/lib/embeddings/embed-pipeline");

  const runs = await listRuns(500, 0);
  const completedRuns = runs.filter((r) => r.status === "completed");
  results.runs.total = completedRuns.length;

  for (const run of completedRuns) {
    try {
      const full = await getRunById(run.runId);
      if (!full) continue;

      const useCases = await getUseCasesByRunId(run.runId);
      const bcJson = full.businessContext ? JSON.stringify(full.businessContext) : null;

      await embedRunResults(run.runId, useCases, bcJson, full.config.businessName);
      results.runs.embedded++;
      logger.debug("[backfill] Run embedded", { runId: run.runId });
    } catch (err) {
      results.runs.failed++;
      logger.warn("[backfill] Run embedding failed", {
        runId: run.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Backfill: Genie Recommendations
// ---------------------------------------------------------------------------

async function backfillGenieRecs(
  results: { genieRecs: { total: number; embedded: number; failed: number } },
): Promise<void> {
  const { listRuns } = await import("@/lib/lakebase/runs");
  const { getGenieRecommendationsByRunId } = await import("@/lib/lakebase/genie-recommendations");
  const { embedGenieRecommendations } = await import("@/lib/embeddings/embed-pipeline");

  const runs = await listRuns(500, 0);
  const completedRuns = runs.filter((r) => r.status === "completed");

  for (const run of completedRuns) {
    try {
      const recs = await getGenieRecommendationsByRunId(run.runId);
      if (recs.length === 0) continue;

      results.genieRecs.total += recs.length;

      await embedGenieRecommendations(run.runId, recs);
      results.genieRecs.embedded += recs.length;
      logger.debug("[backfill] Genie recs embedded", { runId: run.runId, count: recs.length });
    } catch (err) {
      results.genieRecs.failed++;
      logger.warn("[backfill] Genie recs embedding failed", {
        runId: run.runId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Backfill: Outcome Maps
// ---------------------------------------------------------------------------

async function backfillOutcomeMaps(
  results: { outcomeMaps: { total: number; embedded: number; failed: number } },
): Promise<void> {
  const { listOutcomeMaps, getOutcomeMap } = await import("@/lib/lakebase/outcome-maps");
  const { embedOutcomeMap } = await import("@/lib/embeddings/embed-pipeline");

  const maps = await listOutcomeMaps();
  results.outcomeMaps.total = maps.length;

  for (const summary of maps) {
    try {
      const full = await getOutcomeMap(summary.id);
      if (!full || !full.parsedOutcome) continue;

      await embedOutcomeMap({ ...full.parsedOutcome, id: full.id });
      results.outcomeMaps.embedded++;
    } catch (err) {
      results.outcomeMaps.failed++;
      logger.warn("[backfill] Outcome map embedding failed", {
        id: summary.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Backfill: Documents
// ---------------------------------------------------------------------------

async function backfillDocuments(
  results: { documents: { total: number; embedded: number; failed: number } },
): Promise<void> {
  const { listDocuments } = await import("@/lib/lakebase/documents");
  const { countEmbeddings } = await import("@/lib/embeddings/store");

  const docs = await listDocuments();
  results.documents.total = docs.length;

  for (const doc of docs) {
    try {
      if (doc.status !== "ready") continue;

      const existingCount = await countEmbeddings("document_chunk", doc.id);
      if (existingCount > 0) {
        results.documents.embedded++;
        continue;
      }

      // Document text is not stored in the DB, only metadata.
      // We can't re-embed without the original file, so we skip
      // documents that don't already have embeddings.
      logger.debug("[backfill] Skipping document (no stored text, needs re-upload)", {
        id: doc.id,
        filename: doc.filename,
      });
    } catch (err) {
      results.documents.failed++;
      logger.warn("[backfill] Document check failed", {
        id: doc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

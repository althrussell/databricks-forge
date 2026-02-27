/**
 * pgvector CRUD operations for the forge_embeddings table.
 *
 * All vector operations use raw SQL ($queryRawUnsafe / $executeRawUnsafe)
 * because Prisma does not natively support the pgvector vector(N) type.
 *
 * The HNSW index on `embedding vector_cosine_ops` enables sub-50ms
 * approximate nearest-neighbour queries at the volumes we operate at.
 */

import { getPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type {
  EmbeddingInput,
  EmbeddingKind,
  SearchResult,
} from "./types";

// ---------------------------------------------------------------------------
// Insert / Upsert
// ---------------------------------------------------------------------------

/**
 * Insert a batch of embedding records. Generates UUIDs server-side.
 */
export async function insertEmbeddings(
  inputs: EmbeddingInput[],
): Promise<number> {
  if (inputs.length === 0) return 0;

  const prisma = await getPrisma();
  let inserted = 0;

  const BATCH_SIZE = 50;
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);

    const values = batch
      .map((inp) => {
        const meta = inp.metadataJson
          ? `'${JSON.stringify(inp.metadataJson).replace(/'/g, "''")}'::jsonb`
          : "NULL";
        const runId = inp.runId ? `'${inp.runId}'` : "NULL";
        const scanId = inp.scanId ? `'${inp.scanId}'` : "NULL";
        const text = inp.contentText.replace(/'/g, "''");
        const vec = `'[${inp.embedding.join(",")}]'::vector`;
        return `(gen_random_uuid(), '${inp.kind}', '${inp.sourceId}', ${runId}, ${scanId}, '${text}', ${meta}, ${vec}, NOW())`;
      })
      .join(",\n");

    await prisma.$executeRawUnsafe(`
      INSERT INTO forge_embeddings (id, kind, source_id, run_id, scan_id, content_text, metadata_json, embedding, created_at)
      VALUES ${values}
    `);

    inserted += batch.length;
  }

  logger.debug("[embeddings] Inserted records", { count: inserted });
  return inserted;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/** Delete all embeddings for a given scan. */
export async function deleteEmbeddingsByScan(scanId: string): Promise<number> {
  const prisma = await getPrisma();
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM forge_embeddings WHERE scan_id = '${scanId}'`,
  );
  logger.debug("[embeddings] Deleted by scan", { scanId, count: result });
  return result;
}

/** Delete all embeddings for a given run. */
export async function deleteEmbeddingsByRun(runId: string): Promise<number> {
  const prisma = await getPrisma();
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM forge_embeddings WHERE run_id = '${runId}'`,
  );
  logger.debug("[embeddings] Deleted by run", { runId, count: result });
  return result;
}

/** Delete all embeddings for a given source record. */
export async function deleteEmbeddingsBySource(
  sourceId: string,
): Promise<number> {
  const prisma = await getPrisma();
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM forge_embeddings WHERE source_id = '${sourceId}'`,
  );
  return result;
}

/** Delete ALL embeddings (factory reset). */
export async function deleteAllEmbeddings(): Promise<number> {
  const prisma = await getPrisma();
  try {
    const result = await prisma.$executeRawUnsafe(`TRUNCATE TABLE forge_embeddings`);
    logger.debug("[embeddings] Truncated all embeddings");
    return result;
  } catch {
    // TRUNCATE may fail if table doesn't exist; fall back to DELETE
    try {
      const result = await prisma.$executeRawUnsafe(`DELETE FROM forge_embeddings`);
      logger.debug("[embeddings] Deleted all embeddings", { count: result });
      return result;
    } catch {
      logger.debug("[embeddings] forge_embeddings table does not exist");
      return 0;
    }
  }
}

/** Delete all embeddings of a given kind for a scan. */
export async function deleteEmbeddingsByKindAndScan(
  kind: EmbeddingKind,
  scanId: string,
): Promise<number> {
  const prisma = await getPrisma();
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM forge_embeddings WHERE kind = '${kind}' AND scan_id = '${scanId}'`,
  );
  return result;
}

/** Delete all embeddings of a given kind for a run. */
export async function deleteEmbeddingsByKindAndRun(
  kind: EmbeddingKind,
  runId: string,
): Promise<number> {
  const prisma = await getPrisma();
  const result = await prisma.$executeRawUnsafe(
    `DELETE FROM forge_embeddings WHERE kind = '${kind}' AND run_id = '${runId}'`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// Search (vector similarity)
// ---------------------------------------------------------------------------

/**
 * Search embeddings by vector similarity using pgvector's <=> operator
 * (cosine distance). Returns results sorted by descending similarity score.
 */
export async function searchByVector(
  queryVector: number[],
  options: {
    kinds?: readonly EmbeddingKind[];
    runId?: string;
    scanId?: string;
    metadataFilter?: Record<string, unknown>;
    topK?: number;
    minScore?: number;
  } = {},
): Promise<SearchResult[]> {
  const prisma = await getPrisma();
  const topK = options.topK ?? 20;
  const minScore = options.minScore ?? 0.3;
  const vecLiteral = `'[${queryVector.join(",")}]'::vector`;

  const conditions: string[] = [];

  if (options.kinds && options.kinds.length > 0) {
    const kindsList = options.kinds.map((k) => `'${k}'`).join(",");
    conditions.push(`kind IN (${kindsList})`);
  }

  if (options.runId) {
    conditions.push(`run_id = '${options.runId}'`);
  }

  if (options.scanId) {
    conditions.push(`scan_id = '${options.scanId}'`);
  }

  if (options.metadataFilter && Object.keys(options.metadataFilter).length > 0) {
    const filterJson = JSON.stringify(options.metadataFilter).replace(/'/g, "''");
    conditions.push(`metadata_json @> '${filterJson}'::jsonb`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const rows: Array<{
    id: string;
    kind: string;
    source_id: string;
    run_id: string | null;
    scan_id: string | null;
    content_text: string;
    metadata_json: Record<string, unknown> | null;
    score: number;
  }> = await prisma.$queryRawUnsafe(`
    SELECT
      id,
      kind,
      source_id,
      run_id,
      scan_id,
      content_text,
      metadata_json,
      1 - (embedding <=> ${vecLiteral}) AS score
    FROM forge_embeddings
    ${whereClause}
    ORDER BY embedding <=> ${vecLiteral}
    LIMIT ${topK}
  `);

  return rows
    .filter((r) => r.score >= minScore)
    .map((r) => ({
      id: r.id,
      kind: r.kind as EmbeddingKind,
      sourceId: r.source_id,
      runId: r.run_id,
      scanId: r.scan_id,
      contentText: r.content_text,
      metadataJson: r.metadata_json,
      score: r.score,
    }));
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/** Count embeddings, optionally filtered by kind. */
export async function countEmbeddings(
  kind?: EmbeddingKind,
  sourceId?: string,
): Promise<number> {
  const prisma = await getPrisma();
  const conditions: string[] = [];
  if (kind) conditions.push(`kind = '${kind}'`);
  if (sourceId) conditions.push(`source_id = '${sourceId}'`);
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows: Array<{ count: bigint }> = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) as count FROM forge_embeddings ${whereClause}`,
  );
  return Number(rows[0]?.count ?? 0);
}

/** Check if the forge_embeddings table exists. */
export async function embeddingsTableExists(): Promise<boolean> {
  const prisma = await getPrisma();
  try {
    const rows: Array<{ exists: boolean }> = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'forge_embeddings'
      ) AS exists
    `);
    return rows[0]?.exists ?? false;
  } catch {
    return false;
  }
}

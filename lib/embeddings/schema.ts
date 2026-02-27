/**
 * Raw SQL for pgvector schema management.
 *
 * Called during startup (after prisma db push) to ensure the vector
 * extension and forge_embeddings table exist. All statements are
 * idempotent (IF NOT EXISTS).
 *
 * Prisma does not natively support the pgvector `vector(N)` type,
 * so this table is managed outside of the Prisma schema.
 */

import { getPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const EMBEDDING_DIM = 1024;

/**
 * Ensure the pgvector extension and forge_embeddings table exist.
 * Safe to call on every startup -- all statements are idempotent.
 */
export async function ensureEmbeddingSchema(): Promise<void> {
  const prisma = await getPrisma();

  try {
    await prisma.$executeRawUnsafe(
      `CREATE EXTENSION IF NOT EXISTS vector`
    );
    logger.info("[embeddings] pgvector extension ensured");
  } catch (err) {
    logger.warn("[embeddings] Failed to create pgvector extension (may already exist)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS forge_embeddings (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
      kind          TEXT NOT NULL,
      source_id     TEXT NOT NULL,
      run_id        TEXT,
      scan_id       TEXT,
      content_text  TEXT NOT NULL,
      metadata_json JSONB,
      embedding     vector(${EMBEDDING_DIM}) NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_embeddings_kind ON forge_embeddings(kind)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_embeddings_source ON forge_embeddings(source_id)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_embeddings_run ON forge_embeddings(run_id)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE INDEX IF NOT EXISTS idx_embeddings_scan ON forge_embeddings(scan_id)`
  );

  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON forge_embeddings
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    `);
  } catch (err) {
    logger.warn("[embeddings] HNSW index creation skipped (may already exist)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  logger.info("[embeddings] Schema ensured (forge_embeddings table + HNSW index)");
}

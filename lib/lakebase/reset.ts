/**
 * Factory-reset helper — deletes all application data from Lakebase.
 *
 * Deleting all ForgeRun rows cascades to 10+ child tables (use cases,
 * exports, prompt logs, Genie data, dashboards, background jobs, etc.).
 * Environment scans are deleted explicitly first because standalone
 * scans (runId = null) are not linked to any run and would survive
 * the cascade. Scan children (details, histories, lineage, insights)
 * cascade from the scan. The remaining standalone tables are wiped last.
 *
 * The forge_embeddings table (pgvector, managed outside Prisma) and the
 * forge_documents table are also truncated so no stale vectors or
 * uploaded documents survive a factory reset.
 */

import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function deleteAllData(): Promise<void> {
  await withPrisma(async (prisma) => {
    // Truncate the pgvector embeddings table (not managed by Prisma)
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE forge_embeddings`);
    } catch {
      // Table may not exist yet if pgvector was never initialised
      try {
        await prisma.$executeRawUnsafe(`DELETE FROM forge_embeddings`);
      } catch {
        logger.debug("[reset] forge_embeddings table does not exist, skipping");
      }
    }

    await prisma.$transaction([
      prisma.forgeEnvironmentScan.deleteMany(),
      prisma.forgeRun.deleteMany(),
      prisma.forgeMetadataCache.deleteMany(),
      prisma.forgePromptTemplate.deleteMany(),
      prisma.forgeActivityLog.deleteMany(),
      prisma.forgeOutcomeMap.deleteMany(),
      prisma.forgeDocument.deleteMany(),
    ]);
  });
}

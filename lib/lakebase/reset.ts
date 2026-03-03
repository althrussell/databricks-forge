/**
 * Factory-reset helper — deletes ALL application data from Lakebase.
 *
 * Deleting ForgeRun rows cascades to 10+ child tables (use cases,
 * exports, prompt logs, Genie data, dashboards, background jobs, etc.).
 * Environment scans cascade to details, histories, lineage, and insights.
 *
 * Standalone tables (no cascade parent) are deleted explicitly:
 * metadata cache, prompt templates, activity logs, outcome maps,
 * documents, conversations, assistant logs, benchmark records, and
 * metadata genie spaces.
 *
 * The forge_embeddings table (pgvector, managed outside Prisma) is
 * also truncated so no stale vectors survive a factory reset.
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
      prisma.forgeConversation.deleteMany(),
      prisma.forgeAssistantLog.deleteMany(),
      prisma.forgeBenchmarkRecord.deleteMany(),
      prisma.forgeMetadataGenieSpace.deleteMany(),
    ]);
  });
}

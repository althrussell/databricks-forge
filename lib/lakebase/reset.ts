/**
 * Factory-reset helper — deletes all application data from Lakebase.
 *
 * Deleting all ForgeRun rows cascades to 10+ child tables (use cases,
 * exports, prompt logs, Genie data, dashboards, environment scans, etc.).
 * The four standalone tables are wiped explicitly.
 */

import { withPrisma } from "@/lib/prisma";

export async function deleteAllData(): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.$transaction([
      prisma.forgeRun.deleteMany(),
      prisma.forgeMetadataCache.deleteMany(),
      prisma.forgePromptTemplate.deleteMany(),
      prisma.forgeActivityLog.deleteMany(),
      prisma.forgeOutcomeMap.deleteMany(),
    ]);
  });
}

/**
 * Factory-reset helper — deletes all application data from Lakebase.
 *
 * Deleting all ForgeRun rows cascades to 10+ child tables (use cases,
 * exports, prompt logs, Genie data, dashboards, background jobs, etc.).
 * Environment scans are deleted explicitly first because standalone
 * scans (runId = null) are not linked to any run and would survive
 * the cascade. Scan children (details, histories, lineage, insights)
 * cascade from the scan. The remaining standalone tables are wiped last.
 */

import { withPrisma } from "@/lib/prisma";

export async function deleteAllData(): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.$transaction([
      prisma.forgeEnvironmentScan.deleteMany(),
      prisma.forgeRun.deleteMany(),
      prisma.forgeMetadataCache.deleteMany(),
      prisma.forgePromptTemplate.deleteMany(),
      prisma.forgeActivityLog.deleteMany(),
      prisma.forgeOutcomeMap.deleteMany(),
    ]);
  });
}

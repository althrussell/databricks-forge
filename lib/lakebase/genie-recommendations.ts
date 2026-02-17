/**
 * CRUD operations for Genie Space Recommendations -- backed by Lakebase (Prisma).
 *
 * Recommendations are generated during the pipeline (step 8) and persisted
 * so the UI can display them immediately without on-demand recomputation.
 */

import { getPrisma } from "@/lib/prisma";
import type { GenieSpaceRecommendation } from "@/lib/genie/types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function dbRowToRecommendation(row: {
  id: string;
  runId: string;
  domain: string;
  subdomains: string | null;
  title: string;
  description: string;
  tableCount: number;
  metricViewCount: number;
  useCaseCount: number;
  sqlExampleCount: number;
  joinCount: number;
  measureCount: number;
  filterCount: number;
  dimensionCount: number;
  tables: string | null;
  metricViews: string | null;
  serializedSpace: string;
}): GenieSpaceRecommendation {
  return {
    domain: row.domain,
    subdomains: row.subdomains ? JSON.parse(row.subdomains) : [],
    title: row.title,
    description: row.description,
    tableCount: row.tableCount,
    metricViewCount: row.metricViewCount,
    useCaseCount: row.useCaseCount,
    sqlExampleCount: row.sqlExampleCount,
    joinCount: row.joinCount,
    measureCount: row.measureCount,
    filterCount: row.filterCount,
    dimensionCount: row.dimensionCount,
    tables: row.tables ? JSON.parse(row.tables) : [],
    metricViews: row.metricViews ? JSON.parse(row.metricViews) : [],
    serializedSpace: row.serializedSpace,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** List all stored Genie recommendations for a run. */
export async function getGenieRecommendationsByRunId(
  runId: string
): Promise<GenieSpaceRecommendation[]> {
  const prisma = await getPrisma();
  const rows = await prisma.forgeGenieRecommendation.findMany({
    where: { runId },
    orderBy: { useCaseCount: "desc" },
  });
  return rows.map(dbRowToRecommendation);
}

// ---------------------------------------------------------------------------
// Write (bulk upsert -- called from pipeline step)
// ---------------------------------------------------------------------------

/** Persist Genie recommendations for a run (delete-and-insert in a transaction). */
export async function saveGenieRecommendations(
  runId: string,
  recommendations: GenieSpaceRecommendation[]
): Promise<void> {
  const prisma = await getPrisma();

  await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
    // Clear any previous recommendations for this run
    await tx.forgeGenieRecommendation.deleteMany({ where: { runId } });

    if (recommendations.length === 0) return;

    await tx.forgeGenieRecommendation.createMany({
      data: recommendations.map((rec, idx) => ({
        id: `${runId}_genie_${idx}`,
        runId,
        domain: rec.domain,
        subdomains: JSON.stringify(rec.subdomains),
        title: rec.title,
        description: rec.description,
        tableCount: rec.tableCount,
        metricViewCount: rec.metricViewCount,
        useCaseCount: rec.useCaseCount,
        sqlExampleCount: rec.sqlExampleCount,
        joinCount: rec.joinCount,
        measureCount: rec.measureCount,
        filterCount: rec.filterCount,
        dimensionCount: rec.dimensionCount,
        tables: JSON.stringify(rec.tables),
        metricViews: JSON.stringify(rec.metricViews),
        serializedSpace: rec.serializedSpace,
      })),
    });
  });
}

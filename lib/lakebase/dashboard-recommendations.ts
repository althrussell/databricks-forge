/**
 * CRUD operations for Dashboard Recommendations -- backed by Lakebase (Prisma).
 *
 * Recommendations are generated during the pipeline and persisted
 * so the UI can display them immediately without on-demand recomputation.
 */

import { withPrisma } from "@/lib/prisma";
import type { DashboardRecommendation } from "@/lib/dashboard/types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

interface DbRow {
  id: string;
  runId: string;
  domain: string;
  subdomains: string | null;
  title: string;
  description: string;
  datasetCount: number;
  widgetCount: number;
  useCaseIds: string | null;
  serializedDashboard: string;
  dashboardDesign: string | null;
  recommendationType: string;
  existingAssetId: string | null;
  changeSummary: string | null;
}

function dbRowToRecommendation(row: DbRow): DashboardRecommendation {
  return {
    domain: row.domain,
    subdomains: row.subdomains ? JSON.parse(row.subdomains) : [],
    title: row.title,
    description: row.description,
    datasetCount: row.datasetCount,
    widgetCount: row.widgetCount,
    useCaseIds: row.useCaseIds ? JSON.parse(row.useCaseIds) : [],
    serializedDashboard: row.serializedDashboard,
    dashboardDesign: row.dashboardDesign ? JSON.parse(row.dashboardDesign) : { title: row.title, description: row.description, datasets: [], widgets: [] },
    recommendationType: (row.recommendationType as "new" | "enhancement" | "replacement") ?? "new",
    existingAssetId: row.existingAssetId ?? undefined,
    changeSummary: row.changeSummary ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getDashboardRecommendationsByRunId(
  runId: string
): Promise<DashboardRecommendation[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeDashboardRecommendation.findMany({
      where: { runId },
      orderBy: { widgetCount: "desc" },
    });
    return rows.map(dbRowToRecommendation);
  });
}

// ---------------------------------------------------------------------------
// Write (bulk upsert -- called from pipeline step)
// ---------------------------------------------------------------------------

export async function saveDashboardRecommendations(
  runId: string,
  recommendations: DashboardRecommendation[],
  replaceDomains?: string[]
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      if (replaceDomains?.length) {
        await tx.forgeDashboardRecommendation.deleteMany({
          where: { runId, domain: { in: replaceDomains } },
        });
      } else {
        await tx.forgeDashboardRecommendation.deleteMany({ where: { runId } });
      }

      if (recommendations.length === 0) return;

      await tx.forgeDashboardRecommendation.createMany({
        data: recommendations.map((rec) => {
          const id = `${runId}_dash_${rec.domain.toLowerCase().replace(/\s+/g, "_")}`;
          return {
            id,
            runId,
            domain: rec.domain,
            subdomains: JSON.stringify(rec.subdomains),
            title: rec.title,
            description: rec.description,
            datasetCount: rec.datasetCount,
            widgetCount: rec.widgetCount,
            useCaseIds: JSON.stringify(rec.useCaseIds),
            serializedDashboard: rec.serializedDashboard,
            dashboardDesign: JSON.stringify(rec.dashboardDesign),
            recommendationType: rec.recommendationType ?? "new",
            existingAssetId: rec.existingAssetId ?? null,
            changeSummary: rec.changeSummary ?? null,
          };
        }),
      });
    });
  });
}

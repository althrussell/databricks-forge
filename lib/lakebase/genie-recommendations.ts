/**
 * CRUD operations for Genie Space Recommendations -- backed by Lakebase (Prisma).
 *
 * Recommendations are generated during the pipeline (step 8) and persisted
 * so the UI can display them immediately without on-demand recomputation.
 */

import { withPrisma } from "@/lib/prisma";
import type { GenieSpaceRecommendation, GenieEngineRecommendation, GenieEnginePassOutputs } from "@/lib/genie/types";

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
  benchmarks: string | null;
  columnEnrichments: string | null;
  metricViewProposals: string | null;
  trustedFunctions: string | null;
  engineConfigVersion: number;
}

function dbRowToRecommendation(row: DbRow): GenieEngineRecommendation {
  let benchmarkCount = 0;
  let instructionCount = 0;
  let sampleQuestionCount = 0;
  try {
    const space = JSON.parse(row.serializedSpace);
    benchmarkCount = space?.benchmarks?.questions?.length ?? 0;
    instructionCount = space?.instructions?.text_instructions?.length ?? 0;
    sampleQuestionCount = space?.config?.sample_questions?.length ?? 0;
  } catch {
    // serializedSpace is malformed -- counts stay at 0
  }

  // If no pre-existing metric views but we have proposals, reflect the proposal count
  const metricViewsArr: string[] = row.metricViews ? JSON.parse(row.metricViews) : [];
  let metricViewCount = row.metricViewCount;
  if (metricViewCount === 0 && row.metricViewProposals) {
    try {
      const proposals = JSON.parse(row.metricViewProposals);
      if (Array.isArray(proposals)) metricViewCount = proposals.length;
    } catch { /* ignore */ }
  }

  return {
    domain: row.domain,
    subdomains: row.subdomains ? JSON.parse(row.subdomains) : [],
    title: row.title,
    description: row.description,
    tableCount: row.tableCount,
    metricViewCount,
    useCaseCount: row.useCaseCount,
    sqlExampleCount: row.sqlExampleCount,
    joinCount: row.joinCount,
    measureCount: row.measureCount,
    filterCount: row.filterCount,
    dimensionCount: row.dimensionCount,
    benchmarkCount,
    instructionCount,
    sampleQuestionCount,
    sqlFunctionCount: 0,
    tables: row.tables ? JSON.parse(row.tables) : [],
    metricViews: metricViewsArr,
    serializedSpace: row.serializedSpace,
    benchmarks: row.benchmarks,
    columnEnrichments: row.columnEnrichments,
    metricViewProposals: row.metricViewProposals,
    trustedFunctions: row.trustedFunctions,
    engineConfigVersion: row.engineConfigVersion,
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** List all stored Genie recommendations for a run (includes engine-extended fields). */
export async function getGenieRecommendationsByRunId(
  runId: string
): Promise<GenieEngineRecommendation[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeGenieRecommendation.findMany({
      where: { runId },
      orderBy: { useCaseCount: "desc" },
    });
    return rows.map(dbRowToRecommendation);
  });
}

// ---------------------------------------------------------------------------
// Write (bulk upsert -- called from pipeline step)
// ---------------------------------------------------------------------------

/**
 * Persist Genie recommendations for a run.
 *
 * When `replaceDomains` is provided, only the listed domains are deleted and
 * re-inserted (partial merge). Otherwise all recommendations are replaced.
 */
export async function saveGenieRecommendations(
  runId: string,
  recommendations: GenieSpaceRecommendation[],
  passOutputs?: GenieEnginePassOutputs[],
  engineConfigVersion?: number,
  replaceDomains?: string[],
): Promise<void> {
  const outputsByDomain = new Map<string, GenieEnginePassOutputs>();
  if (passOutputs) {
    for (const po of passOutputs) {
      outputsByDomain.set(po.domain, po);
    }
  }

  await withPrisma(async (prisma) => {
    await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
      if (replaceDomains?.length) {
        await tx.forgeGenieRecommendation.deleteMany({
          where: { runId, domain: { in: replaceDomains } },
        });
      } else {
        await tx.forgeGenieRecommendation.deleteMany({ where: { runId } });
      }

      if (recommendations.length === 0) return;

      await tx.forgeGenieRecommendation.createMany({
        data: recommendations.map((rec, idx) => {
          const po = outputsByDomain.get(rec.domain);
          const id = replaceDomains?.length
            ? `${runId}_genie_${rec.domain.toLowerCase().replace(/\s+/g, "_")}`
            : `${runId}_genie_${idx}`;
          return {
            id,
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
            benchmarks: po ? JSON.stringify(po.benchmarkQuestions) : null,
            columnEnrichments: po ? JSON.stringify(po.columnEnrichments) : null,
            metricViewProposals: po ? JSON.stringify(po.metricViewProposals) : null,
            trustedFunctions: null,
            engineConfigVersion: engineConfigVersion ?? 0,
          };
        }),
      });
    });
  });
}

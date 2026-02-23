/**
 * CRUD operations for use cases — backed by Lakebase (Prisma).
 */

import { withPrisma } from "@/lib/prisma";
import type { UseCase, UseCaseType } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function parseTablesInvolved(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return raw.split(",").map((s) => s.trim());
  }
}

function dbRowToUseCase(row: {
  id: string;
  runId: string;
  useCaseNo: number | null;
  name: string | null;
  type: string | null;
  analyticsTechnique: string | null;
  statement: string | null;
  solution: string | null;
  businessValue: string | null;
  beneficiary: string | null;
  sponsor: string | null;
  domain: string | null;
  subdomain: string | null;
  tablesInvolved: string | null;
  priorityScore: number | null;
  feasibilityScore: number | null;
  impactScore: number | null;
  overallScore: number | null;
  userPriorityScore: number | null;
  userFeasibilityScore: number | null;
  userImpactScore: number | null;
  userOverallScore: number | null;
  sqlCode: string | null;
  sqlStatus: string | null;
}): UseCase {
  return {
    id: row.id,
    runId: row.runId,
    useCaseNo: row.useCaseNo ?? 0,
    name: row.name ?? "",
    type: (row.type as UseCaseType) ?? "AI",
    analyticsTechnique: row.analyticsTechnique ?? "",
    statement: row.statement ?? "",
    solution: row.solution ?? "",
    businessValue: row.businessValue ?? "",
    beneficiary: row.beneficiary ?? "",
    sponsor: row.sponsor ?? "",
    domain: row.domain ?? "",
    subdomain: row.subdomain ?? "",
    tablesInvolved: parseTablesInvolved(row.tablesInvolved),
    priorityScore: row.priorityScore ?? 0,
    feasibilityScore: row.feasibilityScore ?? 0,
    impactScore: row.impactScore ?? 0,
    overallScore: row.overallScore ?? 0,
    userPriorityScore: row.userPriorityScore ?? null,
    userFeasibilityScore: row.userFeasibilityScore ?? null,
    userImpactScore: row.userImpactScore ?? null,
    userOverallScore: row.userOverallScore ?? null,
    sqlCode: row.sqlCode ?? null,
    sqlStatus: row.sqlStatus ?? null,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a batch of use cases for a given run.
 */
export async function insertUseCases(useCases: UseCase[]): Promise<void> {
  if (useCases.length === 0) return;

  await withPrisma(async (prisma) => {
    await prisma.forgeUseCase.createMany({
      data: useCases.map((uc) => ({
        id: uc.id,
        runId: uc.runId,
        useCaseNo: uc.useCaseNo,
        name: uc.name,
        type: uc.type,
        analyticsTechnique: uc.analyticsTechnique,
        statement: uc.statement,
        solution: uc.solution,
        businessValue: uc.businessValue,
        beneficiary: uc.beneficiary,
        sponsor: uc.sponsor,
        domain: uc.domain,
        subdomain: uc.subdomain,
        tablesInvolved: JSON.stringify(uc.tablesInvolved),
        priorityScore: uc.priorityScore,
        feasibilityScore: uc.feasibilityScore,
        impactScore: uc.impactScore,
        overallScore: uc.overallScore,
        sqlCode: uc.sqlCode,
        sqlStatus: uc.sqlStatus,
      })),
      skipDuplicates: true,
    });
  });
}

/**
 * Get all use cases for a run, ordered by overall_score descending.
 */
export async function getUseCasesByRunId(runId: string): Promise<UseCase[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeUseCase.findMany({
      where: { runId },
      orderBy: [{ overallScore: "desc" }, { useCaseNo: "asc" }],
    });
    return rows.map(dbRowToUseCase);
  });
}

/**
 * Get use cases for a run filtered by domain.
 */
export async function getUseCasesByDomain(
  runId: string,
  domain: string
): Promise<UseCase[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeUseCase.findMany({
      where: { runId, domain },
      orderBy: { overallScore: "desc" },
    });
    return rows.map(dbRowToUseCase);
  });
}

/**
 * Get distinct domains for a run.
 */
export async function getDomainsForRun(runId: string): Promise<string[]> {
  return withPrisma(async (prisma) => {
    const results = await prisma.forgeUseCase.findMany({
      where: { runId },
      select: { domain: true },
      distinct: ["domain"],
      orderBy: { domain: "asc" },
    });
    return results.map((r: { domain: string | null }) => r.domain ?? "").filter(Boolean);
  });
}

/**
 * Delete all use cases for a run (used when re-running).
 */
export async function deleteUseCasesForRun(runId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeUseCase.deleteMany({ where: { runId } });
  });
}

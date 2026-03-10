/**
 * CRUD operations for stakeholder profiles — backed by Lakebase (Prisma).
 */

import { withPrisma } from "@/lib/prisma";
import type { StakeholderProfile } from "@/lib/domain/types";

function parseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function dbRowToProfile(row: {
  id: string;
  runId: string;
  role: string;
  department: string;
  useCaseCount: number;
  totalValue: number;
  domains: string | null;
  useCaseTypes: string | null;
  changeComplexity: string | null;
  isChampion: boolean;
  isSponsor: boolean;
}): StakeholderProfile {
  return {
    id: row.id,
    runId: row.runId,
    role: row.role,
    department: row.department,
    useCaseCount: row.useCaseCount,
    totalValue: row.totalValue,
    domains: parseJSON<string[]>(row.domains, []),
    useCaseTypes: parseJSON<Record<string, number>>(row.useCaseTypes, {}),
    changeComplexity: row.changeComplexity as StakeholderProfile["changeComplexity"],
    isChampion: row.isChampion,
    isSponsor: row.isSponsor,
  };
}

export async function getStakeholderProfilesForRun(runId: string): Promise<StakeholderProfile[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeStakeholderProfile.findMany({
      where: { runId },
      orderBy: { totalValue: "desc" },
    });
    return rows.map(dbRowToProfile);
  });
}

export async function getStakeholderProfilesForLatestRun(): Promise<{
  runId: string | null;
  profiles: StakeholderProfile[];
}> {
  return withPrisma(async (prisma) => {
    const latestRun = await prisma.forgeRun.findFirst({
      where: { status: "completed" },
      orderBy: { completedAt: "desc" },
      select: { runId: true },
    });
    if (!latestRun) return { runId: null, profiles: [] };
    const profiles = await getStakeholderProfilesForRun(latestRun.runId);
    return { runId: latestRun.runId, profiles };
  });
}

export async function replaceStakeholderProfiles(
  runId: string,
  profiles: Array<{
    role: string;
    department: string;
    useCaseCount: number;
    totalValue: number;
    domains: string[];
    useCaseTypes: Record<string, number>;
    changeComplexity: "low" | "medium" | "high";
    isChampion: boolean;
    isSponsor: boolean;
  }>,
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeStakeholderProfile.deleteMany({ where: { runId } });
    await prisma.forgeStakeholderProfile.createMany({
      data: profiles.map((p) => ({
        runId,
        role: p.role,
        department: p.department,
        useCaseCount: p.useCaseCount,
        totalValue: p.totalValue,
        domains: JSON.stringify(p.domains),
        useCaseTypes: JSON.stringify(p.useCaseTypes),
        changeComplexity: p.changeComplexity,
        isChampion: p.isChampion,
        isSponsor: p.isSponsor,
      })),
    });
  });
}

export async function deleteStakeholderProfilesForRun(runId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeStakeholderProfile.deleteMany({ where: { runId } });
  });
}

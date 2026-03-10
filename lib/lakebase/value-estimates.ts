/**
 * CRUD operations for business value estimates — backed by Lakebase (Prisma).
 */

import { withPrisma } from "@/lib/prisma";
import type { ValueEstimate, ValueType, ValueConfidence } from "@/lib/domain/types";

function parseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function dbRowToEstimate(row: {
  id: string;
  runId: string;
  useCaseId: string;
  valueLow: number;
  valueMid: number;
  valueHigh: number;
  currency: string;
  valueType: string;
  confidence: string;
  rationale: string | null;
  assumptions: string | null;
  industryBenchmark: string | null;
}): ValueEstimate {
  return {
    id: row.id,
    runId: row.runId,
    useCaseId: row.useCaseId,
    valueLow: row.valueLow,
    valueMid: row.valueMid,
    valueHigh: row.valueHigh,
    currency: row.currency,
    valueType: row.valueType as ValueType,
    confidence: row.confidence as ValueConfidence,
    rationale: row.rationale,
    assumptions: parseJSON<string[]>(row.assumptions, []),
    industryBenchmark: row.industryBenchmark,
  };
}

export async function getValueEstimatesForRun(runId: string): Promise<ValueEstimate[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeValueEstimate.findMany({ where: { runId } });
    return rows.map(dbRowToEstimate);
  });
}

export async function upsertValueEstimates(
  runId: string,
  estimates: Array<{
    useCaseId: string;
    valueLow: number;
    valueMid: number;
    valueHigh: number;
    currency?: string;
    valueType: ValueType;
    confidence: ValueConfidence;
    rationale?: string;
    assumptions?: string[];
    industryBenchmark?: string;
  }>,
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.$transaction(
      estimates.map((e) =>
        prisma.forgeValueEstimate.upsert({
          where: { runId_useCaseId: { runId, useCaseId: e.useCaseId } },
          create: {
            runId,
            useCaseId: e.useCaseId,
            valueLow: e.valueLow,
            valueMid: e.valueMid,
            valueHigh: e.valueHigh,
            currency: e.currency ?? "USD",
            valueType: e.valueType,
            confidence: e.confidence,
            rationale: e.rationale ?? null,
            assumptions: e.assumptions ? JSON.stringify(e.assumptions) : null,
            industryBenchmark: e.industryBenchmark ?? null,
          },
          update: {
            valueLow: e.valueLow,
            valueMid: e.valueMid,
            valueHigh: e.valueHigh,
            currency: e.currency ?? "USD",
            valueType: e.valueType,
            confidence: e.confidence,
            rationale: e.rationale ?? null,
            assumptions: e.assumptions ? JSON.stringify(e.assumptions) : null,
            industryBenchmark: e.industryBenchmark ?? null,
          },
        }),
      ),
    );
  });
}

export async function deleteValueEstimatesForRun(runId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeValueEstimate.deleteMany({ where: { runId } });
  });
}

export async function getValueSummaryForRun(runId: string): Promise<{
  totalLow: number;
  totalMid: number;
  totalHigh: number;
  count: number;
  byType: Record<string, { low: number; mid: number; high: number; count: number }>;
}> {
  const estimates = await getValueEstimatesForRun(runId);
  const byType: Record<string, { low: number; mid: number; high: number; count: number }> = {};

  let totalLow = 0;
  let totalMid = 0;
  let totalHigh = 0;

  for (const e of estimates) {
    totalLow += e.valueLow;
    totalMid += e.valueMid;
    totalHigh += e.valueHigh;
    if (!byType[e.valueType]) {
      byType[e.valueType] = { low: 0, mid: 0, high: 0, count: 0 };
    }
    byType[e.valueType].low += e.valueLow;
    byType[e.valueType].mid += e.valueMid;
    byType[e.valueType].high += e.valueHigh;
    byType[e.valueType].count += 1;
  }

  return { totalLow, totalMid, totalHigh, count: estimates.length, byType };
}

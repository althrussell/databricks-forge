/**
 * Implementation cost modeling -- T-shirt sizing to dollar estimates and ROI.
 *
 * Provides deterministic cost estimates based on effort T-shirt sizes and
 * calculates net ROI from value estimates minus implementation costs.
 */

import type { EffortEstimate } from "@/lib/domain/types";

export interface CostEstimate {
  effortEstimate: EffortEstimate;
  label: string;
  fteMonths: { low: number; mid: number; high: number };
  costUsd: { low: number; mid: number; high: number };
  durationWeeks: { low: number; mid: number; high: number };
}

export interface RoiResult {
  valueMid: number;
  costMid: number;
  netRoi: number;
  roiPercent: number;
  paybackMonths: number | null;
}

const FTE_MONTHLY_COST = 15_000;

const EFFORT_TABLE: Record<
  EffortEstimate,
  {
    label: string;
    fteMonths: { low: number; mid: number; high: number };
    durationWeeks: { low: number; mid: number; high: number };
  }
> = {
  xs: {
    label: "Extra Small",
    fteMonths: { low: 0.25, mid: 0.5, high: 1 },
    durationWeeks: { low: 1, mid: 2, high: 3 },
  },
  s: {
    label: "Small",
    fteMonths: { low: 1, mid: 2, high: 3 },
    durationWeeks: { low: 2, mid: 4, high: 6 },
  },
  m: {
    label: "Medium",
    fteMonths: { low: 3, mid: 5, high: 8 },
    durationWeeks: { low: 6, mid: 10, high: 16 },
  },
  l: {
    label: "Large",
    fteMonths: { low: 6, mid: 10, high: 16 },
    durationWeeks: { low: 12, mid: 20, high: 32 },
  },
  xl: {
    label: "Extra Large",
    fteMonths: { low: 12, mid: 20, high: 30 },
    durationWeeks: { low: 24, mid: 40, high: 52 },
  },
};

export function estimateCost(effort: EffortEstimate): CostEstimate {
  const e = EFFORT_TABLE[effort];
  return {
    effortEstimate: effort,
    label: e.label,
    fteMonths: e.fteMonths,
    costUsd: {
      low: Math.round(e.fteMonths.low * FTE_MONTHLY_COST),
      mid: Math.round(e.fteMonths.mid * FTE_MONTHLY_COST),
      high: Math.round(e.fteMonths.high * FTE_MONTHLY_COST),
    },
    durationWeeks: e.durationWeeks,
  };
}

export function calculateRoi(annualValueMid: number, effort: EffortEstimate): RoiResult {
  const cost = estimateCost(effort);
  const costMid = cost.costUsd.mid;
  const netRoi = annualValueMid - costMid;
  const roiPercent = costMid > 0 ? ((annualValueMid - costMid) / costMid) * 100 : 0;
  const paybackMonths = annualValueMid > 0 ? Math.round((costMid / annualValueMid) * 12) : null;

  return { valueMid: annualValueMid, costMid, netRoi, roiPercent, paybackMonths };
}

export function getEffortLabel(effort: EffortEstimate | string | null): string {
  if (!effort) return "—";
  return EFFORT_TABLE[effort as EffortEstimate]?.label ?? effort.toUpperCase();
}

export function getEffortOrder(effort: EffortEstimate): number {
  const order: Record<EffortEstimate, number> = {
    xs: 1,
    s: 2,
    m: 3,
    l: 4,
    xl: 5,
  };
  return order[effort] ?? 3;
}

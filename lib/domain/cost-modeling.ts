/**
 * Implementation cost modeling -- T-shirt sizing to dollar estimates and ROI.
 *
 * Provides deterministic cost estimates based on effort T-shirt sizes and
 * calculates net ROI from value estimates minus implementation costs.
 *
 * Also includes the Master Repository LOE matrix for model-type-aware
 * effort estimation and Databricks connectivity feasibility scoring.
 */

import type { EffortEstimate } from "@/lib/domain/types";
import { getMasterRepoEnrichment } from "@/lib/domain/industry-outcomes/master-repo-registry";

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

// ---------------------------------------------------------------------------
// Master Repository LOE Matrix
// ---------------------------------------------------------------------------

export type ModelType =
  | "Basic-ML"
  | "Intermediate — Traditional AI"
  | "Advanced — GenAI"
  | "Expert — AI Agents";

export type DataCriticality = "low" | "medium" | "high";

type LOELevel = "Low" | "Medium" | "High";

/**
 * 4x3 LOE matrix from the Master Repository.
 * Rows = model type, Columns = data criticality (derived from MC asset count).
 */
const LOE_MATRIX: Record<ModelType, Record<DataCriticality, LOELevel>> = {
  "Basic-ML": { low: "Low", medium: "Medium", high: "High" },
  "Intermediate — Traditional AI": { low: "Low", medium: "Medium", high: "High" },
  "Advanced — GenAI": { low: "Medium", medium: "High", high: "High" },
  "Expert — AI Agents": { low: "High", medium: "High", high: "High" },
};

const LOE_TO_EFFORT: Record<LOELevel, EffortEstimate> = {
  Low: "s",
  Medium: "m",
  High: "l",
};

const MODEL_TYPE_ALIASES: Record<string, ModelType> = {
  "basic-ml": "Basic-ML",
  "basic ml": "Basic-ML",
  intermediate: "Intermediate — Traditional AI",
  "intermediate — traditional ai": "Intermediate — Traditional AI",
  "intermediate - traditional ai": "Intermediate — Traditional AI",
  "traditional ai": "Intermediate — Traditional AI",
  advanced: "Advanced — GenAI",
  "advanced — genai": "Advanced — GenAI",
  "advanced - genai": "Advanced — GenAI",
  genai: "Advanced — GenAI",
  expert: "Expert — AI Agents",
  "expert — ai agents": "Expert — AI Agents",
  "expert - ai agents": "Expert — AI Agents",
  "ai agents": "Expert — AI Agents",
};

function resolveModelType(raw: string): ModelType | null {
  if (raw in LOE_MATRIX) return raw as ModelType;
  return MODEL_TYPE_ALIASES[raw.toLowerCase().trim()] ?? null;
}

function deriveDataCriticality(mcCount: number): DataCriticality {
  if (mcCount <= 1) return "low";
  if (mcCount <= 3) return "medium";
  return "high";
}

/**
 * Estimate effort from model type and mission-critical data asset count
 * using the Master Repository LOE matrix.
 *
 * Returns null if the model type is unrecognized.
 */
export function estimateLOEFromModelType(
  modelType: string,
  mcCount: number,
): { effort: EffortEstimate; loeLevel: LOELevel; dataCriticality: DataCriticality } | null {
  const resolved = resolveModelType(modelType);
  if (!resolved) return null;

  const criticality = deriveDataCriticality(mcCount);
  const loeLevel = LOE_MATRIX[resolved][criticality];

  return {
    effort: LOE_TO_EFFORT[loeLevel],
    loeLevel,
    dataCriticality: criticality,
  };
}

// ---------------------------------------------------------------------------
// Databricks connectivity feasibility
// ---------------------------------------------------------------------------

/**
 * Estimate data access feasibility for a set of data assets within an industry.
 *
 * Looks up each asset's Databricks connectivity scores (Lakeflow Connect,
 * UC Federation, Lakebridge Migrate) and returns a 0-1 feasibility score
 * based on the proportion of "High" connectivity ratings across all assets
 * and methods.
 *
 * Returns null if the industry has no enrichment data or no matching assets.
 */
export function estimateDataAccessFeasibility(
  industryId: string,
  assetIds: string[],
): { score: number; totalRatings: number; highRatings: number } | null {
  if (assetIds.length === 0) return null;

  const enrichment = getMasterRepoEnrichment(industryId);
  if (!enrichment || enrichment.dataAssets.length === 0) return null;

  const assetIndex = new Map(enrichment.dataAssets.map((da) => [da.id, da]));
  let totalRatings = 0;
  let highRatings = 0;

  for (const id of assetIds) {
    const da = assetIndex.get(id);
    if (!da) continue;

    const ratings = [da.lakeflowConnect, da.ucFederation, da.lakebridgeMigrate];
    for (const r of ratings) {
      totalRatings++;
      if (r === "High") highRatings++;
    }
  }

  if (totalRatings === 0) return null;

  return {
    score: highRatings / totalRatings,
    totalRatings,
    highRatings,
  };
}

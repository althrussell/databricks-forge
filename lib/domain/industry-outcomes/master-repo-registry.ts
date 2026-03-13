/**
 * Master Repository Enrichment Registry
 *
 * Loads all auto-generated enrichment modules and provides lookup by industry ID.
 * The industry-enrichment skill uses this to build additional LLM prompt chunks.
 */

import type { MasterRepoEnrichment } from "./master-repo-types";

import { BANKING_USE_CASES, BANKING_DATA_ASSETS } from "./banking.enrichment";
import { INSURANCE_USE_CASES, INSURANCE_DATA_ASSETS } from "./insurance.enrichment";
import { HLS_USE_CASES, HLS_DATA_ASSETS } from "./hls.enrichment";
import { RCG_USE_CASES, RCG_DATA_ASSETS } from "./rcg.enrichment";
import { MANUFACTURING_USE_CASES, MANUFACTURING_DATA_ASSETS } from "./manufacturing.enrichment";
import {
  ENERGY_UTILITIES_USE_CASES,
  ENERGY_UTILITIES_DATA_ASSETS,
} from "./energy-utilities.enrichment";
import { COMMUNICATIONS_USE_CASES, COMMUNICATIONS_DATA_ASSETS } from "./communications.enrichment";
import {
  MEDIA_ADVERTISING_USE_CASES,
  MEDIA_ADVERTISING_DATA_ASSETS,
} from "./media-advertising.enrichment";
import {
  DIGITAL_NATIVES_USE_CASES,
  DIGITAL_NATIVES_DATA_ASSETS,
} from "./digital-natives.enrichment";
import { GAMES_USE_CASES, GAMES_DATA_ASSETS } from "./games.enrichment";
import { SPORTS_BETTING_USE_CASES, SPORTS_BETTING_DATA_ASSETS } from "./sports-betting.enrichment";

const REGISTRY = new Map<string, MasterRepoEnrichment>([
  ["banking", { useCases: BANKING_USE_CASES, dataAssets: BANKING_DATA_ASSETS }],
  ["insurance", { useCases: INSURANCE_USE_CASES, dataAssets: INSURANCE_DATA_ASSETS }],
  ["hls", { useCases: HLS_USE_CASES, dataAssets: HLS_DATA_ASSETS }],
  ["rcg", { useCases: RCG_USE_CASES, dataAssets: RCG_DATA_ASSETS }],
  ["manufacturing", { useCases: MANUFACTURING_USE_CASES, dataAssets: MANUFACTURING_DATA_ASSETS }],
  [
    "energy-utilities",
    { useCases: ENERGY_UTILITIES_USE_CASES, dataAssets: ENERGY_UTILITIES_DATA_ASSETS },
  ],
  [
    "communications",
    { useCases: COMMUNICATIONS_USE_CASES, dataAssets: COMMUNICATIONS_DATA_ASSETS },
  ],
  [
    "media-advertising",
    { useCases: MEDIA_ADVERTISING_USE_CASES, dataAssets: MEDIA_ADVERTISING_DATA_ASSETS },
  ],
  [
    "digital-natives",
    { useCases: DIGITAL_NATIVES_USE_CASES, dataAssets: DIGITAL_NATIVES_DATA_ASSETS },
  ],
  ["games", { useCases: GAMES_USE_CASES, dataAssets: GAMES_DATA_ASSETS }],
  [
    "sports-betting",
    { useCases: SPORTS_BETTING_USE_CASES, dataAssets: SPORTS_BETTING_DATA_ASSETS },
  ],
]);

/** Get Master Repository enrichment data for an industry (built-in first, then custom). */
export function getMasterRepoEnrichment(industryId: string): MasterRepoEnrichment | undefined {
  return REGISTRY.get(industryId);
}

/**
 * Async version that falls back to custom enrichment stored on ForgeOutcomeMap.
 * Use this when the caller can await -- it checks built-in first (fast path),
 * then queries Lakebase for LLM-generated enrichment.
 */
export async function getMasterRepoEnrichmentAsync(
  industryId: string,
): Promise<MasterRepoEnrichment | undefined> {
  const builtIn = REGISTRY.get(industryId);
  if (builtIn) return builtIn;

  try {
    const { getCustomEnrichment } = await import("@/lib/lakebase/outcome-maps");
    return await getCustomEnrichment(industryId) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Get all industry IDs that have Master Repository enrichment. */
export function getMasterRepoIndustryIds(): string[] {
  return Array.from(REGISTRY.keys());
}

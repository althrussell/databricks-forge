/**
 * Industry Outcome Maps -- Structured Knowledge Base
 *
 * Curated extraction from the 10 industry outcome maps in /docs/outcome maps/.
 * Each industry contains strategic objectives, priorities, reference use cases,
 * KPIs, and personas used to enrich the pipeline prompts.
 *
 * This is NOT a full copy of the documents -- it captures the most actionable
 * use cases and strategic context for prompt injection.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReferenceUseCase {
  name: string;
  description: string;
  businessValue?: string;
  /** Typical data entities/models needed to enable this use case */
  typicalDataEntities?: string[];
  /** Common source systems where this data typically resides */
  typicalSourceSystems?: string[];
}

export interface StrategicPriority {
  name: string;
  useCases: ReferenceUseCase[];

  kpis: string[];
  personas: string[];
}

export interface IndustryObjective {
  name: string;
  whyChange: string;
  priorities: StrategicPriority[];
}

export interface IndustryOutcome {
  id: string;
  name: string;
  subVerticals?: string[];
  objectives: IndustryObjective[];
  /** Suggested business domains when this industry is selected. */
  suggestedDomains: string[];
  /** Suggested business priorities when this industry is selected. */
  suggestedPriorities: string[];
}

// ---------------------------------------------------------------------------
// Per-industry imports
// ---------------------------------------------------------------------------

import { BANKING } from "./banking";
import { INSURANCE } from "./insurance";
import { HLS } from "./hls";
import { RCG } from "./rcg";
import { MANUFACTURING } from "./manufacturing";
import { ENERGY_UTILITIES } from "./energy-utilities";
import { WATER_UTILITIES } from "./water-utilities";
import { COMMUNICATIONS } from "./communications";
import { MEDIA_ADVERTISING } from "./media-advertising";
import { DIGITAL_NATIVES } from "./digital-natives";
import { GAMES } from "./games";
import { RAIL_TRANSPORT } from "./rail-transport";
import { AUTOMOTIVE_MOBILITY } from "./automotive-mobility";
import { SPORTS_BETTING } from "./sports-betting";

// ---------------------------------------------------------------------------
// Registry -- Built-in (static) outcome maps
// ---------------------------------------------------------------------------

/** Built-in industry outcome maps (curated from /docs/outcome maps/). */
export const INDUSTRY_OUTCOMES: IndustryOutcome[] = [
  BANKING,
  INSURANCE,
  HLS,
  RCG,
  MANUFACTURING,
  ENERGY_UTILITIES,
  WATER_UTILITIES,
  COMMUNICATIONS,
  MEDIA_ADVERTISING,
  DIGITAL_NATIVES,
  GAMES,
  RAIL_TRANSPORT,
  AUTOMOTIVE_MOBILITY,
  SPORTS_BETTING,
];

/**
 * Look up an industry outcome by its id (built-in only, synchronous).
 * For server-side code that should also check custom maps, use
 * `getIndustryOutcomeAsync` instead.
 */
export function getIndustryOutcome(
  id: string
): IndustryOutcome | undefined {
  return INDUSTRY_OUTCOMES.find((i) => i.id === id);
}

/**
 * Get all industry ids and names for populating dropdowns (built-in only).
 * For a full list including custom maps, use `getAllIndustryOutcomes`.
 */
export function getIndustryOptions(): { id: string; name: string }[] {
  return INDUSTRY_OUTCOMES.map((i) => ({ id: i.id, name: i.name }));
}

// ---------------------------------------------------------------------------
// Server-only async functions (DB-aware, support custom maps)
// ---------------------------------------------------------------------------
// The async functions (getAllIndustryOutcomes, getIndustryOutcomeAsync,
// buildReferenceUseCasesPrompt, buildIndustryContextPrompt, buildIndustryKPIsPrompt)
// live in ./industry-outcomes-server.ts to avoid pulling Prisma/pg into
// client bundles. Import from there in server-side code (pipeline steps, API routes).

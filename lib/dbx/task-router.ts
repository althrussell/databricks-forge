/**
 * Smart Task Router.
 *
 * Maps TaskTier to the best available model endpoint using the model registry
 * and pool rate limiter. Considers tier compatibility, priority, and current
 * queue depth to spread load across endpoints.
 *
 * When only legacy env vars are configured (single endpoint), all tiers
 * resolve to that endpoint -- identical to the pre-pool behavior.
 */

import type { TaskTier } from "./model-registry";
import { getModelPool, getEndpointsForTier, isMultiEndpointPool } from "./model-registry";
import { getPoolRateLimiter } from "./rate-limiter";
import { getServingEndpoint, getFastServingEndpoint, getReviewEndpoint } from "./client";
import { logger } from "@/lib/logger";

// Re-export TaskTier so callers only need one import
export type { TaskTier } from "./model-registry";

// ---------------------------------------------------------------------------
// Legacy tier mapping (when pool has a single endpoint or no pool configured)
// ---------------------------------------------------------------------------

function legacyResolve(tier: TaskTier): string {
  switch (tier) {
    case "reasoning":
    case "generation":
      return getServingEndpoint();
    case "classification":
    case "lightweight":
      return getFastServingEndpoint();
    case "sql":
      return getReviewEndpoint();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve the best endpoint for a given task tier.
 *
 * Resolution:
 *   1. If pool has a single endpoint, return it (legacy mode).
 *   2. Get all endpoints that support the tier, sorted by priority.
 *   3. Ask the pool rate limiter for the best available (lowest queue depth,
 *      not in 429 backoff).
 *   4. If all tier-specific endpoints are saturated, try any endpoint.
 *   5. Final fallback: legacy resolution.
 */
export function resolveEndpoint(tier: TaskTier): string {
  let chosen: string;
  let source: string;

  if (!isMultiEndpointPool()) {
    chosen = legacyResolve(tier);
    source = "legacy";
  } else {
    const candidates = getEndpointsForTier(tier);
    if (candidates.length === 0) {
      chosen = legacyResolve(tier);
      source = "legacy-no-candidates";
    } else {
      const limiter = getPoolRateLimiter();
      const tierNames = candidates.map((c) => c.name);
      const best = limiter.bestAvailable(tierNames);

      if (best && !limiter.isBlocked(best)) {
        chosen = best;
        source = "tier-match";
      } else {
        const allNames = getModelPool().map((ep) => ep.name);
        const fallback = limiter.bestAvailable(allNames);
        if (fallback && !limiter.isBlocked(fallback)) {
          chosen = fallback;
          source = "overflow";
        } else if (best) {
          chosen = best;
          source = "blocked-tier";
        } else if (fallback) {
          chosen = fallback;
          source = "blocked-any";
        } else {
          chosen = legacyResolve(tier);
          source = "legacy-all-blocked";
        }
      }
    }
  }

  logger.debug("Endpoint resolved", { tier, endpoint: chosen, source });
  return chosen;
}

/**
 * Get fallback endpoints for a given tier, excluding `currentEndpoint`.
 * Used by retry/fallback logic when the primary endpoint returns 429.
 */
export function getFallbacksForTier(tier: TaskTier, currentEndpoint: string): string[] {
  const candidates = getEndpointsForTier(tier).map((c) => c.name);
  const filtered = candidates.filter((c) => c !== currentEndpoint);

  if (filtered.length > 0) return filtered;

  // Fall back to any endpoint in the pool
  return getModelPool()
    .map((ep) => ep.name)
    .filter((n) => n !== currentEndpoint);
}

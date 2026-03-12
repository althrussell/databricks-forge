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
  if (!isMultiEndpointPool()) {
    return legacyResolve(tier);
  }

  const candidates = getEndpointsForTier(tier);
  if (candidates.length === 0) {
    return legacyResolve(tier);
  }

  const limiter = getPoolRateLimiter();

  // Try tier-matched endpoints first (priority-sorted)
  const tierNames = candidates.map((c) => c.name);
  const best = limiter.bestAvailable(tierNames);
  if (best) return best;

  // All tier endpoints saturated -- try any endpoint in the pool
  const allNames = getModelPool().map((ep) => ep.name);
  const fallback = limiter.bestAvailable(allNames);
  if (fallback) return fallback;

  return legacyResolve(tier);
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

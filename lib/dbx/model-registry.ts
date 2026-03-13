/**
 * Model Pool Registry.
 *
 * Manages a pool of Model Serving endpoints with per-endpoint capabilities,
 * concurrency caps, and priority ordering. Supports customer model restrictions
 * via DATABRICKS_ALLOWED_MODELS and graceful degradation to single-endpoint mode.
 *
 * Pool discovery order:
 *   1. Dedicated env vars (DATABRICKS_SERVING_ENDPOINT_REASONING_2, etc.)
 *   2. Legacy env vars (DATABRICKS_SERVING_ENDPOINT, _FAST, _REVIEW)
 *   3. Hardcoded default (databricks-claude-opus-4-6)
 *
 * When only legacy env vars are set, behavior is identical to the pre-pool era.
 */

import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Task complexity tier used by all LLM call sites. The router maps each tier
 * to the best available endpoint based on capabilities and queue depth.
 */
export type TaskTier = "reasoning" | "generation" | "classification" | "sql" | "lightweight";

export interface ModelEndpoint {
  /** Serving endpoint name (e.g. "databricks-claude-opus-4-6"). */
  name: string;
  /** Task tiers this endpoint is suitable for (ordered by preference). */
  tiers: TaskTier[];
  /** Max concurrent requests for this endpoint's rate limiter. */
  maxConcurrent: number;
  /** Priority within a tier (lower = preferred). */
  priority: number;
}

// ---------------------------------------------------------------------------
// Built-in model capability map
// ---------------------------------------------------------------------------

interface ModelTemplate {
  tiers: TaskTier[];
  maxConcurrent: number;
  priority: number;
}

const KNOWN_MODELS: Record<string, ModelTemplate> = {
  "databricks-claude-opus-4-6": {
    tiers: ["reasoning"],
    maxConcurrent: 6,
    priority: 1,
  },
  "databricks-claude-opus-4-5": {
    tiers: ["reasoning"],
    maxConcurrent: 6,
    priority: 2,
  },
  "databricks-claude-sonnet-4-6": {
    tiers: ["generation", "classification"],
    maxConcurrent: 8,
    priority: 1,
  },
  "databricks-claude-sonnet-4-5": {
    tiers: ["classification", "lightweight"],
    maxConcurrent: 8,
    priority: 2,
  },
  "databricks-gpt-5-4": {
    tiers: ["sql", "generation", "reasoning"],
    maxConcurrent: 6,
    priority: 1,
  },
  "databricks-gpt-5-3-codex": {
    tiers: ["sql", "classification"],
    maxConcurrent: 8,
    priority: 1,
  },
  "databricks-gemini-3-1-flash-lite": {
    tiers: ["classification", "lightweight"],
    maxConcurrent: 12,
    priority: 0,
  },
  "databricks-llama-4-maverick": {
    tiers: ["generation", "classification"],
    maxConcurrent: 10,
    priority: 0,
  },
  "databricks-gemini-3-flash": {
    tiers: ["generation", "classification", "lightweight"],
    maxConcurrent: 10,
    priority: 1,
  },
};

function templateFor(name: string): ModelTemplate {
  const lower = name.toLowerCase();
  for (const [key, tmpl] of Object.entries(KNOWN_MODELS)) {
    if (lower === key || lower.includes(key)) return tmpl;
  }
  // Unknown model -- conservative defaults, supports all tiers at low priority
  return {
    tiers: ["generation", "classification", "sql", "lightweight"],
    maxConcurrent: 6,
    priority: 10,
  };
}

// ---------------------------------------------------------------------------
// Registry singleton
// ---------------------------------------------------------------------------

let _pool: ModelEndpoint[] | null = null;

/**
 * Build the endpoint pool from environment variables. Called once on first access.
 *
 * Env var mapping:
 *   DATABRICKS_SERVING_ENDPOINT            → primary premium/reasoning
 *   DATABRICKS_SERVING_ENDPOINT_FAST       → primary fast/classification
 *   DATABRICKS_REVIEW_ENDPOINT             → primary SQL review
 *   DATABRICKS_SERVING_ENDPOINT_REASONING_2 → secondary reasoning
 *   DATABRICKS_SERVING_ENDPOINT_GENERATION  → dedicated generation
 *   DATABRICKS_SERVING_ENDPOINT_SQL         → dedicated SQL/codex
 */
function buildPool(): ModelEndpoint[] {
  const seen = new Set<string>();
  const pool: ModelEndpoint[] = [];

  const add = (name: string | undefined) => {
    if (!name) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const tmpl = templateFor(name);
    pool.push({ name, ...tmpl });
  };

  // Primary endpoints (legacy env vars)
  add(process.env.DATABRICKS_SERVING_ENDPOINT);
  add(process.env.DATABRICKS_SERVING_ENDPOINT_FAST);
  add(process.env.DATABRICKS_REVIEW_ENDPOINT);

  // Extended pool endpoints (new env vars)
  add(process.env.DATABRICKS_SERVING_ENDPOINT_REASONING_2);
  add(process.env.DATABRICKS_SERVING_ENDPOINT_GENERATION);
  add(process.env.DATABRICKS_SERVING_ENDPOINT_SQL);
  add(process.env.DATABRICKS_SERVING_ENDPOINT_LIGHTWEIGHT);

  // Fallback: if nothing is configured, add the hardcoded default
  if (pool.length === 0) {
    const def = "databricks-claude-opus-4-6";
    const tmpl = KNOWN_MODELS[def]!;
    pool.push({ name: def, ...tmpl });
  }

  return applyAllowlist(pool);
}

/**
 * Filter pool to only customer-approved models when DATABRICKS_ALLOWED_MODELS
 * is set. If the allowlist would result in an empty pool, fall back to the
 * first configured endpoint with a warning.
 */
function applyAllowlist(pool: ModelEndpoint[]): ModelEndpoint[] {
  const raw = process.env.DATABRICKS_ALLOWED_MODELS;
  if (!raw) return pool;

  const allowed = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  if (allowed.size === 0) return pool;

  const filtered = pool.filter((ep) => allowed.has(ep.name.toLowerCase()));

  if (filtered.length === 0) {
    logger.warn(
      "DATABRICKS_ALLOWED_MODELS filtered out all endpoints — falling back to first configured",
      { allowlist: raw, poolSize: pool.length },
    );
    return pool.slice(0, 1);
  }

  return filtered;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Returns the active model pool (lazy-initialised, cached). */
export function getModelPool(): readonly ModelEndpoint[] {
  if (!_pool) {
    _pool = buildPool();
    logPoolSummary(_pool);
  }
  return _pool;
}

/** Returns all endpoints in the pool that support a given tier, sorted by priority. */
export function getEndpointsForTier(tier: TaskTier): readonly ModelEndpoint[] {
  return getModelPool()
    .filter((ep) => ep.tiers.includes(tier))
    .sort((a, b) => a.priority - b.priority);
}

/** Whether the pool has more than one distinct endpoint. */
export function isMultiEndpointPool(): boolean {
  return getModelPool().length > 1;
}

/** Sum of all per-endpoint maxConcurrent caps. */
export function getPoolMaxConcurrent(): number {
  return getModelPool().reduce((sum, ep) => sum + ep.maxConcurrent, 0);
}

/** Reset the pool (for testing). */
export function resetModelPool(): void {
  _pool = null;
}

// ---------------------------------------------------------------------------
// Startup log
// ---------------------------------------------------------------------------

function logPoolSummary(pool: ModelEndpoint[]): void {
  const restricted = !!process.env.DATABRICKS_ALLOWED_MODELS;
  const totalConcurrent = pool.reduce((s, ep) => s + ep.maxConcurrent, 0);

  logger.info(
    `Model pool initialised: ${pool.length} endpoint${pool.length !== 1 ? "s" : ""} active${restricted ? " (restricted by DATABRICKS_ALLOWED_MODELS)" : ""}`,
    {
      endpoints: pool.map((ep) => ({
        name: ep.name,
        tiers: ep.tiers.join(", "),
        maxConcurrent: ep.maxConcurrent,
      })),
      effectiveMaxConcurrent: totalConcurrent,
    },
  );
}

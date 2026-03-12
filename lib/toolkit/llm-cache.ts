/**
 * In-memory LLM response cache + retry logic.
 *
 * Caches chatCompletion responses keyed by a SHA-256 hash of the request
 * parameters (messages + endpoint + temperature + maxTokens). Useful when
 * re-running the engine with the same schema/config -- identical prompts
 * return instantly from cache instead of hitting Model Serving again.
 *
 * Retry: up to 3 retries for transient errors (5xx, network) with short
 * exponential backoff (1s, 2s, 4s), and up to 4 retries for 429 rate-limit
 * errors with a jittered backoff (Retry-After from response, else 60s).
 *
 * Pool-aware fallback: on 429 exhaustion, rotates through same-tier endpoints
 * from the model registry rather than the old static fallback list.
 *
 * TTL: 15 minutes. Max entries: 500.
 */

import { createHash } from "crypto";
import {
  chatCompletion,
  ModelServingError,
  type ChatCompletionOptions,
  type ChatCompletionResponse,
} from "@/lib/dbx/model-serving";
import { addJitter, DEFAULT_429_BACKOFF_MS } from "@/lib/dbx/rate-limiter";
import { getFallbackEndpoint } from "@/lib/dbx/client";
import { getModelPool } from "@/lib/dbx/model-registry";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHE_ENTRIES = 500;
const MAX_RETRIES = 3;
const MAX_429_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1_000;
const FALLBACK_MAX_ATTEMPTS = 2;
const FALLBACK_BACKOFF_MS = 5_000;

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  response: ChatCompletionResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function buildCacheKey(options: ChatCompletionOptions): string {
  const payload = JSON.stringify({
    e: options.endpoint,
    m: options.messages,
    t: options.temperature ?? 0.3,
    mt: options.maxTokens,
  });
  return createHash("sha256").update(payload).digest("hex");
}

function evictExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now >= entry.expiresAt) {
      cache.delete(key);
      _stats.evictions++;
    }
  }
}

function evictLru(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  let oldestKey: string | null = null;
  let oldestExpiry = Infinity;
  for (const [key, entry] of cache) {
    if (entry.expiresAt < oldestExpiry) {
      oldestExpiry = entry.expiresAt;
      oldestKey = key;
    }
  }
  if (oldestKey) {
    cache.delete(oldestKey);
    _stats.evictions++;
  }
}

// ---------------------------------------------------------------------------
// Cache statistics
// ---------------------------------------------------------------------------

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
}

const _stats: CacheStats = { hits: 0, misses: 0, evictions: 0 };

/** Returns a snapshot of cache hit/miss/eviction counters. */
export function llmCacheStats(): CacheStats & { size: number } {
  return { ..._stats, size: cache.size };
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

function isRateLimitError(error: unknown): boolean {
  if (error instanceof ModelServingError) {
    return error.statusCode === 429;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("(429)") || msg.includes("REQUEST_LIMIT_EXCEEDED");
}

function isRetryableError(error: unknown): boolean {
  if (isRateLimitError(error)) return true;
  if (error instanceof ModelServingError) {
    return error.statusCode >= 500;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET") || msg.includes("fetch failed");
}

function getRetryAfterMs(error: unknown): number {
  if (error instanceof ModelServingError && error.retryAfterMs) {
    return error.retryAfterMs;
  }
  return DEFAULT_429_BACKOFF_MS;
}

// ---------------------------------------------------------------------------
// Model Pool (pool-aware fallback)
// ---------------------------------------------------------------------------

/**
 * Build an ordered list of fallback endpoints to try when the primary is
 * exhausted. Uses the model pool registry first, then falls back to the
 * legacy getFallbackEndpoint + DATABRICKS_FALLBACK_ENDPOINTS.
 */
function buildEndpointPool(currentEndpoint: string): string[] {
  const pool: string[] = [];
  const seen = new Set<string>([currentEndpoint]);

  const addIfDistinct = (ep: string | null | undefined) => {
    if (ep && !seen.has(ep)) {
      seen.add(ep);
      pool.push(ep);
    }
  };

  // Pool-aware: add all endpoints from the model registry
  for (const ep of getModelPool()) {
    addIfDistinct(ep.name);
  }

  // Legacy fallback chain
  addIfDistinct(getFallbackEndpoint(currentEndpoint));

  const extra = process.env.DATABRICKS_FALLBACK_ENDPOINTS;
  if (extra) {
    for (const ep of extra
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      addIfDistinct(ep);
    }
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

async function chatCompletionWithRetry(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  let lastError: Error | null = null;
  let rateLimitHits = 0;
  let exhausted429 = false;

  const maxAttempts = MAX_429_RETRIES + 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        if (isRateLimitError(lastError)) {
          const retryAfterMs = addJitter(getRetryAfterMs(lastError));
          logger.warn("LLM rate-limited (429), backing off with jitter", {
            attempt,
            retryAfterMs: Math.round(retryAfterMs),
            endpoint: options.endpoint,
          });
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        } else {
          const backoffMs = addJitter(INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1));
          logger.info("LLM retry", {
            attempt,
            backoffMs: Math.round(backoffMs),
            endpoint: options.endpoint,
          });
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }

      return await chatCompletion(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRateLimitError(error)) {
        rateLimitHits++;
        if (rateLimitHits > MAX_429_RETRIES) {
          exhausted429 = true;
          break;
        }
        logger.warn("LLM call failed (will retry)", {
          attempt: attempt + 1,
          endpoint: options.endpoint,
          error: lastError.message,
        });
        continue;
      }

      if (!isRetryableError(error) || attempt >= MAX_RETRIES) {
        throw lastError;
      }

      logger.warn("LLM call failed (will retry)", {
        attempt: attempt + 1,
        endpoint: options.endpoint,
        error: lastError.message,
      });
    }
  }

  if (exhausted429) {
    const pool = buildEndpointPool(options.endpoint);
    for (const alt of pool) {
      logger.warn("LLM rotating to alternate endpoint", {
        from: options.endpoint,
        to: alt,
      });
      const fallbackOptions = { ...options, endpoint: alt };
      for (let fa = 0; fa < FALLBACK_MAX_ATTEMPTS; fa++) {
        try {
          if (fa > 0) {
            await new Promise((resolve) => setTimeout(resolve, addJitter(FALLBACK_BACKOFF_MS)));
          }
          return await chatCompletion(fallbackOptions);
        } catch (fbError) {
          lastError = fbError instanceof Error ? fbError : new Error(String(fbError));
          if (isRateLimitError(fbError)) {
            logger.warn("LLM fallback also rate-limited, trying next", {
              endpoint: alt,
              error: lastError.message,
            });
            break;
          }
          logger.warn("LLM fallback attempt failed", {
            attempt: fa + 1,
            endpoint: alt,
            error: lastError.message,
          });
        }
      }
    }
  }

  throw lastError ?? new Error("LLM call failed after retries");
}

/**
 * Cache-aware wrapper around chatCompletion with automatic retry.
 * Returns a cached response when an identical request was made within
 * the TTL window. Retries on 429/5xx with jittered exponential backoff.
 */
export async function cachedChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  evictExpired();

  const key = buildCacheKey(options);
  const cached = cache.get(key);

  if (cached && Date.now() < cached.expiresAt) {
    _stats.hits++;
    logger.debug("LLM cache hit", { endpoint: options.endpoint });
    return cached.response;
  }

  _stats.misses++;
  const response = await chatCompletionWithRetry(options);

  cache.set(key, {
    response,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  evictLru();

  return response;
}

/** Clear all cached entries (useful for testing). */
export function clearLLMCache(): void {
  cache.clear();
  _stats.hits = 0;
  _stats.misses = 0;
  _stats.evictions = 0;
}

/** Number of entries currently in the cache. */
export function llmCacheSize(): number {
  evictExpired();
  return cache.size;
}

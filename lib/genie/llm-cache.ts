/**
 * In-memory LLM response cache + retry logic for the Genie Engine.
 *
 * Caches chatCompletion responses keyed by a SHA-256 hash of the request
 * parameters (messages + endpoint + temperature + maxTokens). Useful when
 * re-running the engine with the same schema/config -- identical prompts
 * return instantly from cache instead of hitting Model Serving again.
 *
 * Retry: up to 3 retries for transient errors (5xx, network) with short
 * exponential backoff (1s, 2s, 4s), and up to 4 retries for 429 rate-limit
 * errors with a longer backoff (60s default or Retry-After from response).
 *
 * Concurrency: capped via an internal semaphore (default 3, configurable
 * via GENIE_MAX_CONCURRENT_LLM env var) to prevent burst overload.
 *
 * TTL: 10 minutes (covers a single iteration session).
 */

import { createHash } from "crypto";
import {
  chatCompletion,
  ModelServingError,
  type ChatCompletionOptions,
  type ChatCompletionResponse,
} from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 200;
const MAX_RETRIES = 3;
const MAX_429_RETRIES = 4;
const INITIAL_BACKOFF_MS = 1_000;
const DEFAULT_429_BACKOFF_MS = 60_000;

const MAX_GENIE_CONCURRENT = Math.max(
  1,
  parseInt(process.env.GENIE_MAX_CONCURRENT_LLM ?? "3", 10) || 3,
);

// ---------------------------------------------------------------------------
// Concurrency semaphore
// ---------------------------------------------------------------------------

class Semaphore {
  private current = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.current < this.max) {
      this.current++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.current++;
        resolve();
      });
    });
  }

  release(): void {
    this.current--;
    const next = this.queue.shift();
    if (next) next();
  }
}

const genieSemaphore = new Semaphore(MAX_GENIE_CONCURRENT);

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
  if (oldestKey) cache.delete(oldestKey);
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

function extractRetryAfterMs(error: Error): number | null {
  const match = error.message.match(/retry[- ]?after[:\s]*(\d+)/i);
  if (match) return parseInt(match[1], 10) * 1000;
  return null;
}

// ---------------------------------------------------------------------------
// Retry wrapper
// ---------------------------------------------------------------------------

async function chatCompletionWithRetry(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  let lastError: Error | null = null;
  let rateLimitHits = 0;

  const maxAttempts = MAX_429_RETRIES + 1; // upper bound; per-error-type caps checked below

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (attempt > 0) {
        if (isRateLimitError(lastError)) {
          const retryAfterMs = (lastError && extractRetryAfterMs(lastError)) ?? DEFAULT_429_BACKOFF_MS;
          logger.warn("LLM rate-limited (429), backing off", {
            attempt,
            retryAfterMs,
            endpoint: options.endpoint,
          });
          await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        } else {
          const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
          logger.info("LLM retry", { attempt, backoffMs, endpoint: options.endpoint });
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }

      await genieSemaphore.acquire();
      try {
        return await chatCompletion(options);
      } finally {
        genieSemaphore.release();
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (isRateLimitError(error)) {
        rateLimitHits++;
        if (rateLimitHits > MAX_429_RETRIES) {
          throw lastError;
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

  throw lastError ?? new Error("LLM call failed after retries");
}

/**
 * Cache-aware wrapper around chatCompletion with automatic retry.
 * Returns a cached response when an identical request was made within
 * the TTL window. Retries on 429/5xx with exponential backoff.
 */
export async function cachedChatCompletion(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  evictExpired();

  const key = buildCacheKey(options);
  const cached = cache.get(key);

  if (cached && Date.now() < cached.expiresAt) {
    logger.debug("LLM cache hit", { endpoint: options.endpoint });
    return cached.response;
  }

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
}

/** Number of entries currently in the cache. */
export function llmCacheSize(): number {
  evictExpired();
  return cache.size;
}

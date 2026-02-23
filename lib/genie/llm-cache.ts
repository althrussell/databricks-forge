/**
 * In-memory LLM response cache + retry logic for the Genie Engine.
 *
 * Caches chatCompletion responses keyed by a SHA-256 hash of the request
 * parameters (messages + endpoint + temperature + maxTokens). Useful when
 * re-running the engine with the same schema/config -- identical prompts
 * return instantly from cache instead of hitting Model Serving again.
 *
 * Retry: 2 retries with exponential backoff (1s, 2s) on 429 (rate limit)
 * and 5xx (server error). Other errors fail immediately.
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
const MAX_RETRIES = 2;
const INITIAL_BACKOFF_MS = 1_000;

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

function isRetryableError(error: unknown): boolean {
  if (error instanceof ModelServingError) {
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes("ETIMEDOUT") || msg.includes("ECONNRESET") || msg.includes("fetch failed");
}

async function chatCompletionWithRetry(
  options: ChatCompletionOptions,
): Promise<ChatCompletionResponse> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
        logger.info("LLM retry", { attempt, maxRetries: MAX_RETRIES, backoffMs, endpoint: options.endpoint });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
      return await chatCompletion(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
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

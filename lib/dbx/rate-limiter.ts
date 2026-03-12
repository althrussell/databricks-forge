/**
 * Per-endpoint LLM rate limiter with independent 429 circuit breakers.
 *
 * Each model endpoint gets its own semaphore + circuit breaker so a 429 on
 * one endpoint does not block calls to others. An optional global ceiling
 * (GLOBAL_LLM_MAX_CONCURRENT) caps total inflight calls across all endpoints.
 *
 * The PoolRateLimiter also exposes `bestAvailable(candidates)` so the task
 * router can pick the endpoint with the lowest queue depth.
 */

import { logger } from "@/lib/logger";
import { getModelPool } from "./model-registry";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GLOBAL_MAX = Math.max(0, parseInt(process.env.GLOBAL_LLM_MAX_CONCURRENT ?? "0", 10) || 0);

export const DEFAULT_429_BACKOFF_MS = 60_000;

// ---------------------------------------------------------------------------
// Semaphore (unchanged from original, now used per-endpoint)
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

  get inflight(): number {
    return this.current;
  }

  get pending(): number {
    return this.queue.length;
  }
}

// ---------------------------------------------------------------------------
// Per-endpoint limiter
// ---------------------------------------------------------------------------

interface EndpointLimiter {
  semaphore: Semaphore;
  blockedUntil: number;
}

// ---------------------------------------------------------------------------
// Pool Rate Limiter
// ---------------------------------------------------------------------------

class PoolRateLimiter {
  private readonly limiters = new Map<string, EndpointLimiter>();
  private readonly globalSemaphore: Semaphore | null;

  constructor() {
    const pool = getModelPool();
    for (const ep of pool) {
      this.limiters.set(ep.name, {
        semaphore: new Semaphore(ep.maxConcurrent),
        blockedUntil: 0,
      });
    }

    const poolMax = pool.reduce((s, ep) => s + ep.maxConcurrent, 0);
    const effectiveGlobal = GLOBAL_MAX > 0 ? GLOBAL_MAX : poolMax;
    this.globalSemaphore = effectiveGlobal < poolMax ? new Semaphore(effectiveGlobal) : null;

    logger.info("Pool rate limiter initialised", {
      endpoints: pool.length,
      perEndpoint: pool.map((ep) => ({ name: ep.name, max: ep.maxConcurrent })),
      globalCeiling: effectiveGlobal,
    });
  }

  private getOrCreate(endpoint: string): EndpointLimiter {
    let lim = this.limiters.get(endpoint);
    if (!lim) {
      lim = { semaphore: new Semaphore(6), blockedUntil: 0 };
      this.limiters.set(endpoint, lim);
    }
    return lim;
  }

  async acquire(endpoint: string): Promise<void> {
    const lim = this.getOrCreate(endpoint);

    const now = Date.now();
    if (now < lim.blockedUntil) {
      const baseWait = lim.blockedUntil - now;
      const jitteredWait = addJitter(baseWait);
      logger.debug("Pool rate limiter: waiting for 429 backoff", {
        endpoint,
        waitMs: Math.round(jitteredWait),
      });
      await new Promise((resolve) => setTimeout(resolve, jitteredWait));
    }

    if (this.globalSemaphore) {
      await this.globalSemaphore.acquire();
    }
    await lim.semaphore.acquire();
  }

  release(endpoint: string): void {
    const lim = this.limiters.get(endpoint);
    if (lim) lim.semaphore.release();
    if (this.globalSemaphore) this.globalSemaphore.release();
  }

  backoff(endpoint: string, retryAfterMs: number): void {
    const lim = this.getOrCreate(endpoint);
    const until = Date.now() + retryAfterMs;
    if (until > lim.blockedUntil) {
      lim.blockedUntil = until;
      logger.warn("Pool rate limiter: 429 circuit breaker activated", {
        endpoint,
        retryAfterMs,
        inflight: lim.semaphore.inflight,
        pending: lim.semaphore.pending,
      });
    }
  }

  /**
   * Pick the best available endpoint from candidates. Prefers endpoints that
   * are not in 429 backoff, then the one with the lowest queue depth.
   */
  bestAvailable(candidates: string[]): string | null {
    if (candidates.length === 0) return null;

    const now = Date.now();
    let best: string | null = null;
    let bestScore = Infinity;

    for (const ep of candidates) {
      const lim = this.getOrCreate(ep);
      const blocked = now < lim.blockedUntil;
      // blocked endpoints get a large penalty so unblocked ones are preferred
      const score = (blocked ? 10_000 : 0) + lim.semaphore.inflight + lim.semaphore.pending;
      if (score < bestScore) {
        bestScore = score;
        best = ep;
      }
    }

    return best;
  }

  /** Whether a specific endpoint is currently in 429 backoff. */
  isBlocked(endpoint: string): boolean {
    const lim = this.limiters.get(endpoint);
    return lim ? Date.now() < lim.blockedUntil : false;
  }

  /** Current inflight count for an endpoint. */
  inflight(endpoint: string): number {
    return this.limiters.get(endpoint)?.semaphore.inflight ?? 0;
  }

  /** Total inflight across all endpoints. */
  totalInflight(): number {
    let total = 0;
    this.limiters.forEach((lim) => {
      total += lim.semaphore.inflight;
    });
    return total;
  }
}

// ---------------------------------------------------------------------------
// Jitter utility
// ---------------------------------------------------------------------------

/**
 * Add +/- 25% random jitter to a delay to spread retries and prevent
 * thundering herd. Returns `delay * (0.75 + Math.random() * 0.5)`.
 */
export function addJitter(delayMs: number): number {
  return delayMs * (0.75 + Math.random() * 0.5);
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _poolRateLimiter: PoolRateLimiter | null = null;

export function getPoolRateLimiter(): PoolRateLimiter {
  if (!_poolRateLimiter) {
    _poolRateLimiter = new PoolRateLimiter();
  }
  return _poolRateLimiter;
}

/** Reset (for testing). */
export function resetPoolRateLimiter(): void {
  _poolRateLimiter = null;
}

// ---------------------------------------------------------------------------
// Legacy compat: globalRateLimiter facade
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for the old `globalRateLimiter` export.
 * Routes acquire/release/backoff to the pool rate limiter for the given endpoint.
 * Callers that haven't been migrated yet will call acquire() with no endpoint
 * arg -- this falls back to the primary endpoint.
 */
export const globalRateLimiter = {
  async acquire(endpoint?: string): Promise<void> {
    const ep = endpoint ?? getModelPool()[0]?.name ?? "default";
    return getPoolRateLimiter().acquire(ep);
  },
  release(endpoint?: string): void {
    const ep = endpoint ?? getModelPool()[0]?.name ?? "default";
    getPoolRateLimiter().release(ep);
  },
  backoff(retryAfterMsOrEndpoint: number | string, retryAfterMs?: number): void {
    if (typeof retryAfterMsOrEndpoint === "string") {
      getPoolRateLimiter().backoff(retryAfterMsOrEndpoint, retryAfterMs ?? DEFAULT_429_BACKOFF_MS);
    } else {
      const ep = getModelPool()[0]?.name ?? "default";
      getPoolRateLimiter().backoff(ep, retryAfterMsOrEndpoint);
    }
  },
};

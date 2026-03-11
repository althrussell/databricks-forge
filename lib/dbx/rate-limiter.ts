/**
 * Global LLM rate limiter with 429 circuit breaker.
 *
 * All LLM calls (Genie Engine, Dashboard Engine, Pipeline Agent, SQL Reviewer,
 * Ask Forge, etc.) flow through a single global semaphore + circuit breaker.
 *
 * When ANY call receives a 429 from Model Serving, the circuit breaker blocks
 * all new calls until the Retry-After window expires, preventing the
 * "thundering herd" where dozens of retries stampede at the same instant.
 *
 * Concurrency: configurable via GLOBAL_LLM_MAX_CONCURRENT (default 10).
 */

import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_CONCURRENT = Math.max(
  1,
  parseInt(process.env.GLOBAL_LLM_MAX_CONCURRENT ?? "10", 10) || 10,
);

const DEFAULT_429_BACKOFF_MS = 60_000;

// ---------------------------------------------------------------------------
// Semaphore
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
// Global Rate Limiter
// ---------------------------------------------------------------------------

class GlobalRateLimiter {
  private readonly semaphore: Semaphore;
  private blockedUntil = 0;

  constructor(maxConcurrent: number) {
    this.semaphore = new Semaphore(maxConcurrent);
    logger.info("Global LLM rate limiter initialised", { maxConcurrent });
  }

  /**
   * Acquire a slot. If the circuit breaker is active (a recent 429 set
   * blockedUntil), wait with jitter until the backoff window expires before
   * competing for the semaphore.
   */
  async acquire(): Promise<void> {
    const now = Date.now();
    if (now < this.blockedUntil) {
      const baseWait = this.blockedUntil - now;
      const jitteredWait = addJitter(baseWait);
      logger.debug("Global rate limiter: waiting for 429 backoff", {
        waitMs: Math.round(jitteredWait),
        inflight: this.semaphore.inflight,
        pending: this.semaphore.pending,
      });
      await new Promise((resolve) => setTimeout(resolve, jitteredWait));
    }
    await this.semaphore.acquire();
  }

  release(): void {
    this.semaphore.release();
  }

  /**
   * Called when a 429 is received. Sets the circuit breaker timestamp so
   * all future callers wait before hitting Model Serving again.
   */
  backoff(retryAfterMs: number): void {
    const until = Date.now() + retryAfterMs;
    if (until > this.blockedUntil) {
      this.blockedUntil = until;
      logger.warn("Global rate limiter: 429 circuit breaker activated", {
        retryAfterMs,
        inflight: this.semaphore.inflight,
        pending: this.semaphore.pending,
      });
    }
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

export const globalRateLimiter = new GlobalRateLimiter(MAX_CONCURRENT);

export { DEFAULT_429_BACKOFF_MS };

/**
 * Fetch wrapper with AbortController-based timeout.
 *
 * Prevents indefinite hangs when Databricks APIs are unresponsive.
 */

export class FetchTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`Request to ${new URL(url).pathname} timed out after ${timeoutMs}ms`);
    this.name = "FetchTimeoutError";
  }
}

/**
 * Fetch with an automatic timeout. If the request doesn't complete within
 * `timeoutMs`, the request is aborted and a FetchTimeoutError is thrown.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new FetchTimeoutError(url, timeoutMs);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

// Default timeouts by operation type
export const TIMEOUTS = {
  /** OAuth token exchange */
  AUTH: 15_000,
  /** SQL statement submission (must exceed server-side wait_timeout of 50s) */
  SQL_SUBMIT: 60_000,
  /** SQL statement polling */
  SQL_POLL: 15_000,
  /** SQL chunk fetching */
  SQL_CHUNK: 30_000,
  /** Workspace API calls */
  WORKSPACE: 30_000,
} as const;

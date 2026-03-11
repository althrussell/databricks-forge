/**
 * Abstract logger interface.
 *
 * Matches the method signatures of `@/lib/logger` so existing code
 * can swap to DI with zero refactoring of log call sites.
 *
 * @module ports/logger
 */

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Shared auth-error detection for Lakebase (Postgres) connections.
 *
 * Used by lib/prisma.ts for the withPrisma retry wrapper and by
 * engine-status.ts for error classification in the frontend.
 */

export const AUTH_ERROR_PATTERNS = [
  "authentication failed",
  "password authentication failed",
  "provided database credentials",
  "not valid",
  "FATAL:  password",
] as const;

export function isAuthError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = msg.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Check if an error message string looks like a DB auth failure.
 * Convenience overload for contexts that only have the message string.
 */
export function isAuthErrorMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}

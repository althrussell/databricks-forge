/**
 * Sanitise error messages for HTTP responses.
 *
 * In production, returns a generic message to avoid leaking internal details
 * (stack traces, connection strings, SQL errors) to clients.
 * In development, returns the raw message for easier debugging.
 *
 * Logger calls should continue using the raw error for server-side diagnostics.
 */

const GENERIC = "An internal error occurred.";

export function safeErrorMessage(err: unknown): string {
  if (process.env.NODE_ENV !== "production") {
    return err instanceof Error ? err.message : String(err);
  }
  return GENERIC;
}

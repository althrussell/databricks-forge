/**
 * Lakebase schema management.
 *
 * Schema is now managed by Prisma (prisma/schema.prisma).
 * Tables are created via `npx prisma db push` or `npx prisma migrate deploy`.
 *
 * This module retains the ensureMigrated() function as a no-op so callers
 * in API routes don't break. Schema creation is handled at deploy time.
 */

/**
 * No-op -- schema is managed by Prisma migrations.
 * Retained for backward compatibility with API routes that call it.
 */
export async function ensureMigrated(): Promise<void> {
  // Prisma handles schema via `prisma db push` at deploy time.
  // Nothing to do at runtime.
}

export async function runMigrations(): Promise<void> {
  // Prisma handles schema via `prisma db push` at deploy time.
  console.log("[Lakebase] Schema is managed by Prisma. Run `npx prisma db push` to sync.");
}

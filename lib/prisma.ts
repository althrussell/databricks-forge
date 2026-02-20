/**
 * Prisma client singleton for Lakebase.
 *
 * Uses @prisma/adapter-pg with node-postgres (pg) Pool.
 *
 * Two modes (chosen automatically):
 *   1. **Auto-provisioned** (Databricks Apps) -- DATABRICKS_CLIENT_ID is
 *      present and DATABASE_URL is absent. The provision module creates the
 *      Lakebase Autoscale project on first boot, then generates short-lived
 *      OAuth DB credentials with automatic rotation. No secrets needed.
 *   2. **Static URL** (local dev) -- DATABASE_URL is set in .env.
 *      Used directly with no token rotation.
 *
 * The standard Next.js pattern caches the client on `globalThis` to survive
 * HMR reloads in development.
 */

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import {
  isAutoProvisionEnabled,
  getLakebaseConnectionUrl,
  getCredentialGeneration,
  refreshDbCredential,
  invalidateDbCredential,
} from "@/lib/lakebase/provision";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __prismaTokenId: string | undefined;
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Returns a PrismaClient connected to Lakebase.
 *
 * In Databricks Apps the connection URL (including the OAuth token) is built
 * dynamically by the provision module. The pool + client are recreated when
 * the credential rotates (~every 50 min). In local dev the static
 * DATABASE_URL is used and the client persists across HMR.
 */
export async function getPrisma(): Promise<PrismaClient> {
  if (isAutoProvisionEnabled()) {
    return getAutoProvisionedPrisma();
  }
  return getStaticPrisma();
}

/**
 * Invalidate the cached Prisma client so the next `getPrisma()` call
 * creates a fresh pool with new credentials. Call this when an auth
 * error is caught to force immediate credential rotation.
 */
export async function invalidatePrismaClient(): Promise<void> {
  if (globalForPrisma.__prisma) {
    try {
      await globalForPrisma.__prisma.$disconnect();
    } catch {
      // best-effort disconnect
    }
    globalForPrisma.__prisma = undefined;
    globalForPrisma.__prismaTokenId = undefined;
  }
  invalidateDbCredential();
}

// ---------------------------------------------------------------------------
// Auto-provisioned mode (Databricks Apps)
// ---------------------------------------------------------------------------

async function getAutoProvisionedPrisma(): Promise<PrismaClient> {
  // Proactively refresh the credential if it has expired or is about to.
  // This bumps the generation counter when a new credential is minted,
  // which triggers pool recreation below.
  await refreshDbCredential();

  const generation = getCredentialGeneration();
  const tokenId = `autoscale_${generation}`;

  if (globalForPrisma.__prisma && globalForPrisma.__prismaTokenId === tokenId) {
    return globalForPrisma.__prisma;
  }

  // Credential has rotated (or first call) -- rebuild the pool
  if (globalForPrisma.__prisma) {
    try {
      await globalForPrisma.__prisma.$disconnect();
    } catch (err) {
      logger.warn("Failed to disconnect old Prisma client during rotation", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const connectionString = await getLakebaseConnectionUrl();
  const pool = new pg.Pool({
    connectionString,
    // Keep idle connection lifetime well below the credential TTL (~1h)
    // so stale connections are reaped before the token they authed with
    // could be revoked server-side.
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  pool.on("error", (err) => {
    logger.warn("pg Pool background error — will recreate on next request", {
      error: err.message,
    });
    globalForPrisma.__prisma = undefined;
    globalForPrisma.__prismaTokenId = undefined;
    invalidateDbCredential();
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = tokenId;

  logger.debug("Prisma client created with fresh credentials", {
    generation,
    tokenId,
  });

  return prisma;
}

// ---------------------------------------------------------------------------
// Static URL mode (local dev)
// ---------------------------------------------------------------------------

async function getStaticPrisma(): Promise<PrismaClient> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set and Lakebase auto-provisioning is not available. " +
        "Set DATABASE_URL in .env for local dev, or deploy as a Databricks App."
    );
  }

  if (
    globalForPrisma.__prisma &&
    globalForPrisma.__prismaTokenId === "__static__"
  ) {
    return globalForPrisma.__prisma;
  }

  if (globalForPrisma.__prisma) {
    await globalForPrisma.__prisma.$disconnect();
  }

  const pool = new pg.Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = "__static__";

  return prisma;
}

// ---------------------------------------------------------------------------
// Resilient wrapper with auth-error retry
// ---------------------------------------------------------------------------

const AUTH_ERROR_PATTERNS = [
  "authentication failed",
  "password authentication failed",
  "provided database credentials",
  "not valid",
  "FATAL:  password",
] as const;

function isAuthError(err: unknown): boolean {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const lower = msg.toLowerCase();
  return AUTH_ERROR_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Execute a callback with a PrismaClient. If the call fails with a
 * database authentication error (stale credential), the client and
 * credential are invalidated and the call is retried exactly once with
 * a freshly-provisioned connection.
 */
export async function withPrisma<T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const prisma = await getPrisma();
  try {
    return await fn(prisma);
  } catch (err) {
    if (isAuthError(err) && isAutoProvisionEnabled()) {
      logger.warn("Database auth error, rotating credentials and retrying", {
        error: err instanceof Error ? err.message : String(err),
      });
      await invalidatePrismaClient();
      const freshPrisma = await getPrisma();
      return fn(freshPrisma);
    }
    throw err;
  }
}

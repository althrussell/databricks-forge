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
  canAutoProvision,
  getLakebaseConnectionUrl,
  getCredentialGeneration,
  getCredentialExpiresAt,
  refreshDbCredential,
  invalidateDbCredential,
} from "@/lib/lakebase/provision";
import { isAuthError } from "@/lib/lakebase/auth-errors";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __prismaTokenId: string | undefined;
  __refreshTimer: ReturnType<typeof setTimeout> | undefined;
};

// In-flight rotation promise. When multiple concurrent requests all hit an
// auth error at the same time, only the first one triggers the actual
// invalidate-and-rebuild cycle. The rest await the same promise.
let _rotationInFlight: Promise<PrismaClient> | null = null;

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

  scheduleProactiveRefresh();

  return prisma;
}

// ---------------------------------------------------------------------------
// Proactive background credential refresh
// ---------------------------------------------------------------------------

const PROACTIVE_REFRESH_LEAD_MS = 5 * 60_000; // 5 minutes before expiry

/**
 * Schedule a background timer that rotates the pool BEFORE the credential
 * expires, so no request ever hits a stale credential. Called automatically
 * after each pool creation. The timer is self-healing: if it fires and
 * the credential is already fresh (e.g. a request-driven rotation beat it),
 * it simply reschedules.
 */
function scheduleProactiveRefresh(): void {
  if (globalForPrisma.__refreshTimer) {
    clearTimeout(globalForPrisma.__refreshTimer);
    globalForPrisma.__refreshTimer = undefined;
  }

  const expiresAt = getCredentialExpiresAt();
  if (!expiresAt) return;

  const delay = Math.max(expiresAt - PROACTIVE_REFRESH_LEAD_MS - Date.now(), 0);

  globalForPrisma.__refreshTimer = setTimeout(async () => {
    globalForPrisma.__refreshTimer = undefined;
    try {
      logger.info("Proactive credential rotation starting", {
        msBeforeExpiry: expiresAt - Date.now(),
      });
      invalidateDbCredential();
      // Trigger pool rebuild — getAutoProvisionedPrisma will mint a new
      // credential and scheduleProactiveRefresh for the next cycle.
      globalForPrisma.__prisma = undefined;
      globalForPrisma.__prismaTokenId = undefined;
      await getPrisma();
      logger.info("Proactive credential rotation complete");
    } catch (err) {
      logger.warn("Proactive credential rotation failed — will retry on next request", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, delay);

  logger.debug("Proactive refresh scheduled", {
    delaySec: Math.round(delay / 1_000),
    expiresAt: new Date(expiresAt).toISOString(),
  });
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

  pool.on("error", (err) => {
    logger.warn("pg Pool background error (static) — will recreate on next request", {
      error: err.message,
    });
    globalForPrisma.__prisma = undefined;
    globalForPrisma.__prismaTokenId = undefined;
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = "__static__";

  return prisma;
}

// ---------------------------------------------------------------------------
// Resilient wrapper with auth-error retry
// ---------------------------------------------------------------------------

const MAX_AUTH_RETRIES = 4;
const AUTH_RETRY_BASE_MS = 2_000;

/**
 * Execute a callback with a PrismaClient. If the call fails with a
 * database authentication error (stale credential or Lakebase Autoscale
 * cold start), the client and credential are invalidated and the call
 * is retried with exponential backoff (2s, 4s, 8s, 16s).
 *
 * The retry fires whenever Databricks App SP credentials are available
 * (canAutoProvision), even if the initial connection used a static
 * DATABASE_URL. On retry, DATABASE_URL is cleared so the fresh client
 * enters auto-provision mode with dynamic credential rotation.
 *
 * Concurrent callers that all hit an auth error at the same time share
 * a single rotation promise to avoid stomping on each other's fresh pools.
 */
export async function withPrisma<T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_AUTH_RETRIES; attempt++) {
    const prisma = await getPrisma();
    try {
      return await fn(prisma);
    } catch (err) {
      lastErr = err;
      if (!isAuthError(err) || !canAutoProvision()) throw err;

      if (attempt < MAX_AUTH_RETRIES) {
        const delayMs = AUTH_RETRY_BASE_MS * Math.pow(2, attempt);
        logger.warn("Database auth error, rotating credentials and retrying", {
          attempt: attempt + 1,
          maxRetries: MAX_AUTH_RETRIES,
          nextRetryMs: delayMs,
          error: err instanceof Error ? err.message : String(err),
        });
        await rotatePrismaClient();
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Race-safe credential rotation
// ---------------------------------------------------------------------------

/**
 * Invalidate the current client, generate fresh credentials, and return a
 * new PrismaClient. If another caller already started a rotation, return
 * the same in-flight promise so only one rotation happens at a time.
 */
async function rotatePrismaClient(): Promise<PrismaClient> {
  if (_rotationInFlight) return _rotationInFlight;

  _rotationInFlight = (async () => {
    try {
      // Clear stale static URL so getPrisma() enters auto-provision mode
      delete process.env.DATABASE_URL;
      await invalidatePrismaClient();
      return getPrisma();
    } finally {
      _rotationInFlight = null;
    }
  })();

  return _rotationInFlight;
}

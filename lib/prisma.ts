/**
 * Prisma client singleton for Lakebase.
 *
 * Uses an **external pg.Pool** passed to @prisma/adapter-pg (v7). We manage
 * the pool ourselves so we can pre-warm multiple connections before handing
 * control to PrismaClient. This prevents the "dashboard fails on first load"
 * problem where PrismaPg's internal pool creates connections lazily and bursts
 * of concurrent queries hit Lakebase's connection rate limiter.
 *
 * Two modes (chosen automatically):
 *   1. **Static URL** (startup credential or local dev) -- DATABASE_URL is
 *      set. Used directly. In Databricks Apps the startup script passes the
 *      provisioned credential as DATABASE_URL; when it expires (~1h),
 *      withPrisma catches the auth error, deletes DATABASE_URL, and switches
 *      to auto-provision mode permanently.
 *   2. **Auto-provisioned** (Databricks Apps) -- DATABRICKS_CLIENT_ID is
 *      present and DATABASE_URL is absent. The provision module generates
 *      short-lived OAuth DB credentials with automatic rotation.
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
// Connection string logging helper
// ---------------------------------------------------------------------------

function logConnectionInfo(connectionString: string): void {
  const parsed = new URL(connectionString);
  logger.info("[prisma] Connecting", {
    host: parsed.hostname,
    database: parsed.pathname.slice(1),
    user: decodeURIComponent(parsed.username),
    passwordLength: decodeURIComponent(parsed.password).length,
  });
}

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __pool: pg.Pool | undefined;
  __prismaTokenId: string | undefined;
  __refreshTimer: ReturnType<typeof setTimeout> | undefined;
  __rotationInFlight: Promise<PrismaClient> | null | undefined;
  __initInFlight: Promise<PrismaClient> | null | undefined;
  __dbReady: boolean | undefined;
  __rotationResolvedAt: number | undefined;
  __lastRotationAttemptAt: number | undefined;
};

globalForPrisma.__rotationInFlight ??= null;
globalForPrisma.__initInFlight ??= null;
globalForPrisma.__dbReady ??= false;
globalForPrisma.__rotationResolvedAt ??= 0;
globalForPrisma.__lastRotationAttemptAt ??= 0;

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

const POOL_OPTIONS: pg.PoolConfig = {
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  max: 10,
};

const POOL_WARM_TARGET = 5;

// ---------------------------------------------------------------------------
// Pool creation + pre-warming
// ---------------------------------------------------------------------------

/**
 * Create a pg.Pool, verify the first connection (with optional retries for
 * credential propagation), then pre-warm additional connections so the pool
 * is ready for concurrent query bursts.
 */
async function createAndWarmPool(
  connectionString: string,
  verifyRetries = 0,
  retryDelayMs = 3_000,
): Promise<pg.Pool> {
  const pool = new pg.Pool({ connectionString, ...POOL_OPTIONS });

  pool.on("error", (err) => {
    logger.warn("[prisma] Idle pool connection error", {
      error: err.message,
    });
  });

  // Verify first connection (with retry for credential propagation)
  let lastError: unknown;
  for (let i = 0; i <= verifyRetries; i++) {
    if (i > 0) {
      logger.warn("[prisma] Pool connection not ready, retrying", {
        attempt: i,
        maxAttempts: verifyRetries + 1,
        nextDelayMs: retryDelayMs,
      });
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
    try {
      const conn = await pool.connect();
      conn.release();
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError) {
    await pool.end().catch(() => {});
    throw lastError;
  }

  // Pre-warm additional connections concurrently (best-effort).
  // pg.Pool creates connections lazily, so concurrent connect() calls force
  // it to open multiple TCP connections. These stay idle in the pool for
  // idleTimeoutMillis, ready for the dashboard's burst of parallel queries.
  if (POOL_WARM_TARGET > 1) {
    const results = await Promise.allSettled(
      Array.from({ length: POOL_WARM_TARGET - 1 }, () =>
        pool.connect().then((c) => {
          c.release();
        })
      )
    );
    const warmed =
      results.filter((r) => r.status === "fulfilled").length + 1;
    logger.info("[prisma] Pool connections warmed", {
      warmed,
      target: POOL_WARM_TARGET,
    });
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function getPrisma(): Promise<PrismaClient> {
  if (isAutoProvisionEnabled()) {
    return getAutoProvisionedPrisma();
  }
  return getStaticPrisma();
}

export function isDatabaseReady(): boolean {
  return globalForPrisma.__dbReady ?? false;
}

export async function invalidatePrismaClient(): Promise<void> {
  const oldClient = globalForPrisma.__prisma;
  const oldPool = globalForPrisma.__pool;

  invalidateDbCredential();
  globalForPrisma.__prisma = undefined;
  globalForPrisma.__prismaTokenId = undefined;
  globalForPrisma.__pool = undefined;

  if (oldClient) {
    try {
      await oldClient.$disconnect();
    } catch {
      // best-effort disconnect
    }
  }
  if (oldPool) {
    try {
      await oldPool.end();
    } catch {
      // best-effort pool cleanup
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-provisioned mode (Databricks Apps)
// ---------------------------------------------------------------------------

async function getAutoProvisionedPrisma(): Promise<PrismaClient> {
  await refreshDbCredential();
  const generation = getCredentialGeneration();
  const tokenId = `autoscale_${generation}`;

  if (globalForPrisma.__prisma && globalForPrisma.__prismaTokenId === tokenId) {
    return globalForPrisma.__prisma;
  }

  if (globalForPrisma.__initInFlight) return globalForPrisma.__initInFlight;

  globalForPrisma.__initInFlight = buildAutoProvisionedClient(tokenId, generation).finally(() => {
    globalForPrisma.__initInFlight = null;
  });

  return globalForPrisma.__initInFlight;
}

async function buildAutoProvisionedClient(
  tokenId: string,
  generation: number
): Promise<PrismaClient> {
  // Clean up previous client + pool
  if (globalForPrisma.__prisma) {
    try {
      await globalForPrisma.__prisma.$disconnect();
    } catch (err) {
      logger.warn("[prisma] Failed to disconnect old client during rotation", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (globalForPrisma.__pool) {
    await globalForPrisma.__pool.end().catch(() => {});
    globalForPrisma.__pool = undefined;
  }

  const connectionString = await getLakebaseConnectionUrl();
  logConnectionInfo(connectionString);

  // Create pool with retry for credential propagation (up to ~24s)
  const pool = await createAndWarmPool(connectionString, 7, 3_000);
  globalForPrisma.__pool = pool;

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = tokenId;
  globalForPrisma.__dbReady = true;

  logger.info("[prisma] Client created (auto-provision mode)", {
    generation,
    tokenId,
  });

  scheduleProactiveRefresh();
  return prisma;
}

// ---------------------------------------------------------------------------
// Proactive background credential refresh
// ---------------------------------------------------------------------------

const PROACTIVE_REFRESH_LEAD_MS = 5 * 60_000;

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

    if (globalForPrisma.__rotationInFlight) {
      logger.info("[prisma] Proactive refresh skipped — rotation already in flight");
      return;
    }

    try {
      logger.info("[prisma] Proactive credential rotation starting", {
        msBeforeExpiry: expiresAt - Date.now(),
      });
      await invalidatePrismaClient();
      await getPrisma();
      logger.info("[prisma] Proactive credential rotation complete");
    } catch (err) {
      logger.warn("[prisma] Proactive credential rotation failed — will retry on next request", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, delay);

  logger.info("[prisma] Proactive refresh scheduled", {
    delaySec: Math.round(delay / 1_000),
    expiresAt: new Date(expiresAt).toISOString(),
  });
}

// ---------------------------------------------------------------------------
// Static URL mode (local dev or startup credential from start.sh)
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
  if (globalForPrisma.__pool) {
    await globalForPrisma.__pool.end().catch(() => {});
  }

  logConnectionInfo(url);

  const pool = await createAndWarmPool(url);
  globalForPrisma.__pool = pool;

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = "__static__";
  globalForPrisma.__dbReady = true;

  logger.info("[prisma] Client created (static mode)");

  return prisma;
}

// ---------------------------------------------------------------------------
// Resilient wrapper with auth-error retry
// ---------------------------------------------------------------------------

const MAX_AUTH_RETRIES = 3;
const RETRY_DELAY_MS = 2_000;

/**
 * Execute a callback with a PrismaClient. If the call fails with a
 * database authentication error (stale credential), the client and
 * credential are invalidated and the call is retried.
 *
 * Strategy on auth error:
 *   1. **Quick retry** — Wait briefly and retry. Lakebase credential
 *      propagation is eventually consistent across backends; a short
 *      delay often resolves transient auth failures without the cost of
 *      a full credential rotation.
 *   2. **Rotate** — If the quick retry also fails, invalidate the client
 *      and mint a new credential.
 *   3. **Final retry** — One last attempt after rotation.
 *
 * Concurrent callers that all hit an auth error at the same time share
 * a single rotation promise — rotatePrismaClient verifies the connection
 * before returning and enforces a cooldown to prevent callers from
 * disconnecting each other's working pools.
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
        logger.warn("[prisma] Auth error, retrying", {
          attempt: attempt + 1,
          maxRetries: MAX_AUTH_RETRIES,
          strategy: attempt === 0 ? "delay" : "rotate",
          error: err instanceof Error ? err.message : String(err),
        });

        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        } else {
          await rotatePrismaClient();
        }
      }
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Race-safe credential rotation with verification + cooldown
// ---------------------------------------------------------------------------

const ROTATION_COOLDOWN_MS = 30_000;

async function rotatePrismaClient(): Promise<PrismaClient> {
  const now = Date.now();
  if (
    globalForPrisma.__prisma &&
    now - (globalForPrisma.__rotationResolvedAt ?? 0) < ROTATION_COOLDOWN_MS
  ) {
    return globalForPrisma.__prisma;
  }
  if (now - (globalForPrisma.__lastRotationAttemptAt ?? 0) < ROTATION_COOLDOWN_MS) {
    if (globalForPrisma.__prisma) return globalForPrisma.__prisma;
    logger.warn("[prisma] Rotation skipped — cooldown active after recent failed attempt", {
      msSinceLastAttempt: now - (globalForPrisma.__lastRotationAttemptAt ?? 0),
    });
    throw new Error("Credential rotation on cooldown after recent failure");
  }

  if (globalForPrisma.__rotationInFlight) return globalForPrisma.__rotationInFlight;

  globalForPrisma.__rotationInFlight = (async () => {
    globalForPrisma.__lastRotationAttemptAt = Date.now();

    try {
      delete process.env.DATABASE_URL;
      await invalidatePrismaClient();
      logger.info(
        "[prisma] Credential rotation — switching to auto-provision mode"
      );

      // getPrisma → buildAutoProvisionedClient → createAndWarmPool
      // handles credential propagation retries and pool pre-warming.
      const client = await getPrisma();

      // Final verification with a model query
      await client.forgeRun.count();

      globalForPrisma.__rotationResolvedAt = Date.now();
      logger.info("[prisma] Credential rotation complete — connection verified");
      return client;
    } catch (err) {
      globalForPrisma.__prisma = undefined;
      globalForPrisma.__prismaTokenId = undefined;
      throw err;
    } finally {
      globalForPrisma.__rotationInFlight = null;
    }
  })();

  return globalForPrisma.__rotationInFlight;
}

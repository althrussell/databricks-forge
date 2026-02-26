/**
 * Prisma client singleton for Lakebase.
 *
 * Uses @prisma/adapter-pg with node-postgres (pg) Pool over standard TCP.
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
  __prismaTokenId: string | undefined;
  __refreshTimer: ReturnType<typeof setTimeout> | undefined;
};

let _rotationInFlight: Promise<PrismaClient> | null = null;
let _initInFlight: Promise<PrismaClient> | null = null;
let _dbReady = false;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Returns a PrismaClient connected to Lakebase.
 *
 * In Databricks Apps the connection URL (including the OAuth token) is built
 * dynamically by the provision module. The pool + client are recreated when
 * the credential rotates (~every 50 min). In local dev or when a startup
 * credential is passed, the static DATABASE_URL is used directly.
 */
export async function getPrisma(): Promise<PrismaClient> {
  if (isAutoProvisionEnabled()) {
    return getAutoProvisionedPrisma();
  }
  return getStaticPrisma();
}

/**
 * True once a Prisma client has been successfully created.
 * API routes can use this to return 503 instead of blocking on init.
 */
export function isDatabaseReady(): boolean {
  return _dbReady;
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
  await refreshDbCredential();
  const generation = getCredentialGeneration();
  const tokenId = `autoscale_${generation}`;

  if (globalForPrisma.__prisma && globalForPrisma.__prismaTokenId === tokenId) {
    return globalForPrisma.__prisma;
  }

  if (_initInFlight) return _initInFlight;

  _initInFlight = buildAutoProvisionedPool(tokenId, generation).finally(() => {
    _initInFlight = null;
  });

  return _initInFlight;
}

async function buildAutoProvisionedPool(
  tokenId: string,
  generation: number
): Promise<PrismaClient> {
  if (globalForPrisma.__prisma) {
    try {
      await globalForPrisma.__prisma.$disconnect();
    } catch (err) {
      logger.warn("[prisma] Failed to disconnect old client during rotation", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const connectionString = await getLakebaseConnectionUrl();
  logConnectionInfo(connectionString);

  const pool = new pg.Pool({
    connectionString,
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  const capturedTokenId = tokenId;
  pool.on("error", (err) => {
    if (globalForPrisma.__prismaTokenId !== capturedTokenId) return;
    logger.warn("[prisma] Pool background error — will recreate on next request", {
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
  _dbReady = true;

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
    try {
      logger.info("[prisma] Proactive credential rotation starting", {
        msBeforeExpiry: expiresAt - Date.now(),
      });
      invalidateDbCredential();
      globalForPrisma.__prisma = undefined;
      globalForPrisma.__prismaTokenId = undefined;
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

  logConnectionInfo(url);

  const pool = new pg.Pool({ connectionString: url });

  pool.on("error", (err) => {
    if (globalForPrisma.__prismaTokenId !== "__static__") return;
    logger.warn("[prisma] Pool background error (static) — will recreate on next request", {
      error: err.message,
    });
    globalForPrisma.__prisma = undefined;
    globalForPrisma.__prismaTokenId = undefined;
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = "__static__";
  _dbReady = true;

  logger.info("[prisma] Client created (static mode)");

  return prisma;
}

// ---------------------------------------------------------------------------
// Resilient wrapper with auth-error retry
// ---------------------------------------------------------------------------

const MAX_AUTH_RETRIES = 2;

/**
 * Execute a callback with a PrismaClient. If the call fails with a
 * database authentication error (stale credential), the client and
 * credential are invalidated and the call is retried.
 *
 * The retry fires whenever Databricks App SP credentials are available
 * (canAutoProvision), even if the initial connection used a static
 * DATABASE_URL. On retry, DATABASE_URL is cleared so the fresh client
 * enters auto-provision mode with dynamic credential rotation.
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
        logger.warn("[prisma] Auth error, rotating credentials", {
          attempt: attempt + 1,
          maxRetries: MAX_AUTH_RETRIES,
          error: err instanceof Error ? err.message : String(err),
        });
        await rotatePrismaClient();
      }
    }
  }

  throw lastErr;
}

// ---------------------------------------------------------------------------
// Race-safe credential rotation with verification + cooldown
// ---------------------------------------------------------------------------

let _rotationResolvedAt = 0;
const ROTATION_COOLDOWN_MS = 10_000;
const VERIFY_MAX_ATTEMPTS = 4;

async function rotatePrismaClient(): Promise<PrismaClient> {
  if (
    globalForPrisma.__prisma &&
    Date.now() - _rotationResolvedAt < ROTATION_COOLDOWN_MS
  ) {
    return globalForPrisma.__prisma;
  }

  if (_rotationInFlight) return _rotationInFlight;

  _rotationInFlight = (async () => {
    try {
      delete process.env.DATABASE_URL;
      await invalidatePrismaClient();
      logger.info(
        "[prisma] Credential rotation — switching to auto-provision mode"
      );

      const client = await getPrisma();

      for (let i = 0; i < VERIFY_MAX_ATTEMPTS; i++) {
        try {
          await client.$queryRaw`SELECT 1`;
          _rotationResolvedAt = Date.now();
          logger.info("[prisma] Credential rotation complete — connection verified");
          return client;
        } catch (verifyErr) {
          if (i < VERIFY_MAX_ATTEMPTS - 1) {
            const delay = 1_000 * Math.pow(2, i);
            logger.warn("[prisma] Rotation: connection not ready, waiting", {
              attempt: i + 1,
              maxAttempts: VERIFY_MAX_ATTEMPTS,
              nextDelayMs: delay,
              error:
                verifyErr instanceof Error
                  ? verifyErr.message
                  : String(verifyErr),
            });
            await new Promise((r) => setTimeout(r, delay));
          } else {
            throw verifyErr;
          }
        }
      }

      throw new Error("Rotation verification failed after all attempts");
    } finally {
      _rotationInFlight = null;
    }
  })();

  return _rotationInFlight;
}

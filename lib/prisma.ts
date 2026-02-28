/**
 * Prisma client singleton for Lakebase.
 *
 * Uses @prisma/adapter-pg (v7) which manages its own pg Pool internally.
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

// All mutable coordination state lives on globalThis so that separate
// Next.js server bundles (RSC vs API routes) share a single set of guards,
// preventing dueling credential rotations.
const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
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
// Shared pool configuration for PrismaPg v7
// ---------------------------------------------------------------------------

const POOL_OPTIONS = {
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  max: 10,
} as const;

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Returns a PrismaClient connected to Lakebase.
 *
 * In Databricks Apps the connection URL (including the OAuth token) is built
 * dynamically by the provision module. The adapter + client are recreated
 * when the credential rotates (~every 50 min). In local dev or when a
 * startup credential is passed, the static DATABASE_URL is used directly.
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
  return globalForPrisma.__dbReady ?? false;
}

/**
 * Invalidate the cached Prisma client so the next `getPrisma()` call
 * creates a fresh adapter with new credentials. Call this when an auth
 * error is caught to force immediate credential rotation.
 */
export async function invalidatePrismaClient(): Promise<void> {
  // Grab reference before clearing, then invalidate credential cache and
  // singleton BEFORE the potentially slow $disconnect(). This prevents a
  // race where a concurrent caller generates a fresh credential during
  // $disconnect() and then invalidateDbCredential() clears it afterward.
  const oldClient = globalForPrisma.__prisma;
  invalidateDbCredential();
  globalForPrisma.__prisma = undefined;
  globalForPrisma.__prismaTokenId = undefined;

  if (oldClient) {
    try {
      await oldClient.$disconnect();
    } catch {
      // best-effort disconnect
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

  const adapter = new PrismaPg({ connectionString, ...POOL_OPTIONS });
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

  const adapter = new PrismaPg({ connectionString: url, ...POOL_OPTIONS });
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
          // Quick retry: credential may be valid but the pool connection
          // landed on a backend that hasn't received it yet.
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
const VERIFY_INITIAL_DELAY_MS = 3_000;
const VERIFY_MAX_ATTEMPTS = 8;
const VERIFY_INTERVAL_MS = 3_000;

async function rotatePrismaClient(): Promise<PrismaClient> {
  // Cooldown: skip rotation if a recent one succeeded (and client exists),
  // OR if a rotation was attempted recently (even if it failed). This
  // prevents a thundering herd of credential mints when Lakebase is slow
  // to propagate a new credential.
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

      const client = await getPrisma();

      // Lakebase credentials can take 15-30s to propagate after minting.
      // Wait before first attempt, then use generous intervals to avoid
      // exhausting the connection rate limiter.
      logger.info("[prisma] Rotation: waiting for credential propagation", {
        initialDelayMs: VERIFY_INITIAL_DELAY_MS,
      });
      await new Promise((r) => setTimeout(r, VERIFY_INITIAL_DELAY_MS));

      for (let i = 0; i < VERIFY_MAX_ATTEMPTS; i++) {
        try {
          // Use a model query (not $queryRaw) for verification. Model queries
          // go through PrismaPg's transaction-wrapped connection path, which is
          // different from $queryRaw's simple pool.query() path. Verifying with
          // the same path that real queries use ensures the connection is fully
          // established for subsequent model operations.
          await client.forgeRun.count();

          // Pre-warm the pool with concurrent queries. Lakebase Autoscale
          // may route new connections to different backends, and credential
          // propagation is eventually consistent. Establishing several pool
          // connections now prevents a burst of auth failures when concurrent
          // callers resume after rotation.
          const POOL_WARM_COUNT = 3;
          logger.info("[prisma] Rotation: warming pool connections", {
            count: POOL_WARM_COUNT,
          });
          await Promise.all(
            Array.from({ length: POOL_WARM_COUNT }, () =>
              client.forgeRun.count().catch(() => {
                /* best-effort pre-warm */
              })
            )
          );

          globalForPrisma.__rotationResolvedAt = Date.now();
          logger.info("[prisma] Credential rotation complete — connection verified");
          return client;
        } catch (verifyErr) {
          if (i < VERIFY_MAX_ATTEMPTS - 1) {
            logger.warn("[prisma] Rotation: connection not ready, waiting", {
              attempt: i + 1,
              maxAttempts: VERIFY_MAX_ATTEMPTS,
              nextDelayMs: VERIFY_INTERVAL_MS,
              error:
                verifyErr instanceof Error
                  ? verifyErr.message
                  : String(verifyErr),
            });
            await new Promise((r) => setTimeout(r, VERIFY_INTERVAL_MS));
          } else {
            globalForPrisma.__prisma = undefined;
            globalForPrisma.__prismaTokenId = undefined;
            throw verifyErr;
          }
        }
      }

      globalForPrisma.__prisma = undefined;
      globalForPrisma.__prismaTokenId = undefined;
      throw new Error("Rotation verification failed after all attempts");
    } finally {
      globalForPrisma.__rotationInFlight = null;
    }
  })();

  return globalForPrisma.__rotationInFlight;
}

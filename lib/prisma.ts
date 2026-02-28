/**
 * Prisma client singleton for Lakebase.
 *
 * Uses the official Databricks Node.js pattern: pg.Pool with an async
 * `password` function that returns cached OAuth tokens. The pool calls
 * the function each time it creates a new connection, so tokens are
 * always fresh. PrismaClient is created **once** and never recreated.
 *
 * Two modes (chosen automatically):
 *   1. **Static URL** (local dev or platform binding) -- DATABASE_URL is
 *      set. Used directly with a normal pg.Pool connection string.
 *   2. **Auto-provisioned** (Databricks Apps) -- LAKEBASE_POOLER_HOST and
 *      LAKEBASE_ENDPOINT_NAME are set by start.sh. The pool uses the
 *      pooler endpoint with an async password function for OAuth tokens.
 *
 * The standard Next.js pattern caches the client on `globalThis` to
 * survive HMR reloads in development.
 */

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";
import {
  isAutoProvisionEnabled,
  canAutoProvision,
  getPoolConfig,
} from "@/lib/lakebase/provision";
import { isAuthError } from "@/lib/lakebase/auth-errors";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __pool: pg.Pool | undefined;
  __initInFlight: Promise<PrismaClient> | null | undefined;
  __dbReady: boolean | undefined;
};

globalForPrisma.__initInFlight ??= null;
globalForPrisma.__dbReady ??= false;

// ---------------------------------------------------------------------------
// Pool configuration
// ---------------------------------------------------------------------------

const POOL_OPTIONS: Partial<pg.PoolConfig> = {
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 60_000,
};

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function getPrisma(): Promise<PrismaClient> {
  if (globalForPrisma.__prisma) return globalForPrisma.__prisma;
  if (globalForPrisma.__initInFlight) return globalForPrisma.__initInFlight;

  globalForPrisma.__initInFlight = initPrisma().finally(() => {
    globalForPrisma.__initInFlight = null;
  });

  return globalForPrisma.__initInFlight;
}

export function isDatabaseReady(): boolean {
  return globalForPrisma.__dbReady ?? false;
}

export async function invalidatePrismaClient(): Promise<void> {
  const oldClient = globalForPrisma.__prisma;
  const oldPool = globalForPrisma.__pool;

  globalForPrisma.__prisma = undefined;
  globalForPrisma.__pool = undefined;
  globalForPrisma.__dbReady = false;

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
// One-time initialization
// ---------------------------------------------------------------------------

async function initPrisma(): Promise<PrismaClient> {
  let pool: pg.Pool;

  if (isAutoProvisionEnabled()) {
    const config = getPoolConfig();
    logger.info("[prisma] Initializing (auto-provision mode, pooler endpoint)", {
      host: config.host,
      database: config.database,
      user: config.user,
      credentialSeeded: !!process.env.LAKEBASE_INITIAL_TOKEN,
    });
    pool = new pg.Pool({ ...config, ...POOL_OPTIONS });
  } else {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error(
        "DATABASE_URL is not set and Lakebase auto-provisioning is not available. " +
          "Set DATABASE_URL in .env for local dev, or deploy as a Databricks App."
      );
    }
    const parsed = new URL(url);
    logger.info("[prisma] Initializing (static URL mode)", {
      host: parsed.hostname,
      database: parsed.pathname.slice(1),
      user: decodeURIComponent(parsed.username),
    });
    pool = new pg.Pool({ connectionString: url, ...POOL_OPTIONS });
  }

  pool.on("error", (err) => {
    logger.warn("[prisma] Idle pool connection error", {
      error: err.message,
    });
  });

  // Verify connectivity with one connection before proceeding
  const conn = await pool.connect();
  conn.release();

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__pool = pool;
  globalForPrisma.__dbReady = true;

  logger.info("[prisma] Client created and connection verified.");

  return prisma;
}

// ---------------------------------------------------------------------------
// Resilient wrapper with auth-error retry
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 2_000;

/**
 * Execute a callback with a PrismaClient. On auth errors (expired token),
 * the pool creates a new connection which calls the async password
 * function for a fresh token. We just retry after a brief delay.
 */
export async function withPrisma<T>(
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const prisma = await getPrisma();
    try {
      return await fn(prisma);
    } catch (err) {
      lastErr = err;

      if (!isAuthError(err) || !canAutoProvision()) throw err;

      if (attempt < MAX_RETRIES) {
        logger.warn("[prisma] Auth error, retrying after delay", {
          attempt: attempt + 1,
          maxRetries: MAX_RETRIES,
          error: err instanceof Error ? err.message : String(err),
        });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  }

  throw lastErr;
}

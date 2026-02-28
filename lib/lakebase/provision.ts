/**
 * Lakebase Autoscale provisioning and pool configuration.
 *
 * Uses the official Databricks Node.js pattern: pg.Pool with an async
 * `password` function that returns cached OAuth tokens, refreshing them
 * 5 minutes before expiry. The pool calls the function each time it
 * creates a new connection, so tokens are always fresh.
 *
 * Two modes:
 *   1. Auto-provision (Databricks Apps) -- LAKEBASE_ENDPOINT_NAME +
 *      LAKEBASE_POOLER_HOST are set by start.sh. The async password
 *      function generates DB credentials via the Lakebase API.
 *   2. Static URL (local dev) -- DATABASE_URL set in .env. Falls through
 *      to the caller (lib/prisma.ts) to use the URL directly.
 */

import { logger } from "@/lib/logger";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/dbx/fetch-with-timeout";

// ---------------------------------------------------------------------------
// Shared mutable state on globalThis
// ---------------------------------------------------------------------------

interface CachedToken {
  value: string;
  expiresAt: number; // epoch ms
}

interface DbCredentialCache {
  token: string;
  expires: number; // epoch ms
}

const globalForProvision = globalThis as unknown as {
  __provisionInflightMap: Map<string, Promise<unknown>> | undefined;
  __endpointName: string | null | undefined;
  __wsToken: CachedToken | null | undefined;
  __dbCredentialCache: DbCredentialCache | null | undefined;
};

if (!globalForProvision.__provisionInflightMap) {
  globalForProvision.__provisionInflightMap = new Map();
}
globalForProvision.__endpointName ??= null;
globalForProvision.__wsToken ??= null;

// Seed the DB credential cache from start.sh env vars (already-propagated
// startup credential). This avoids generating a fresh credential at runtime
// that hasn't had time to propagate to PgBouncer.
if (globalForProvision.__dbCredentialCache === undefined) {
  const initToken = process.env.LAKEBASE_INITIAL_TOKEN;
  const initExpires = process.env.LAKEBASE_INITIAL_TOKEN_EXPIRES;
  if (initToken && initExpires) {
    globalForProvision.__dbCredentialCache = {
      token: initToken,
      expires: new Date(initExpires).getTime(),
    };
  } else {
    globalForProvision.__dbCredentialCache = null;
  }
}

// ---------------------------------------------------------------------------
// In-flight deduplication helper
// ---------------------------------------------------------------------------

function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const map = globalForProvision.__provisionInflightMap!;
  const existing = map.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = fn().finally(() => {
    map.delete(key);
  });

  map.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_ID_BASE = "databricks-forge";
const BRANCH_ID = "production";
const DATABASE_NAME = "databricks_postgres";
const PG_VERSION = "17";
const DISPLAY_NAME = "Databricks Forge AI";

function getProjectId(): string {
  if (process.env.LAKEBASE_PROJECT_ID) return process.env.LAKEBASE_PROJECT_ID;
  const clientId = process.env.DATABRICKS_CLIENT_ID || "";
  if (clientId) return `${PROJECT_ID_BASE}-${clientId.slice(0, 8)}`;
  return PROJECT_ID_BASE;
}

const LAKEBASE_API_TIMEOUT = 30_000;
const PROJECT_CREATION_TIMEOUT = 120_000;
const LRO_POLL_INTERVAL = 5_000;

// ---------------------------------------------------------------------------
// Host helper
// ---------------------------------------------------------------------------

function getHost(): string {
  let host = process.env.DATABRICKS_HOST ?? "";
  if (host && !host.startsWith("https://")) host = `https://${host}`;
  host = host.replace(/\/+$/, "");
  if (!host) throw new Error("DATABRICKS_HOST is not set");
  return host;
}

// ---------------------------------------------------------------------------
// Workspace OAuth token (for REST API calls, NOT for Postgres)
// ---------------------------------------------------------------------------

async function getWorkspaceToken(): Promise<string> {
  const cached = globalForProvision.__wsToken;
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.value;
  }

  return dedup("wsToken", async () => {
    const clientId = process.env.DATABRICKS_CLIENT_ID;
    const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "DATABRICKS_CLIENT_ID / DATABRICKS_CLIENT_SECRET not available"
      );
    }

    const host = getHost();
    const resp = await fetchWithTimeout(
      `${host}/oidc/v1/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: "all-apis",
        }),
      },
      TIMEOUTS.AUTH
    );

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Workspace OAuth failed (${resp.status}): ${text}`);
    }

    const data: { access_token: string; expires_in: number } =
      await resp.json();
    globalForProvision.__wsToken = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1_000,
    };

    logger.info("[provision] Workspace token acquired", {
      expiresInSec: data.expires_in,
    });

    return globalForProvision.__wsToken!.value;
  });
}

// ---------------------------------------------------------------------------
// REST API helpers
// ---------------------------------------------------------------------------

async function lakebaseApi(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const host = getHost();
  const token = await getWorkspaceToken();
  return fetchWithTimeout(
    `${host}/api/2.0/postgres/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
    LAKEBASE_API_TIMEOUT
  );
}

// ---------------------------------------------------------------------------
// Project management (idempotent)
// ---------------------------------------------------------------------------

async function projectExists(): Promise<boolean> {
  const projectId = getProjectId();
  const resp = await lakebaseApi("GET", `projects/${projectId}`);
  if (resp.status === 404) return false;
  if (resp.ok) return true;
  const text = await resp.text();
  throw new Error(`Check project failed (${resp.status}): ${text}`);
}

async function createProject(): Promise<void> {
  const projectId = getProjectId();
  logger.info("[provision] Creating Lakebase Autoscale project...", {
    projectId,
  });

  const resp = await lakebaseApi(
    "POST",
    `projects?project_id=${encodeURIComponent(projectId)}`,
    {
      spec: {
        display_name: DISPLAY_NAME,
        pg_version: PG_VERSION,
      },
    }
  );

  if (resp.status === 409) {
    logger.info("[provision] Lakebase project already exists (409)");
    return;
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Create project failed (${resp.status}): ${text}`);
  }

  const operation = await resp.json();

  if (operation.name && !operation.done) {
    await pollOperation(operation.name);
  }

  logger.info("[provision] Lakebase Autoscale project created", { projectId });
}

async function pollOperation(operationName: string): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < PROJECT_CREATION_TIMEOUT) {
    await new Promise((r) => setTimeout(r, LRO_POLL_INTERVAL));

    const resp = await lakebaseApi("GET", operationName);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Poll operation failed (${resp.status}): ${text}`);
    }

    const op = await resp.json();
    if (op.done) {
      if (op.error) {
        throw new Error(
          `Project creation failed: ${JSON.stringify(op.error)}`
        );
      }
      return;
    }

    logger.info("[provision] Waiting for Lakebase project creation...", {
      elapsedSec: Math.round((Date.now() - start) / 1_000),
    });
  }

  throw new Error(
    `Project creation timed out after ${PROJECT_CREATION_TIMEOUT / 1_000}s`
  );
}

// ---------------------------------------------------------------------------
// Endpoint name resolution (for credential generation)
// ---------------------------------------------------------------------------

async function resolveEndpointName(): Promise<string> {
  if (globalForProvision.__endpointName) {
    return globalForProvision.__endpointName;
  }

  // Prefer the env var set by start.sh (avoids an API call at runtime)
  const envName = process.env.LAKEBASE_ENDPOINT_NAME;
  if (envName) {
    globalForProvision.__endpointName = envName;
    return envName;
  }

  return dedup("endpoint", async () => {
    const listResp = await lakebaseApi(
      "GET",
      `projects/${getProjectId()}/branches/${BRANCH_ID}/endpoints`
    );
    if (!listResp.ok) {
      const text = await listResp.text();
      throw new Error(`List endpoints failed (${listResp.status}): ${text}`);
    }

    const data = await listResp.json();
    const endpoints: Array<{ name: string }> =
      data.endpoints ?? data.items ?? [];

    if (endpoints.length === 0) {
      throw new Error(
        `No endpoints found on projects/${getProjectId()}/branches/${BRANCH_ID}`
      );
    }

    const epName = endpoints[0].name;
    globalForProvision.__endpointName = epName;

    logger.info("[provision] Endpoint resolved", { endpoint: epName });
    return epName;
  });
}

// ---------------------------------------------------------------------------
// Cached async password function (official Databricks Node.js pattern)
//
// pg.Pool calls `password()` each time it creates a new connection.
// We cache the DB credential and refresh it 5 minutes before expiry.
// ---------------------------------------------------------------------------

const REFRESH_LEAD_MS = 5 * 60_000;

async function fetchDbCredential(): Promise<DbCredentialCache> {
  const endpointName = await resolveEndpointName();

  const resp = await lakebaseApi("POST", "credentials", {
    endpoint: endpointName,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Generate DB credential failed (${resp.status}): ${text}`);
  }

  const data: { token: string; expire_time?: string } = await resp.json();

  const expires = data.expire_time
    ? new Date(data.expire_time).getTime()
    : Date.now() + 3_600_000;

  logger.info("[provision] DB credential generated", {
    expiresAt: new Date(expires).toISOString(),
  });

  return { token: data.token, expires };
}

/**
 * Cached DB password function. Returns the current token if still valid,
 * otherwise fetches a fresh one. Safe to call concurrently — dedup
 * ensures only one in-flight fetch.
 *
 * The cache lives on globalThis so it is shared across all Next.js route
 * chunks (Turbopack bundles each route separately; module-level variables
 * are NOT shared, but globalThis is).
 */
async function cachedDbPassword(): Promise<string> {
  const cache = globalForProvision.__dbCredentialCache;
  const now = Date.now();
  if (cache && now < cache.expires - REFRESH_LEAD_MS) {
    return cache.token;
  }

  return dedup("dbCredential", async () => {
    const cache2 = globalForProvision.__dbCredentialCache;
    const now2 = Date.now();
    if (cache2 && now2 < cache2.expires - REFRESH_LEAD_MS) {
      return cache2.token;
    }

    globalForProvision.__dbCredentialCache = await fetchDbCredential();
    return globalForProvision.__dbCredentialCache.token;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * True when running as a Databricks App with the pooler endpoint
 * configured. In this mode the server uses pg.Pool with an async
 * password function against the pooler host.
 */
export function isAutoProvisionEnabled(): boolean {
  return !!(
    process.env.DATABRICKS_CLIENT_ID &&
    process.env.DATABRICKS_CLIENT_SECRET &&
    process.env.DATABRICKS_HOST &&
    process.env.LAKEBASE_POOLER_HOST &&
    !process.env.DATABASE_URL
  );
}

/**
 * True when Databricks App SP credentials are available, regardless of
 * whether DATABASE_URL is set. Used by withPrisma to decide whether
 * auth-error retry is meaningful.
 */
export function canAutoProvision(): boolean {
  return !!(
    process.env.DATABRICKS_CLIENT_ID &&
    process.env.DATABRICKS_CLIENT_SECRET &&
    process.env.DATABRICKS_HOST
  );
}

/**
 * Ensure the Lakebase Autoscale project exists, creating it on first boot.
 * Idempotent -- subsequent calls are near-instant.
 */
export async function ensureLakebaseProject(): Promise<void> {
  if (await projectExists()) {
    logger.info("[provision] Lakebase project exists", {
      projectId: getProjectId(),
    });
    return;
  }
  await createProject();
}

/**
 * Returns pg.Pool configuration for the Lakebase pooler endpoint.
 * The `password` field is an async function that returns a cached
 * OAuth DB credential, refreshing it 5 minutes before expiry.
 */
export function getPoolConfig(): {
  host: string;
  port: number;
  database: string;
  user: string;
  password: () => Promise<string>;
  ssl: { rejectUnauthorized: boolean };
} {
  const host = process.env.LAKEBASE_POOLER_HOST;
  const user = process.env.LAKEBASE_USERNAME;

  if (!host || !user) {
    throw new Error(
      "LAKEBASE_POOLER_HOST / LAKEBASE_USERNAME not set. " +
        "These are set by start.sh during Lakebase provisioning."
    );
  }

  return {
    host,
    port: 5432,
    database: DATABASE_NAME,
    user,
    password: cachedDbPassword,
    ssl: { rejectUnauthorized: true },
  };
}

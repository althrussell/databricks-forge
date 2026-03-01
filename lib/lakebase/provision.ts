/**
 * Lakebase Autoscale self-provisioning.
 *
 * Automatically creates and connects to a Lakebase Autoscale project using
 * OAuth tokens from the Databricks Apps service principal. No secrets, no
 * manual setup, no passwords.
 *
 * Two modes:
 *   1. Auto-provision (Databricks Apps) -- DATABRICKS_CLIENT_ID present,
 *      DATABASE_URL absent. Creates the project on first boot, generates
 *      short-lived DB credentials, rotates tokens automatically.
 *   2. Static URL (local dev) -- DATABASE_URL set in .env. Falls through
 *      to the caller (lib/prisma.ts) to use the URL directly.
 */

import { logger } from "@/lib/logger";
import { fetchWithTimeout, TIMEOUTS } from "@/lib/dbx/fetch-with-timeout";

// ---------------------------------------------------------------------------
// Shared mutable state on globalThis
// ---------------------------------------------------------------------------
// Next.js App Router bundles RSC and API routes separately. Module-scoped
// `let` variables exist independently in each bundle, but they share a
// single `globalThis`. All mutable provision state lives here so that
// credential generation counters, cached tokens, and dedup guards are
// consistent across bundles.

interface CachedToken {
  value: string;
  expiresAt: number; // epoch ms
}

const globalForProvision = globalThis as unknown as {
  __provisionInflightMap: Map<string, Promise<unknown>> | undefined;
  __endpointDirectHost: string | null | undefined;
  __endpointPoolerHost: string | null | undefined;
  __endpointName: string | null | undefined;
  __username: string | null | undefined;
  __wsToken: CachedToken | null | undefined;
  __dbCredential: CachedToken | null | undefined;
  __credentialGeneration: number | undefined;
};

if (!globalForProvision.__provisionInflightMap) {
  globalForProvision.__provisionInflightMap = new Map();
}
globalForProvision.__endpointDirectHost ??= null;
globalForProvision.__endpointPoolerHost ??= null;
globalForProvision.__endpointName ??= null;
globalForProvision.__username ??= null;
globalForProvision.__wsToken ??= null;
globalForProvision.__dbCredential ??= null;
globalForProvision.__credentialGeneration ??= 0;

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
const LAKEBASE_AUTH_MODES = ["oauth", "native_password"] as const;
export type LakebaseAuthMode = (typeof LAKEBASE_AUTH_MODES)[number];

export function getLakebaseAuthMode(): LakebaseAuthMode {
  const raw = process.env.LAKEBASE_AUTH_MODE ?? "oauth";
  if (raw === "oauth" || raw === "native_password") {
    return raw;
  }
  logger.warn("[provision] Invalid LAKEBASE_AUTH_MODE, defaulting to oauth", {
    value: raw,
    allowed: LAKEBASE_AUTH_MODES,
  });
  return "oauth";
}

export function isNativePasswordMode(): boolean {
  return getLakebaseAuthMode() === "native_password";
}

function getProjectId(): string {
  if (process.env.LAKEBASE_PROJECT_ID) return process.env.LAKEBASE_PROJECT_ID;
  const clientId = process.env.DATABRICKS_CLIENT_ID || "";
  if (clientId) return `${PROJECT_ID_BASE}-${clientId.slice(0, 8)}`;
  return PROJECT_ID_BASE;
}

const LAKEBASE_API_TIMEOUT = 30_000;
const PROJECT_CREATION_TIMEOUT = 120_000;
const LRO_POLL_INTERVAL = 5_000;

// (Cached state lives on globalForProvision — see top of file)

function derivePoolerHost(directHost: string): string {
  return directHost.replace(/^(ep-[^.]+)/, "$1-pooler");
}

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

    const data: { access_token: string; expires_in: number } = await resp.json();
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
  logger.info("[provision] Creating Lakebase Autoscale project...", { projectId });

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
// Endpoint resolution
// ---------------------------------------------------------------------------

async function resolveEndpoint(): Promise<{
  directHost: string;
  poolerHost: string;
  name: string;
}> {
  if (
    globalForProvision.__endpointDirectHost &&
    globalForProvision.__endpointPoolerHost &&
    globalForProvision.__endpointName
  ) {
    return {
      directHost: globalForProvision.__endpointDirectHost,
      poolerHost: globalForProvision.__endpointPoolerHost,
      name: globalForProvision.__endpointName,
    };
  }

  return dedup("endpoint", async () => {
    const envEndpointName = process.env.LAKEBASE_ENDPOINT_NAME;
    const envPoolerHost = process.env.LAKEBASE_POOLER_HOST;

    if (envEndpointName && envPoolerHost) {
      const detailResp = await lakebaseApi("GET", envEndpointName);
      if (!detailResp.ok) {
        const text = await detailResp.text();
        throw new Error(`Get endpoint failed (${detailResp.status}): ${text}`);
      }
      const detail = await detailResp.json();
      const directHost: string | undefined = detail.status?.hosts?.host;
      if (!directHost) {
        throw new Error(
          `Endpoint ${envEndpointName} has no host — is the compute still starting? ` +
            `Detail: ${JSON.stringify(detail)}`
        );
      }

      globalForProvision.__endpointDirectHost = directHost;
      globalForProvision.__endpointPoolerHost = envPoolerHost;
      globalForProvision.__endpointName = envEndpointName;

      logger.info("[provision] Endpoint resolved from startup contract", {
        endpoint: envEndpointName,
        directHost,
        poolerHost: envPoolerHost,
      });

      return {
        directHost,
        poolerHost: envPoolerHost,
        name: envEndpointName,
      };
    }

    const listResp = await lakebaseApi(
      "GET",
      `projects/${getProjectId()}/branches/${BRANCH_ID}/endpoints`
    );
    if (!listResp.ok) {
      const text = await listResp.text();
      throw new Error(`List endpoints failed (${listResp.status}): ${text}`);
    }

    const data = await listResp.json();
    const endpoints: Array<{ name: string }> = data.endpoints ?? data.items ?? [];

    if (endpoints.length === 0) {
      throw new Error(
        `No endpoints found on projects/${getProjectId()}/branches/${BRANCH_ID}`
      );
    }

    const epName = endpoints[0].name;
    const detailResp = await lakebaseApi("GET", epName);
    if (!detailResp.ok) {
      const text = await detailResp.text();
      throw new Error(`Get endpoint failed (${detailResp.status}): ${text}`);
    }

    const detail = await detailResp.json();
    const directHost: string | undefined = detail.status?.hosts?.host;
    if (!directHost) {
      throw new Error(
        `Endpoint ${epName} has no host — is the compute still starting? ` +
          `Detail: ${JSON.stringify(detail)}`
      );
    }

    const poolerHost = derivePoolerHost(directHost);
    globalForProvision.__endpointDirectHost = directHost;
    globalForProvision.__endpointPoolerHost = poolerHost;
    globalForProvision.__endpointName = epName;

    logger.info("[provision] Endpoint resolved", {
      endpoint: epName,
      directHost,
      poolerHost,
    });

    return { directHost, poolerHost, name: epName };
  });
}

// ---------------------------------------------------------------------------
// Username (SCIM Me)
// ---------------------------------------------------------------------------

async function resolveUsername(): Promise<string> {
  if (globalForProvision.__username) return globalForProvision.__username;

  // Use the cached username from the startup provisioning script to avoid
  // a redundant SCIM /Me call that risks 429 rate limiting.
  const envUsername = process.env.LAKEBASE_USERNAME;
  if (envUsername) {
    globalForProvision.__username = envUsername;
    logger.info("[provision] Username resolved from LAKEBASE_USERNAME env", {
      identity: envUsername,
    });
    return envUsername;
  }

  return dedup("username", async () => {
    const host = getHost();
    const token = await getWorkspaceToken();
    const maxRetries = 5;
    let lastErr: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const resp = await fetchWithTimeout(
        `${host}/api/2.0/preview/scim/v2/Me`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
        TIMEOUTS.AUTH
      );

      if (resp.ok) {
        const data: { userName?: string; displayName?: string } = await resp.json();
        const identity = data.userName ?? data.displayName ?? null;
        if (!identity) {
          throw new Error("Could not determine workspace identity from /Me");
        }
        globalForProvision.__username = identity;

        logger.info("[provision] Username resolved via SCIM /Me", { identity });

        return globalForProvision.__username;
      }

      const text = await resp.text();

      if (resp.status === 429 && attempt < maxRetries - 1) {
        const delaySec = Math.pow(2, attempt + 1);
        logger.warn(`[provision] SCIM /Me rate-limited (429), retrying in ${delaySec}s`, {
          attempt: attempt + 1,
          maxRetries,
        });
        await new Promise((r) => setTimeout(r, delaySec * 1000));
        continue;
      }

      lastErr = new Error(`SCIM /Me failed (${resp.status}): ${text}`);
    }

    throw lastErr!;
  });
}

// ---------------------------------------------------------------------------
// DB credential (Postgres password token, 1-hour TTL)
// ---------------------------------------------------------------------------

async function generateDbCredential(): Promise<string> {
  const cached = globalForProvision.__dbCredential;
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.value;
  }

  return dedup("dbCredential", async () => {
    // Re-check after acquiring the dedup slot — another caller may have
    // populated the cache while we waited.
    const rechecked = globalForProvision.__dbCredential;
    if (rechecked && Date.now() < rechecked.expiresAt - 60_000) {
      return rechecked.value;
    }

    const { name: endpointName } = await resolveEndpoint();

    const resp = await lakebaseApi("POST", "credentials", {
      endpoint: endpointName,
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `Generate DB credential failed (${resp.status}): ${text}`
      );
    }

    const data: { token?: string; expire_time?: string } = await resp.json();
    if (!data.token) {
      throw new Error("Generate DB credential returned no token");
    }

    const expiresAt = data.expire_time
      ? new Date(data.expire_time).getTime()
      : Date.now() + 3_600_000;

    globalForProvision.__dbCredential = {
      value: data.token,
      expiresAt,
    };
    globalForProvision.__credentialGeneration =
      (globalForProvision.__credentialGeneration ?? 0) + 1;

    logger.info("[provision] DB credential generated", {
      generation: globalForProvision.__credentialGeneration,
      hasToken: true,
      tokenLength: data.token.length,
      tokenExpiresInSec: Math.max(Math.round((expiresAt - Date.now()) / 1_000), 0),
      expiresAt: new Date(expiresAt).toISOString(),
    });

    return globalForProvision.__dbCredential!.value;
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * True when running as a Databricks App (SP credentials available) and no
 * static DATABASE_URL has been provided. In this mode the app self-provisions
 * its Lakebase project and manages tokens automatically.
 */
export function isAutoProvisionEnabled(): boolean {
  return !!(
    process.env.DATABRICKS_CLIENT_ID &&
    process.env.DATABRICKS_CLIENT_SECRET &&
    process.env.DATABRICKS_HOST &&
    !process.env.DATABASE_URL
  );
}

/**
 * True when Databricks App SP credentials are available, regardless of
 * whether DATABASE_URL is set. Used by withPrisma to decide whether
 * auth-error retry can fall back to auto-provisioned credentials even
 * when a static URL was initially configured (e.g. platform resource
 * binding or leaked startup env).
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
    logger.info("[provision] Lakebase project exists", { projectId: getProjectId() });
    return;
  }
  await createProject();
}

/**
 * Build a complete Postgres connection URL with a fresh OAuth credential.
 * Safe to call repeatedly -- returns cached values until the token nears
 * expiry, then transparently mints a new one.
 */
export async function getLakebaseConnectionUrl(): Promise<string> {
  const [{ poolerHost }, username, token] = await Promise.all([
    resolveEndpoint(),
    resolveUsername(),
    generateDbCredential(),
  ]);

  logger.info("[provision] Building runtime connection URL", {
    endpointKind: "pooler",
    host: poolerHost,
  });

  return (
    `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(token)}` +
    `@${poolerHost}/${DATABASE_NAME}?sslmode=require&uselibpqcompat=true`
  );
}

export async function getLakebaseConnectionUrls(): Promise<{
  poolerUrl: string;
  directUrl: string;
  tokenGeneration: number;
  tokenExpiresAt: number | null;
}> {
  const [{ poolerHost, directHost }, username, token] = await Promise.all([
    resolveEndpoint(),
    resolveUsername(),
    generateDbCredential(),
  ]);

  const encodedUser = encodeURIComponent(username);
  const encodedToken = encodeURIComponent(token);
  const suffix = `/${DATABASE_NAME}?sslmode=require&uselibpqcompat=true`;

  return {
    poolerUrl: `postgresql://${encodedUser}:${encodedToken}@${poolerHost}${suffix}`,
    directUrl: `postgresql://${encodedUser}:${encodedToken}@${directHost}${suffix}`,
    tokenGeneration: getCredentialGeneration(),
    tokenExpiresAt: getCredentialExpiresAt(),
  };
}

export async function getRuntimeEndpointInfo(): Promise<{
  endpointName: string;
  directHost: string;
  poolerHost: string;
}> {
  const { name, directHost, poolerHost } = await resolveEndpoint();
  return { endpointName: name, directHost, poolerHost };
}

/**
 * Get a fresh DB credential token (for pool rotation).
 * Returns the cached token if still valid.
 */
export async function refreshDbCredential(): Promise<string> {
  return generateDbCredential();
}

/**
 * Force-invalidate the cached DB credential so the next
 * `refreshDbCredential()` / `getLakebaseConnectionUrl()` call mints
 * a new one. Use this when an authentication error is caught to
 * guarantee the stale credential is discarded.
 */
export function invalidateDbCredential(): void {
  globalForProvision.__dbCredential = null;
}

/**
 * Monotonically increasing counter that bumps every time a genuinely new
 * DB credential is minted. Used by lib/prisma.ts to detect token rotation
 * and recreate the connection pool.
 */
export function getCredentialGeneration(): number {
  return globalForProvision.__credentialGeneration ?? 0;
}

/**
 * Returns the epoch-ms expiry time of the current DB credential,
 * or null if no credential has been minted yet. Used by lib/prisma.ts
 * to schedule proactive pool rotation before the credential expires.
 */
export function getCredentialExpiresAt(): number | null {
  return globalForProvision.__dbCredential?.expiresAt ?? null;
}

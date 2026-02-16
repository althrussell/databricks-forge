/**
 * Databricks client configuration.
 *
 * Supports three authentication modes (checked in priority order):
 *   1. **User authorization (on-behalf-of-user)**: When deployed as a
 *      Databricks App with user-auth scopes, the platform injects the
 *      user's access token in the `x-forwarded-access-token` header.
 *      This lets UC permissions follow the logged-in user.
 *   2. **Local development**: Uses a PAT via DATABRICKS_TOKEN in .env.local.
 *   3. **App authorization (service principal)**: Falls back to OAuth M2M via
 *      DATABRICKS_CLIENT_ID / DATABRICKS_CLIENT_SECRET injected at runtime.
 *
 * The SQL Warehouse ID is read from DATABRICKS_WAREHOUSE_ID, which is mapped
 * from the app's sql-warehouse resource binding via app.yaml.
 */

import { headers as nextHeaders } from "next/headers";

export interface DatabricksConfig {
  host: string; // always includes https://
  warehouseId: string;
}

// ---------------------------------------------------------------------------
// OAuth token cache
// ---------------------------------------------------------------------------

interface OAuthToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let _oauthToken: OAuthToken | null = null;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

let _config: DatabricksConfig | null = null;

function normaliseHost(raw: string): string {
  let h = raw.replace(/\/+$/, "");
  if (!h.startsWith("https://") && !h.startsWith("http://")) {
    h = `https://${h}`;
  }
  return h;
}

/**
 * Returns the Databricks configuration, reading from env vars on first call.
 * Throws if required variables are missing.
 */
export function getConfig(): DatabricksConfig {
  if (_config) return _config;

  const host = process.env.DATABRICKS_HOST;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;

  if (!host) {
    throw new Error(
      "DATABRICKS_HOST is not set. Set it in .env.local or deploy as a Databricks App."
    );
  }
  if (!warehouseId) {
    throw new Error(
      "DATABRICKS_WAREHOUSE_ID is not set. " +
        "Ensure app.yaml maps the sql-warehouse resource to this env var, " +
        "or set it in .env.local for local development."
    );
  }

  _config = {
    host: normaliseHost(host),
    warehouseId,
  };

  return _config;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/**
 * Try to read the user's access token from the Databricks Apps proxy header.
 *
 * When user authorization is enabled, the proxy injects the logged-in user's
 * OAuth token in `x-forwarded-access-token`.  This only works inside a
 * Next.js request context (API routes / server components); outside of that
 * (e.g. pipeline background work) it returns null.
 */
async function getUserToken(): Promise<string | null> {
  try {
    const hdrs = await nextHeaders();
    const token = hdrs.get("x-forwarded-access-token");
    return token || null;
  } catch {
    // headers() throws when called outside a request context
    return null;
  }
}

/**
 * Obtain a Bearer token.
 *
 * Priority order:
 *   1. User authorization – `x-forwarded-access-token` header from the
 *      Databricks Apps proxy (runs queries as the logged-in user).
 *   2. PAT – `DATABRICKS_TOKEN` env var (local development).
 *   3. OAuth M2M – `DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET`
 *      (service principal, for background tasks or when user auth is off).
 */
async function getBearerToken(): Promise<string> {
  // 1. User authorization (on-behalf-of-user, Databricks Apps)
  const userToken = await getUserToken();
  if (userToken) return userToken;

  // 2. PAT token (local dev)
  const pat =
    process.env.DATABRICKS_TOKEN ?? process.env.DATABRICKS_API_TOKEN;
  if (pat) return pat;

  // 3. OAuth M2M (Databricks Apps — service principal fallback)
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "No authentication credentials found. " +
        "Set DATABRICKS_TOKEN for local dev, or deploy as a Databricks App " +
        "(which injects DATABRICKS_CLIENT_ID / DATABRICKS_CLIENT_SECRET)."
    );
  }

  // Return cached token if still valid (with 60 s buffer)
  if (_oauthToken && Date.now() < _oauthToken.expiresAt - 60_000) {
    return _oauthToken.accessToken;
  }

  const { host } = getConfig();
  const tokenUrl = `${host}/oidc/v1/token`;

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `OAuth token exchange failed (${resp.status}): ${text}`
    );
  }

  const data: { access_token: string; expires_in: number } = await resp.json();

  _oauthToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1_000,
  };

  return _oauthToken.accessToken;
}

/**
 * Get the current user's email from the Databricks Apps proxy headers.
 * Returns null when outside a request context or when user auth is off.
 */
export async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const hdrs = await nextHeaders();
    return (
      hdrs.get("x-forwarded-email") ??
      hdrs.get("x-forwarded-preferred-username") ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * Returns headers using user authorization when available.
 *
 * Use for APIs where user-scoped OAuth scopes exist (e.g. `sql`,
 * `catalog.*`). Falls back to SP / PAT when outside a request context.
 */
export async function getHeaders(): Promise<Record<string, string>> {
  const token = await getBearerToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Returns headers using app authorization (service principal) only.
 *
 * Use for APIs whose scopes are NOT available in user authorization
 * (e.g. Workspace REST API — requires `workspace` scope which is not
 * exposed in the Databricks Apps user-auth scope picker).
 */
export async function getAppHeaders(): Promise<Record<string, string>> {
  const token = await getAppBearerToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Obtain a Bearer token using only app-level credentials (PAT or SP).
 * Deliberately skips the user's forwarded token.
 */
async function getAppBearerToken(): Promise<string> {
  // 1. PAT token (local dev)
  const pat =
    process.env.DATABRICKS_TOKEN ?? process.env.DATABRICKS_API_TOKEN;
  if (pat) return pat;

  // 2. OAuth M2M (Databricks Apps — service principal)
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "No app-level credentials found. " +
        "Set DATABRICKS_TOKEN for local dev, or deploy as a Databricks App " +
        "(which injects DATABRICKS_CLIENT_ID / DATABRICKS_CLIENT_SECRET)."
    );
  }

  // Reuse cached SP token if still valid
  if (_oauthToken && Date.now() < _oauthToken.expiresAt - 60_000) {
    return _oauthToken.accessToken;
  }

  const { host } = getConfig();
  const tokenUrl = `${host}/oidc/v1/token`;

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(
      `OAuth token exchange failed (${resp.status}): ${text}`
    );
  }

  const data: { access_token: string; expires_in: number } = await resp.json();

  _oauthToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1_000,
  };

  return _oauthToken.accessToken;
}

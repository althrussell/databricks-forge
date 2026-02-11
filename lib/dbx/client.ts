/**
 * Databricks client configuration.
 *
 * Supports two authentication modes:
 *   1. **Databricks Apps (production)**: Uses OAuth M2M via DATABRICKS_CLIENT_ID
 *      and DATABRICKS_CLIENT_SECRET injected at runtime. Tokens are automatically
 *      refreshed before expiry.
 *   2. **Local development**: Uses a PAT via DATABRICKS_TOKEN in .env.local.
 *
 * The SQL Warehouse ID is read from DATABRICKS_WAREHOUSE_ID, which is mapped
 * from the app's sql-warehouse resource binding via app.yaml.
 */

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
 * Obtain a Bearer token.
 *
 * - In Databricks Apps: exchanges CLIENT_ID / CLIENT_SECRET for a short-lived
 *   OAuth token via the workspace's OIDC endpoint.
 * - Locally: returns the PAT from DATABRICKS_TOKEN.
 */
async function getBearerToken(): Promise<string> {
  // 1. PAT token (local dev)
  const pat =
    process.env.DATABRICKS_TOKEN ?? process.env.DATABRICKS_API_TOKEN;
  if (pat) return pat;

  // 2. OAuth M2M (Databricks Apps)
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
 * Returns standard headers for Databricks REST API calls.
 * Handles both PAT and OAuth M2M authentication.
 */
export async function getHeaders(): Promise<Record<string, string>> {
  const token = await getBearerToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

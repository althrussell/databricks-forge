/**
 * Prisma client singleton for Lakebase Autoscaling (Postgres).
 *
 * Uses @prisma/adapter-pg with node-postgres (pg) Pool.
 *
 * Supports two auth modes:
 *   1. Static DATABASE_URL (with password baked in) -- local dev / native Postgres password
 *   2. OAuth token rotation -- Databricks Apps (uses CLIENT_ID/SECRET to mint
 *      short-lived tokens via the workspace OIDC endpoint, then injects them
 *      into the connection URL before creating the pool)
 *
 * The standard Next.js pattern caches the client on `globalThis` to survive HMR.
 */

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

// ---------------------------------------------------------------------------
// OAuth token management for Lakebase
// ---------------------------------------------------------------------------

interface OAuthToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let _dbOAuthToken: OAuthToken | null = null;

/**
 * Build a connection string with an OAuth token injected as the password.
 * Base URL: postgresql://user@host/db?sslmode=require
 * Result:   postgresql://user:TOKEN@host/db?sslmode=require
 */
function injectTokenIntoUrl(baseUrl: string, token: string): string {
  const encoded = encodeURIComponent(token);
  return baseUrl.replace(/^(postgresql:\/\/[^@:]+)(@)/, `$1:${encoded}$2`);
}

/**
 * Get a fresh Databricks workspace OAuth token.
 * Returns "" if no OAuth credentials are available (assumes static password).
 */
async function getDbOAuthToken(): Promise<string> {
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;

  if (!clientId || !clientSecret) return "";

  // Return cached token if still valid (60s buffer)
  if (_dbOAuthToken && Date.now() < _dbOAuthToken.expiresAt - 60_000) {
    return _dbOAuthToken.accessToken;
  }

  let host = process.env.DATABRICKS_HOST ?? "";
  if (host && !host.startsWith("https://")) host = `https://${host}`;

  const resp = await fetch(`${host}/oidc/v1/token`, {
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
    throw new Error(`Lakebase OAuth token exchange failed (${resp.status}): ${text}`);
  }

  const data: { access_token: string; expires_in: number } = await resp.json();
  _dbOAuthToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1_000,
  };

  return _dbOAuthToken.accessToken;
}

// ---------------------------------------------------------------------------
// Prisma client singleton
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __prismaTokenId: string | undefined;
};

/**
 * Returns a PrismaClient connected to Lakebase.
 *
 * In Databricks Apps (OAuth), the pool and client are recreated when the
 * token rotates. In local dev (static DATABASE_URL), the client persists
 * across HMR.
 */
export async function getPrisma(): Promise<PrismaClient> {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL is not set.");
  }

  const token = await getDbOAuthToken();
  const connectionString = token ? injectTokenIntoUrl(baseUrl, token) : baseUrl;
  const tokenId = token || "__static__";

  // Reuse client if the token hasn't changed
  if (globalForPrisma.__prisma && globalForPrisma.__prismaTokenId === tokenId) {
    return globalForPrisma.__prisma;
  }

  // Disconnect old client if token rotated
  if (globalForPrisma.__prisma) {
    await globalForPrisma.__prisma.$disconnect();
  }

  // Create pg Pool → PrismaPg adapter → PrismaClient
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = tokenId;

  return prisma;
}

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
  getLakebaseConnectionUrl,
  getCredentialGeneration,
} from "@/lib/lakebase/provision";

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

const globalForPrisma = globalThis as unknown as {
  __prisma: PrismaClient | undefined;
  __prismaTokenId: string | undefined;
};

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

// ---------------------------------------------------------------------------
// Auto-provisioned mode (Databricks Apps)
// ---------------------------------------------------------------------------

async function getAutoProvisionedPrisma(): Promise<PrismaClient> {
  const generation = getCredentialGeneration();
  const tokenId = `autoscale_${generation}`;

  if (globalForPrisma.__prisma && globalForPrisma.__prismaTokenId === tokenId) {
    return globalForPrisma.__prisma;
  }

  // Credential has rotated (or first call) -- rebuild the pool
  if (globalForPrisma.__prisma) {
    await globalForPrisma.__prisma.$disconnect();
  }

  const connectionString = await getLakebaseConnectionUrl();
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = tokenId;

  return prisma;
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
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  globalForPrisma.__prisma = prisma;
  globalForPrisma.__prismaTokenId = "__static__";

  return prisma;
}

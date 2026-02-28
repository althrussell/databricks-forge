/**
 * CRUD operations for Genie Space tracking -- backed by Lakebase (Prisma).
 *
 * Records which Genie spaces were created/updated/trashed from which
 * pipeline runs and domains, so the UI can display status badges.
 * Also tracks deployed asset FQNs for cleanup on deletion.
 */

import { withPrisma } from "@/lib/prisma";
import type { TrackedGenieSpace, GenieSpaceStatus } from "@/lib/genie/types";
import type { GenieAuthMode } from "@/lib/settings";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeployedAssets {
  functions: string[];
  metricViews: string[];
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function dbRowToTracked(row: {
  id: string;
  spaceId: string;
  runId: string | null;
  domain: string;
  title: string;
  status: string;
  deployedAssetsJson: string | null;
  authMode: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TrackedGenieSpace {
  return {
    id: row.id,
    spaceId: row.spaceId,
    runId: row.runId,
    domain: row.domain,
    title: row.title,
    status: row.status as GenieSpaceStatus,
    deployedAssets: parseDeployedAssets(row.deployedAssetsJson),
    authMode: (row.authMode as GenieAuthMode) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function parseDeployedAssets(json: string | null): DeployedAssets | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as DeployedAssets;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/** List all tracked Genie spaces (optionally filtered by runId). */
export async function listTrackedGenieSpaces(
  runId?: string
): Promise<TrackedGenieSpace[]> {
  return withPrisma(async (prisma) => {
    const where = runId ? { runId } : {};
    const rows = await prisma.forgeGenieSpace.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(dbRowToTracked);
  });
}

/** Get a tracked space by its Databricks space ID. */
export async function getTrackedBySpaceId(
  spaceId: string
): Promise<TrackedGenieSpace | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeGenieSpace.findUnique({
      where: { spaceId },
    });
    return row ? dbRowToTracked(row) : null;
  });
}

/** Get a tracked space by run + domain. */
export async function getTrackedByRunDomain(
  runId: string,
  domain: string
): Promise<TrackedGenieSpace | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeGenieSpace.findFirst({
      where: { runId, domain },
    });
    return row ? dbRowToTracked(row) : null;
  });
}

/**
 * Record a newly created Genie space, optionally with deployed asset FQNs.
 * When runId is provided, attempts to find an existing record for that
 * run+domain and update it; otherwise creates a new record.
 * When runId is null (ad-hoc spaces), always creates a new record.
 */
export async function trackGenieSpaceCreated(
  id: string,
  spaceId: string,
  runId: string | null,
  domain: string,
  title: string,
  deployedAssets?: DeployedAssets,
  authMode?: GenieAuthMode,
): Promise<TrackedGenieSpace> {
  const assetsJson = deployedAssets ? JSON.stringify(deployedAssets) : null;
  return withPrisma(async (prisma) => {
    if (runId) {
      const existing = await prisma.forgeGenieSpace.findFirst({
        where: { runId, domain },
      });
      if (existing) {
        const row = await prisma.forgeGenieSpace.update({
          where: { id: existing.id },
          data: { spaceId, title, status: "created", deployedAssetsJson: assetsJson, authMode: authMode ?? null },
        });
        return dbRowToTracked(row);
      }
    }
    const row = await prisma.forgeGenieSpace.create({
      data: { id, spaceId, runId, domain, title, status: "created", deployedAssetsJson: assetsJson, authMode: authMode ?? null },
    });
    return dbRowToTracked(row);
  });
}

/** Mark a tracked space as updated, merging any newly deployed assets. */
export async function trackGenieSpaceUpdated(
  spaceId: string,
  title?: string,
  deployedAssets?: DeployedAssets,
): Promise<void> {
  await withPrisma(async (prisma) => {
    if (deployedAssets) {
      const existing = await prisma.forgeGenieSpace.findUnique({
        where: { spaceId },
      });
      const merged = mergeAssets(
        parseDeployedAssets(existing?.deployedAssetsJson ?? null),
        deployedAssets,
      );
      const data: Record<string, unknown> = {
        status: "updated",
        deployedAssetsJson: JSON.stringify(merged),
      };
      if (title) data.title = title;
      await prisma.forgeGenieSpace.update({
        where: { spaceId },
        data,
      });
    } else {
      const data: Record<string, unknown> = { status: "updated" };
      if (title) data.title = title;
      await prisma.forgeGenieSpace.update({
        where: { spaceId },
        data,
      });
    }
  });
}

/** Mark a tracked space as trashed. */
export async function trackGenieSpaceTrashed(
  spaceId: string
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeGenieSpace.update({
      where: { spaceId },
      data: { status: "trashed" },
    });
  });
}

/** Get the auth mode used to create a space (falls back to "sp" for legacy rows). */
export async function getSpaceAuthMode(
  spaceId: string,
): Promise<GenieAuthMode> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeGenieSpace.findUnique({
      where: { spaceId },
      select: { authMode: true },
    });
    return (row?.authMode as GenieAuthMode) ?? "sp";
  });
}

// ---------------------------------------------------------------------------
// Asset tracking helpers
// ---------------------------------------------------------------------------

/** Get the deployed asset FQNs for a tracked space. */
export async function getDeployedAssets(
  spaceId: string,
): Promise<DeployedAssets | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeGenieSpace.findUnique({
      where: { spaceId },
    });
    if (!row) return null;
    return parseDeployedAssets(row.deployedAssetsJson);
  });
}

/**
 * Find all non-trashed spaces that reference any of the given asset FQNs,
 * excluding a specific space (the one being trashed).
 *
 * Returns a map of `assetFqn -> space titles[]` for assets that are shared.
 */
export async function findSpacesReferencingAssets(
  assetFqns: string[],
  excludeSpaceId: string,
): Promise<Map<string, string[]>> {
  if (assetFqns.length === 0) return new Map();

  return withPrisma(async (prisma) => {
    const otherSpaces = await prisma.forgeGenieSpace.findMany({
      where: {
        status: { not: "trashed" },
        spaceId: { not: excludeSpaceId },
        deployedAssetsJson: { not: null },
      },
    });

    const result = new Map<string, string[]>();
    const lowerFqns = new Set(assetFqns.map((f) => f.toLowerCase()));

    for (const space of otherSpaces) {
      const assets = parseDeployedAssets(space.deployedAssetsJson);
      if (!assets) continue;
      const allFqns = [...assets.functions, ...assets.metricViews];
      for (const fqn of allFqns) {
        if (lowerFqns.has(fqn.toLowerCase())) {
          const existing = result.get(fqn) ?? [];
          existing.push(space.title);
          result.set(fqn, existing);
        }
      }
    }

    return result;
  });
}

function mergeAssets(
  existing: DeployedAssets | null,
  incoming: DeployedAssets,
): DeployedAssets {
  if (!existing) return incoming;
  const fns = new Set([...existing.functions, ...incoming.functions]);
  const mvs = new Set([...existing.metricViews, ...incoming.metricViews]);
  return { functions: [...fns], metricViews: [...mvs] };
}

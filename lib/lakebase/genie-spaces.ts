/**
 * CRUD operations for Genie Space tracking -- backed by Lakebase (Prisma).
 *
 * Records which Genie spaces were created/updated/trashed from which
 * pipeline runs and domains, so the UI can display status badges.
 */

import { withPrisma } from "@/lib/prisma";
import type { TrackedGenieSpace, GenieSpaceStatus } from "@/lib/genie/types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function dbRowToTracked(row: {
  id: string;
  spaceId: string;
  runId: string;
  domain: string;
  title: string;
  status: string;
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
    const row = await prisma.forgeGenieSpace.findFirst({
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
    const row = await prisma.forgeGenieSpace.findUnique({
      where: { runId_domain: { runId, domain } },
    });
    return row ? dbRowToTracked(row) : null;
  });
}

/** Record a newly created Genie space. */
export async function trackGenieSpaceCreated(
  id: string,
  spaceId: string,
  runId: string,
  domain: string,
  title: string
): Promise<TrackedGenieSpace> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeGenieSpace.upsert({
      where: { runId_domain: { runId, domain } },
      create: { id, spaceId, runId, domain, title, status: "created" },
      update: { spaceId, title, status: "created" },
    });
    return dbRowToTracked(row);
  });
}

/** Mark a tracked space as updated. */
export async function trackGenieSpaceUpdated(
  spaceId: string,
  title?: string
): Promise<void> {
  await withPrisma(async (prisma) => {
    const data: Record<string, unknown> = { status: "updated" };
    if (title) data.title = title;
    await prisma.forgeGenieSpace.updateMany({
      where: { spaceId },
      data,
    });
  });
}

/** Mark a tracked space as trashed. */
export async function trackGenieSpaceTrashed(
  spaceId: string
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeGenieSpace.updateMany({
      where: { spaceId },
      data: { status: "trashed" },
    });
  });
}

/**
 * CRUD operations for Genie Space tracking -- backed by Lakebase (Prisma).
 *
 * Records which Genie spaces were created/updated/trashed from which
 * pipeline runs and domains, so the UI can display status badges.
 */

import { getPrisma } from "@/lib/prisma";
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
  const prisma = await getPrisma();
  const where = runId ? { runId } : {};
  const rows = await prisma.inspireGenieSpace.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(dbRowToTracked);
}

/** Get a tracked space by its Databricks space ID. */
export async function getTrackedBySpaceId(
  spaceId: string
): Promise<TrackedGenieSpace | null> {
  const prisma = await getPrisma();
  const row = await prisma.inspireGenieSpace.findFirst({
    where: { spaceId },
  });
  return row ? dbRowToTracked(row) : null;
}

/** Get a tracked space by run + domain. */
export async function getTrackedByRunDomain(
  runId: string,
  domain: string
): Promise<TrackedGenieSpace | null> {
  const prisma = await getPrisma();
  const row = await prisma.inspireGenieSpace.findUnique({
    where: { runId_domain: { runId, domain } },
  });
  return row ? dbRowToTracked(row) : null;
}

/** Record a newly created Genie space. */
export async function trackGenieSpaceCreated(
  id: string,
  spaceId: string,
  runId: string,
  domain: string,
  title: string
): Promise<TrackedGenieSpace> {
  const prisma = await getPrisma();
  const row = await prisma.inspireGenieSpace.upsert({
    where: { runId_domain: { runId, domain } },
    create: { id, spaceId, runId, domain, title, status: "created" },
    update: { spaceId, title, status: "created" },
  });
  return dbRowToTracked(row);
}

/** Mark a tracked space as updated. */
export async function trackGenieSpaceUpdated(
  spaceId: string,
  title?: string
): Promise<void> {
  const prisma = await getPrisma();
  const data: Record<string, unknown> = { status: "updated" };
  if (title) data.title = title;
  await prisma.inspireGenieSpace.updateMany({
    where: { spaceId },
    data,
  });
}

/** Mark a tracked space as trashed. */
export async function trackGenieSpaceTrashed(
  spaceId: string
): Promise<void> {
  const prisma = await getPrisma();
  await prisma.inspireGenieSpace.updateMany({
    where: { spaceId },
    data: { status: "trashed" },
  });
}

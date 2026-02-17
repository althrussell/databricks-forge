/**
 * Metadata cache persistence -- backed by Lakebase (Prisma).
 *
 * Stores and retrieves MetadataSnapshot objects so they can be reused
 * by features like Genie Space recommendations without re-running the
 * metadata extraction queries.
 */

import { getPrisma } from "@/lib/prisma";
import type { MetadataSnapshot } from "@/lib/domain/types";

/**
 * Save a metadata snapshot to the cache table.
 */
export async function saveMetadataSnapshot(
  snapshot: MetadataSnapshot
): Promise<void> {
  const prisma = await getPrisma();
  await prisma.forgeMetadataCache.upsert({
    where: { cacheKey: snapshot.cacheKey },
    create: {
      cacheKey: snapshot.cacheKey,
      ucPath: snapshot.ucPath,
      metadataJson: JSON.stringify(snapshot),
      tableCount: snapshot.tableCount,
      columnCount: snapshot.columnCount,
    },
    update: {
      metadataJson: JSON.stringify(snapshot),
      tableCount: snapshot.tableCount,
      columnCount: snapshot.columnCount,
    },
  });
}

/**
 * Load a metadata snapshot from the cache by key.
 * Returns null if not found or if the stored JSON is invalid.
 */
export async function loadMetadataSnapshot(
  cacheKey: string
): Promise<MetadataSnapshot | null> {
  const prisma = await getPrisma();
  const row = await prisma.forgeMetadataCache.findUnique({
    where: { cacheKey },
  });

  if (!row?.metadataJson) return null;

  try {
    const snapshot = JSON.parse(row.metadataJson) as MetadataSnapshot;
    // Ensure backward compatibility for snapshots that predate metricViews
    if (!snapshot.metricViews) {
      snapshot.metricViews = [];
    }
    return snapshot;
  } catch {
    return null;
  }
}

/**
 * Load metadata for a run by looking up its metadataCacheKey.
 */
export async function loadMetadataForRun(
  runId: string
): Promise<MetadataSnapshot | null> {
  const prisma = await getPrisma();
  const run = await prisma.forgeRun.findUnique({
    where: { runId },
    select: { metadataCacheKey: true },
  });

  if (!run?.metadataCacheKey) return null;
  return loadMetadataSnapshot(run.metadataCacheKey);
}

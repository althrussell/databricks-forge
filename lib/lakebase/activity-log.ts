/**
 * CRUD operations for the activity audit log — backed by Lakebase (Prisma).
 *
 * Records user actions (run creation, deletion, exports, etc.) for
 * dashboard activity feeds and audit trails.
 */

import { randomUUID } from "crypto";
import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActivityAction =
  | "created_run"
  | "started_pipeline"
  | "completed"
  | "failed"
  | "deleted_run"
  | "exported"
  | "updated_run_industry";

export interface ActivityLogEntry {
  activityId: string;
  userId: string | null;
  action: ActivityAction;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Insert (fire-and-forget safe)
// ---------------------------------------------------------------------------

/**
 * Log an activity event. Designed to be called fire-and-forget so logging
 * failures never block the main operation.
 */
export async function logActivity(
  action: ActivityAction,
  opts: {
    userId?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await withPrisma(async (prisma) => {
      await prisma.forgeActivityLog.create({
        data: {
          activityId: randomUUID(),
          userId: opts.userId ?? null,
          action,
          resourceId: opts.resourceId ?? null,
          metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
        },
      });
    });
  } catch (error) {
    logger.warn("Failed to log activity", {
      action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * Get the most recent activity entries for the dashboard feed.
 */
export async function getRecentActivity(
  limit = 20
): Promise<ActivityLogEntry[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeActivityLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(dbRowToActivity);
  });
}

/**
 * Get activity entries for a specific resource (run).
 */
export async function getActivityForResource(
  resourceId: string
): Promise<ActivityLogEntry[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeActivityLog.findMany({
      where: { resourceId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(dbRowToActivity);
  });
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function dbRowToActivity(row: {
  activityId: string;
  userId: string | null;
  action: string;
  resourceId: string | null;
  metadata: string | null;
  createdAt: Date;
}): ActivityLogEntry {
  let metadata: Record<string, unknown> | null = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      /* ignore */
    }
  }
  return {
    activityId: row.activityId,
    userId: row.userId,
    action: row.action as ActivityAction,
    resourceId: row.resourceId,
    metadata,
    createdAt: row.createdAt.toISOString(),
  };
}

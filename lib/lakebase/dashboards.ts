/**
 * CRUD operations for Dashboard tracking -- backed by Lakebase (Prisma).
 *
 * Records which dashboards were created/updated/trashed from which
 * pipeline runs and domains, so the UI can display status badges.
 */

import { withPrisma } from "@/lib/prisma";
import type { TrackedDashboard, DashboardStatus } from "@/lib/dashboard/types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function dbRowToTracked(row: {
  id: string;
  dashboardId: string;
  runId: string;
  domain: string;
  title: string;
  status: string;
  dashboardUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): TrackedDashboard {
  return {
    id: row.id,
    dashboardId: row.dashboardId,
    runId: row.runId,
    domain: row.domain,
    title: row.title,
    status: row.status as DashboardStatus,
    dashboardUrl: row.dashboardUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function listTrackedDashboards(
  runId?: string
): Promise<TrackedDashboard[]> {
  return withPrisma(async (prisma) => {
    const where = runId ? { runId } : {};
    const rows = await prisma.forgeDashboard.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return rows.map(dbRowToTracked);
  });
}

export async function getTrackedDashboardByRunDomain(
  runId: string,
  domain: string
): Promise<TrackedDashboard | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDashboard.findUnique({
      where: { runId_domain: { runId, domain } },
    });
    return row ? dbRowToTracked(row) : null;
  });
}

export async function trackDashboardCreated(
  id: string,
  dashboardId: string,
  runId: string,
  domain: string,
  title: string,
  dashboardUrl: string | null
): Promise<TrackedDashboard> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDashboard.upsert({
      where: { runId_domain: { runId, domain } },
      create: { id, dashboardId, runId, domain, title, status: "created", dashboardUrl },
      update: { dashboardId, title, status: "created", dashboardUrl },
    });
    return dbRowToTracked(row);
  });
}

export async function trackDashboardUpdated(
  dashboardId: string,
  title?: string
): Promise<void> {
  await withPrisma(async (prisma) => {
    const data: Record<string, unknown> = { status: "updated" };
    if (title) data.title = title;
    await prisma.forgeDashboard.updateMany({
      where: { dashboardId },
      data,
    });
  });
}

export async function trackDashboardTrashed(
  dashboardId: string
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeDashboard.updateMany({
      where: { dashboardId },
      data: { status: "trashed" },
    });
  });
}

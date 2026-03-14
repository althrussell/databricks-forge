/**
 * CRUD operations for demo sessions -- backed by Lakebase (Prisma).
 */

import { randomUUID } from "crypto";
import { withPrisma } from "@/lib/prisma";
import type {
  DemoSessionStatus,
  DemoSessionSummary,
  ResearchPreset,
  DemoScope,
} from "@/lib/demo/types";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CreateDemoSessionOpts {
  customerName: string;
  industryId: string;
  researchPreset: ResearchPreset;
  websiteUrl?: string;
  catalogName: string;
  schemaName: string;
  catalogCreated?: boolean;
  scope?: DemoScope;
  createdBy?: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createDemoSession(opts: CreateDemoSessionOpts): Promise<string> {
  const id = randomUUID();
  await withPrisma(async (prisma) => {
    await prisma.forgeDemoSession.create({
      data: {
        id,
        customerName: opts.customerName,
        industryId: opts.industryId,
        researchPreset: opts.researchPreset,
        websiteUrl: opts.websiteUrl ?? null,
        catalogName: opts.catalogName,
        schemaName: opts.schemaName,
        catalogCreated: opts.catalogCreated ?? false,
        scopeJson: opts.scope ? JSON.stringify(opts.scope) : null,
        createdBy: opts.createdBy ?? null,
      },
    });
  });
  return id;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getDemoSession(sessionId: string): Promise<DemoSessionSummary | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDemoSession.findUnique({ where: { id: sessionId } });
    if (!row) return null;
    return rowToSummary(row);
  });
}

export async function listDemoSessions(): Promise<DemoSessionSummary[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeDemoSession.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows.map(rowToSummary);
  });
}

export async function getDemoSessionResearch(
  sessionId: string,
): Promise<ResearchEngineResult | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDemoSession.findUnique({
      where: { id: sessionId },
      select: { researchJson: true },
    });
    if (!row?.researchJson) return null;
    try {
      return JSON.parse(row.researchJson) as ResearchEngineResult;
    } catch {
      return null;
    }
  });
}

export async function getDemoSessionTables(sessionId: string): Promise<string[]> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeDemoSession.findUnique({
      where: { id: sessionId },
      select: { tablesJson: true },
    });
    if (!row?.tablesJson) return [];
    try {
      return JSON.parse(row.tablesJson) as string[];
    } catch {
      return [];
    }
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateDemoSessionStatus(
  sessionId: string,
  status: DemoSessionStatus,
  extra?: {
    researchJson?: string;
    dataModelJson?: string;
    tablesJson?: string;
    sourceDocsJson?: string;
    catalogName?: string;
    schemaName?: string;
    tablesCreated?: number;
    totalRows?: number;
    durationMs?: number;
    errorMessage?: string;
    completedAt?: Date;
  },
): Promise<void> {
  await withPrisma(async (prisma) => {
    const data: Record<string, unknown> = { status };
    if (extra?.researchJson !== undefined) data.researchJson = extra.researchJson;
    if (extra?.dataModelJson !== undefined) data.dataModelJson = extra.dataModelJson;
    if (extra?.tablesJson !== undefined) data.tablesJson = extra.tablesJson;
    if (extra?.sourceDocsJson !== undefined) data.sourceDocsJson = extra.sourceDocsJson;
    if (extra?.catalogName !== undefined) data.catalogName = extra.catalogName;
    if (extra?.schemaName !== undefined) data.schemaName = extra.schemaName;
    if (extra?.tablesCreated !== undefined) data.tablesCreated = extra.tablesCreated;
    if (extra?.totalRows !== undefined) data.totalRows = extra.totalRows;
    if (extra?.durationMs !== undefined) data.durationMs = extra.durationMs;
    if (extra?.errorMessage !== undefined) data.errorMessage = extra.errorMessage;
    if (extra?.completedAt !== undefined) data.completedAt = extra.completedAt;

    await prisma.forgeDemoSession.update({ where: { id: sessionId }, data });
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteDemoSession(sessionId: string): Promise<boolean> {
  return withPrisma(async (prisma) => {
    try {
      await prisma.forgeDemoSession.delete({ where: { id: sessionId } });
      return true;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function rowToSummary(row: {
  id: string;
  customerName: string;
  industryId: string;
  researchPreset: string;
  catalogName: string;
  schemaName: string;
  status: string;
  tablesCreated: number;
  totalRows: number;
  durationMs: number;
  createdAt: Date;
  completedAt: Date | null;
}): DemoSessionSummary {
  return {
    sessionId: row.id,
    customerName: row.customerName,
    industryId: row.industryId,
    researchPreset: row.researchPreset as ResearchPreset,
    catalogName: row.catalogName,
    schemaName: row.schemaName,
    status: row.status as DemoSessionStatus,
    tablesCreated: row.tablesCreated,
    totalRows: row.totalRows,
    durationMs: row.durationMs,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/**
 * CRUD operations for custom outcome maps — backed by Lakebase (Prisma).
 *
 * Custom outcome maps are user-uploaded markdown documents that have been
 * parsed into the IndustryOutcome structure by the AI parser.
 */

import { randomUUID } from "crypto";
import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import type { IndustryOutcome } from "@/lib/domain/industry-outcomes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutcomeMapRecord {
  id: string;
  industryId: string;
  name: string;
  rawMarkdown: string;
  parsedOutcome: IndustryOutcome;
  useCaseCount: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OutcomeMapSummary {
  id: string;
  industryId: string;
  name: string;
  useCaseCount: number;
  createdBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createOutcomeMap(opts: {
  industryId: string;
  name: string;
  rawMarkdown: string;
  parsedOutcome: IndustryOutcome;
  createdBy?: string | null;
}): Promise<OutcomeMapRecord> {
  return withPrisma(async (prisma) => {
    const id = randomUUID();

    const useCaseCount = opts.parsedOutcome.objectives.reduce(
      (total, obj) =>
        total +
        obj.priorities.reduce((pTotal, p) => pTotal + p.useCases.length, 0),
      0
    );

    const row = await prisma.forgeOutcomeMap.create({
      data: {
        id,
        industryId: opts.industryId,
        name: opts.name,
        rawMarkdown: opts.rawMarkdown,
        parsedJson: JSON.stringify(opts.parsedOutcome),
        useCaseCount,
        createdBy: opts.createdBy ?? null,
      },
    });

    return dbRowToRecord(row);
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getOutcomeMap(
  id: string
): Promise<OutcomeMapRecord | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeOutcomeMap.findUnique({ where: { id } });
    return row ? dbRowToRecord(row) : null;
  });
}

export async function getOutcomeMapByIndustryId(
  industryId: string
): Promise<OutcomeMapRecord | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeOutcomeMap.findUnique({
      where: { industryId },
    });
    return row ? dbRowToRecord(row) : null;
  });
}

export async function listOutcomeMaps(): Promise<OutcomeMapSummary[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeOutcomeMap.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        industryId: true,
        name: true,
        useCaseCount: true,
        createdBy: true,
        createdAt: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      industryId: row.industryId,
      name: row.name,
      useCaseCount: row.useCaseCount,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
    }));
  });
}

/**
 * Load all custom outcome maps as IndustryOutcome objects.
 * Used by the registry to merge with built-in maps.
 */
export async function loadAllCustomOutcomes(): Promise<IndustryOutcome[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeOutcomeMap.findMany({
      select: { parsedJson: true },
    });
    const outcomes: IndustryOutcome[] = [];
    for (const row of rows) {
      try {
        outcomes.push(JSON.parse(row.parsedJson) as IndustryOutcome);
      } catch {
        logger.warn("Skipping corrupt custom outcome map", {
          parsedJson: row.parsedJson.slice(0, 100),
        });
      }
    }
    return outcomes;
  });
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateOutcomeMap(
  id: string,
  opts: {
    name?: string;
    industryId?: string;
    rawMarkdown?: string;
    parsedOutcome?: IndustryOutcome;
  }
): Promise<OutcomeMapRecord | null> {
  return withPrisma(async (prisma) => {
    const data: Record<string, unknown> = {};
    if (opts.name !== undefined) data.name = opts.name;
    if (opts.industryId !== undefined) data.industryId = opts.industryId;
    if (opts.rawMarkdown !== undefined) data.rawMarkdown = opts.rawMarkdown;
    if (opts.parsedOutcome !== undefined) {
      data.parsedJson = JSON.stringify(opts.parsedOutcome);
      data.useCaseCount = opts.parsedOutcome.objectives.reduce(
        (total, obj) =>
          total +
          obj.priorities.reduce((pTotal, p) => pTotal + p.useCases.length, 0),
        0
      );
    }

    try {
      const row = await prisma.forgeOutcomeMap.update({
        where: { id },
        data,
      });
      return dbRowToRecord(row);
    } catch {
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteOutcomeMap(id: string): Promise<boolean> {
  return withPrisma(async (prisma) => {
    try {
      await prisma.forgeOutcomeMap.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  });
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function dbRowToRecord(row: {
  id: string;
  industryId: string;
  name: string;
  rawMarkdown: string;
  parsedJson: string;
  useCaseCount: number;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): OutcomeMapRecord {
  let parsedOutcome: IndustryOutcome;
  try {
    parsedOutcome = JSON.parse(row.parsedJson) as IndustryOutcome;
  } catch {
    parsedOutcome = {
      id: row.industryId,
      name: row.name,
      subVerticals: [],
      suggestedDomains: [],
      suggestedPriorities: [],
      objectives: [],
    };
  }

  return {
    id: row.id,
    industryId: row.industryId,
    name: row.name,
    rawMarkdown: row.rawMarkdown,
    parsedOutcome,
    useCaseCount: row.useCaseCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

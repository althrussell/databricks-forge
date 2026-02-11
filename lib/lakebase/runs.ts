/**
 * CRUD operations for pipeline runs — backed by Lakebase (Prisma).
 */

import { getPrisma } from "@/lib/prisma";
import type {
  PipelineRun,
  PipelineRunConfig,
  PipelineStep,
  RunStatus,
  BusinessContext,
  BusinessPriority,
  GenerationOption,
  SupportedLanguage,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function parseJSON<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function dbRowToRun(row: {
  runId: string;
  businessName: string;
  ucMetadata: string;
  operation: string;
  businessPriorities: string | null;
  strategicGoals: string | null;
  businessDomains: string | null;
  aiModel: string | null;
  languages: string | null;
  generationOptions: string | null;
  generationPath: string | null;
  status: string;
  currentStep: string | null;
  progressPct: number;
  statusMessage: string | null;
  businessContext: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
}): PipelineRun {
  return {
    runId: row.runId,
    config: {
      businessName: row.businessName,
      ucMetadata: row.ucMetadata,
      operation: row.operation as PipelineRunConfig["operation"],
      businessDomains: row.businessDomains ?? "",
      businessPriorities: parseJSON<BusinessPriority[]>(row.businessPriorities, []),
      strategicGoals: row.strategicGoals ?? "",
      generationOptions: parseJSON<GenerationOption[]>(row.generationOptions, ["SQL Code"]),
      generationPath: row.generationPath ?? "./inspire_gen/",
      languages: parseJSON<SupportedLanguage[]>(row.languages, ["English"]),
      aiModel: row.aiModel ?? "databricks-claude-sonnet-4-5",
    },
    status: row.status as RunStatus,
    currentStep: (row.currentStep as PipelineStep) ?? null,
    progressPct: row.progressPct,
    statusMessage: row.statusMessage ?? null,
    businessContext: parseJSON<BusinessContext | null>(row.businessContext, null),
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createRun(
  runId: string,
  config: PipelineRunConfig
): Promise<void> {
  const prisma = await getPrisma();
  await prisma.inspireRun.create({
    data: {
      runId,
      businessName: config.businessName,
      ucMetadata: config.ucMetadata,
      operation: config.operation,
      businessPriorities: JSON.stringify(config.businessPriorities),
      strategicGoals: config.strategicGoals,
      businessDomains: config.businessDomains,
      aiModel: config.aiModel,
      languages: JSON.stringify(config.languages),
      generationOptions: JSON.stringify(config.generationOptions),
      generationPath: config.generationPath,
      status: "pending",
      progressPct: 0,
    },
  });
}

export async function getRunById(runId: string): Promise<PipelineRun | null> {
  const prisma = await getPrisma();
  const row = await prisma.inspireRun.findUnique({ where: { runId } });
  return row ? dbRowToRun(row) : null;
}

export async function listRuns(
  limit = 50,
  offset = 0
): Promise<PipelineRun[]> {
  const prisma = await getPrisma();
  const rows = await prisma.inspireRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    skip: offset,
  });
  return rows.map(dbRowToRun);
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  currentStep: PipelineStep | null,
  progressPct: number,
  errorMessage?: string,
  statusMessage?: string
): Promise<void> {
  const prisma = await getPrisma();

  const data: Record<string, unknown> = {
    status,
    currentStep: currentStep ?? null,
    progressPct,
  };

  if (errorMessage !== undefined) {
    data.errorMessage = errorMessage;
  }

  if (statusMessage !== undefined) {
    data.statusMessage = statusMessage;
  }

  if (status === "completed" || status === "failed") {
    data.completedAt = new Date();
  }

  await prisma.inspireRun.update({ where: { runId }, data });
}

/**
 * Lightweight helper that updates just statusMessage (and optionally progressPct).
 * Called frequently from pipeline steps to report granular progress.
 */
export async function updateRunMessage(
  runId: string,
  statusMessage: string,
  progressPct?: number
): Promise<void> {
  const prisma = await getPrisma();
  const data: Record<string, unknown> = { statusMessage };
  if (progressPct !== undefined) {
    data.progressPct = progressPct;
  }
  await prisma.inspireRun.update({ where: { runId }, data });
}

export async function updateRunBusinessContext(
  runId: string,
  context: BusinessContext
): Promise<void> {
  const prisma = await getPrisma();
  await prisma.inspireRun.update({
    where: { runId },
    data: { businessContext: JSON.stringify(context) },
  });
}

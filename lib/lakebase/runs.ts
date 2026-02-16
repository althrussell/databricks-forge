/**
 * CRUD operations for pipeline runs — backed by Lakebase (Prisma).
 */

import { getPrisma } from "@/lib/prisma";
import packageJson from "@/package.json";
import type {
  PipelineRun,
  PipelineRunConfig,
  PipelineStep,
  RunStatus,
  BusinessContext,
  BusinessPriority,
  GenerationOption,
  StepLogEntry,
  SupportedLanguage,
} from "@/lib/domain/types";
import { PROMPT_VERSIONS } from "@/lib/ai/templates";

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
  const genOpts = parseGenerationOptions(row.generationOptions);
  return {
    runId: row.runId,
    config: {
      businessName: row.businessName,
      ucMetadata: row.ucMetadata,
      operation: row.operation as PipelineRunConfig["operation"],
      businessDomains: row.businessDomains ?? "",
      businessPriorities: parseJSON<BusinessPriority[]>(row.businessPriorities, []),
      strategicGoals: row.strategicGoals ?? "",
      generationOptions: genOpts.generationOptions,
      sampleRowsPerTable: genOpts.sampleRowsPerTable,
      generationPath: row.generationPath ?? "./inspire_gen/",
      languages: parseJSON<SupportedLanguage[]>(row.languages, ["English"]),
      aiModel: row.aiModel ?? "databricks-claude-opus-4-6",
    },
    status: row.status as RunStatus,
    currentStep: (row.currentStep as PipelineStep) ?? null,
    progressPct: row.progressPct,
    statusMessage: row.statusMessage ?? null,
    businessContext: parseJSON<BusinessContext | null>(row.businessContext, null),
    errorMessage: row.errorMessage ?? null,
    appVersion: genOpts.appVersion,
    promptVersions: genOpts.promptVersions,
    stepLog: genOpts.stepLog,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Generation options -- packs sampleRowsPerTable alongside the options array
// into a single JSON field to avoid schema changes.
//
// New format: {"options":["SQL Code"],"sampleRowsPerTable":10}
// Old format: ["SQL Code"]  (backward-compatible, sampleRowsPerTable = 0)
// ---------------------------------------------------------------------------

function parseGenerationOptions(raw: string | null): {
  generationOptions: GenerationOption[];
  sampleRowsPerTable: number;
  appVersion: string | null;
  promptVersions: Record<string, string> | null;
  stepLog: StepLogEntry[];
} {
  if (!raw) return { generationOptions: ["SQL Code"], sampleRowsPerTable: 0, appVersion: null, promptVersions: null, stepLog: [] };
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { generationOptions: parsed, sampleRowsPerTable: 0, appVersion: null, promptVersions: null, stepLog: [] };
    }
    if (typeof parsed === "object" && parsed !== null) {
      return {
        generationOptions: parsed.options ?? ["SQL Code"],
        sampleRowsPerTable: parsed.sampleRowsPerTable ?? 0,
        appVersion: parsed.appVersion ?? null,
        promptVersions: parsed.promptVersions ?? null,
        stepLog: Array.isArray(parsed.stepLog) ? parsed.stepLog : [],
      };
    }
  } catch { /* fall through */ }
  return { generationOptions: ["SQL Code"], sampleRowsPerTable: 0, appVersion: null, promptVersions: null, stepLog: [] };
}

function serializeGenerationOptions(
  options: GenerationOption[],
  sampleRowsPerTable: number
): string {
  return JSON.stringify({
    options,
    sampleRowsPerTable,
    appVersion: packageJson.version,
    promptVersions: PROMPT_VERSIONS,
    stepLog: [],
  });
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
      generationOptions: serializeGenerationOptions(
        config.generationOptions,
        config.sampleRowsPerTable
      ),
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

/**
 * Delete a pipeline run and all associated data (use cases, exports).
 * Cascade deletes are handled by the database schema.
 */
export async function deleteRun(runId: string): Promise<void> {
  const prisma = await getPrisma();
  await prisma.inspireRun.delete({ where: { runId } });
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

/**
 * Append or update a step log entry in the generationOptions JSON.
 * Reads the current value, merges the entry, and writes back atomically.
 */
export async function updateRunStepLog(
  runId: string,
  entry: StepLogEntry
): Promise<void> {
  const prisma = await getPrisma();
  const row = await prisma.inspireRun.findUnique({
    where: { runId },
    select: { generationOptions: true },
  });

  let genOpts: Record<string, unknown> = {};
  try {
    genOpts = row?.generationOptions ? JSON.parse(row.generationOptions) : {};
    if (typeof genOpts !== "object" || genOpts === null) genOpts = {};
  } catch { /* fall through */ }

  const stepLog: StepLogEntry[] = Array.isArray(genOpts.stepLog)
    ? genOpts.stepLog
    : [];

  // Upsert: replace existing entry for the same step, or append
  const existingIdx = stepLog.findIndex((e) => e.step === entry.step);
  if (existingIdx >= 0) {
    stepLog[existingIdx] = { ...stepLog[existingIdx], ...entry };
  } else {
    stepLog.push(entry);
  }

  genOpts.stepLog = stepLog;

  await prisma.inspireRun.update({
    where: { runId },
    data: { generationOptions: JSON.stringify(genOpts) },
  });
}

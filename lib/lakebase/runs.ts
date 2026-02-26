/**
 * CRUD operations for pipeline runs — backed by Lakebase (Prisma).
 */

import { withPrisma } from "@/lib/prisma";
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
} from "@/lib/domain/types";
import { PROMPT_VERSIONS } from "@/lib/ai/templates";
import { archiveCurrentPromptTemplates } from "@/lib/lakebase/prompt-templates";

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
  createdBy: string | null;
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
      industry: genOpts.industry,
      discoveryDepth: (genOpts.discoveryDepth ?? "balanced") as PipelineRunConfig["discoveryDepth"],
      depthConfig: genOpts.depthConfig,
      generationPath: row.generationPath ?? "./forge_gen/",
      languages: parseJSON<string[]>(row.languages, ["English"]),
      aiModel: row.aiModel ?? "databricks-claude-opus-4-6",
      estateScanEnabled: genOpts.estateScanEnabled,
      assetDiscoveryEnabled: genOpts.assetDiscoveryEnabled,
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
    industryAutoDetected: genOpts.industryAutoDetected,
    createdBy: row.createdBy ?? null,
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
  industry: string;
  discoveryDepth: string;
  depthConfig: PipelineRunConfig["depthConfig"];
  estateScanEnabled: boolean;
  assetDiscoveryEnabled: boolean;
  industryAutoDetected: boolean;
  appVersion: string | null;
  promptVersions: Record<string, string> | null;
  stepLog: StepLogEntry[];
} {
  const defaults = { generationOptions: ["SQL Code"] as GenerationOption[], sampleRowsPerTable: 0, industry: "", discoveryDepth: "balanced", depthConfig: undefined as PipelineRunConfig["depthConfig"], estateScanEnabled: false, assetDiscoveryEnabled: false, industryAutoDetected: false, appVersion: null as string | null, promptVersions: null as Record<string, string> | null, stepLog: [] as StepLogEntry[] };
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return { ...defaults, generationOptions: parsed };
    }
    if (typeof parsed === "object" && parsed !== null) {
      return {
        generationOptions: parsed.options ?? ["SQL Code"],
        sampleRowsPerTable: parsed.sampleRowsPerTable ?? 0,
        industry: parsed.industry ?? "",
        discoveryDepth: parsed.discoveryDepth ?? "balanced",
        depthConfig: parsed.depthConfig ?? undefined,
        estateScanEnabled: parsed.estateScanEnabled === true,
        assetDiscoveryEnabled: parsed.assetDiscoveryEnabled === true,
        industryAutoDetected: parsed.industryAutoDetected === true,
        appVersion: parsed.appVersion ?? null,
        promptVersions: parsed.promptVersions ?? null,
        stepLog: Array.isArray(parsed.stepLog) ? parsed.stepLog : [],
      };
    }
  } catch { /* fall through */ }
  return defaults;
}

function serializeGenerationOptions(config: PipelineRunConfig): string {
  return JSON.stringify({
    options: config.generationOptions,
    sampleRowsPerTable: config.sampleRowsPerTable,
    industry: config.industry,
    discoveryDepth: config.discoveryDepth,
    depthConfig: config.depthConfig ?? null,
    estateScanEnabled: config.estateScanEnabled,
    assetDiscoveryEnabled: config.assetDiscoveryEnabled,
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
  config: PipelineRunConfig,
  createdBy?: string | null
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeRun.create({
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
        generationOptions: serializeGenerationOptions(config),
        generationPath: config.generationPath,
        createdBy: createdBy ?? null,
        status: "pending",
        progressPct: 0,
      },
    });
  });

  archiveCurrentPromptTemplates().catch(() => {});
}

export async function getRunById(runId: string): Promise<PipelineRun | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeRun.findUnique({ where: { runId } });
    return row ? dbRowToRun(row) : null;
  });
}

export async function listRuns(
  limit = 50,
  offset = 0
): Promise<PipelineRun[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeRun.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    });
    return rows.map(dbRowToRun);
  });
}

export async function updateRunStatus(
  runId: string,
  status: RunStatus,
  currentStep: PipelineStep | null,
  progressPct: number,
  errorMessage?: string,
  statusMessage?: string
): Promise<void> {
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

  await withPrisma(async (prisma) => {
    await prisma.forgeRun.update({ where: { runId }, data });
  });
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
  const data: Record<string, unknown> = { statusMessage };
  if (progressPct !== undefined) {
    data.progressPct = progressPct;
  }
  await withPrisma(async (prisma) => {
    await prisma.forgeRun.update({ where: { runId }, data });
  });
}

/**
 * Delete a pipeline run and all associated data (use cases, exports,
 * environment scans, Genie data). Cascade deletes are handled by the
 * database schema.
 */
export async function deleteRun(runId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeRun.delete({ where: { runId } });
  });
}

export async function updateRunBusinessContext(
  runId: string,
  context: BusinessContext
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeRun.update({
      where: { runId },
      data: { businessContext: JSON.stringify(context) },
    });
  });
}

/**
 * Persist the table filtering classification results on the run.
 * Stores the full [{fqn, classification, reason}] array as JSON.
 */
export async function updateRunFilteredTables(
  runId: string,
  classifications: Array<{ fqn: string; classification: string; reason: string }>
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeRun.update({
      where: { runId },
      data: { filteredTablesJson: JSON.stringify(classifications) },
    });
  });
}

/**
 * Link a metadata cache key to a run so we know which cached metadata
 * snapshot was used for this run's analysis.
 */
export async function updateRunMetadataCacheKey(
  runId: string,
  cacheKey: string
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeRun.update({
      where: { runId },
      data: { metadataCacheKey: cacheKey },
    });
  });
}

/**
 * Update the industry field inside the generationOptions JSON.
 * Used by the pipeline engine when auto-detecting the industry outcome map
 * after Step 1 (Business Context) completes.
 *
 * @param autoDetected - true when set by auto-detection (vs manual user selection)
 */
export async function updateRunIndustry(
  runId: string,
  industry: string,
  autoDetected: boolean = false
): Promise<void> {
  await withPrisma(async (prisma) => {
    const row = await prisma.forgeRun.findUnique({
      where: { runId },
      select: { generationOptions: true },
    });

    let genOpts: Record<string, unknown> = {};
    try {
      genOpts = row?.generationOptions ? JSON.parse(row.generationOptions) : {};
      if (typeof genOpts !== "object" || genOpts === null) genOpts = {};
    } catch { /* fall through */ }

    genOpts.industry = industry;
    genOpts.industryAutoDetected = autoDetected;

    await prisma.forgeRun.update({
      where: { runId },
      data: { generationOptions: JSON.stringify(genOpts) },
    });
  });
}

/**
 * Read the raw filteredTablesJson from a run row.
 * Returns the array of FQNs classified as "business", or null if not yet set.
 */
export async function getRunFilteredTables(
  runId: string
): Promise<string[] | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeRun.findUnique({
      where: { runId },
      select: { filteredTablesJson: true },
    });
    if (!row?.filteredTablesJson) return null;
    try {
      const classifications = JSON.parse(row.filteredTablesJson) as Array<{
        fqn: string;
        classification: string;
      }>;
      return classifications
        .filter((c) => c.classification === "business")
        .map((c) => c.fqn);
    } catch {
      return null;
    }
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
  await withPrisma(async (prisma) => {
    const row = await prisma.forgeRun.findUnique({
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

    const existingIdx = stepLog.findIndex((e) => e.step === entry.step);
    if (existingIdx >= 0) {
      stepLog[existingIdx] = { ...stepLog[existingIdx], ...entry };
    } else {
      stepLog.push(entry);
    }

    genOpts.stepLog = stepLog;

    await prisma.forgeRun.update({
      where: { runId },
      data: { generationOptions: JSON.stringify(genOpts) },
    });
  });
}

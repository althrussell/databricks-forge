/**
 * Pipeline Engine -- orchestrates the 7 pipeline steps sequentially.
 *
 * Updates Lakebase progress after each step. Handles errors and allows
 * the frontend to poll for status.
 */

import { PipelineStep } from "@/lib/domain/types";
import type { PipelineContext } from "@/lib/domain/types";
import { logger } from "@/lib/logger";
import {
  updateRunStatus,
  updateRunBusinessContext,
  updateRunStepLog,
  updateRunMetadataCacheKey,
  updateRunIndustry,
  updateRunMessage,
  getRunById,
  getRunFilteredTables,
} from "@/lib/lakebase/runs";
import { detectIndustryFromContext } from "@/lib/domain/industry-outcomes-server";
// insertUseCases/deleteUseCasesForRun are now handled inline via $transaction
import { runBusinessContext } from "./steps/business-context";
import { runMetadataExtraction } from "./steps/metadata-extraction";
import { runTableFiltering } from "./steps/table-filtering";
import { runUsecaseGeneration } from "./steps/usecase-generation";
import { runDomainClustering } from "./steps/domain-clustering";
import { runScoring } from "./steps/scoring";
import { runSqlGeneration } from "./steps/sql-generation";
import { runAssetDiscovery } from "./steps/asset-discovery";
import { runGenieRecommendations } from "./steps/genie-recommendations";
import { runDashboardRecommendations } from "./steps/dashboard-recommendations";
import {
  startJob,
  updateJob,
  updateJobDomainProgress,
  completeJob,
  failJob,
} from "@/lib/genie/engine-status";
import {
  startDashboardJob,
  updateDashboardJob,
  completeDashboardJob,
  failDashboardJob,
} from "@/lib/dashboard/engine-status";

// ---------------------------------------------------------------------------
// Step definitions with progress percentages
// ---------------------------------------------------------------------------

interface StepDef {
  step: PipelineStep;
  progressPct: number;
  label: string;
}

const STEPS: StepDef[] = [
  { step: PipelineStep.BusinessContext, progressPct: 10, label: "Generating business context" },
  { step: PipelineStep.MetadataExtraction, progressPct: 18, label: "Extracting metadata" },
  { step: PipelineStep.AssetDiscovery, progressPct: 22, label: "Discovering existing assets" },
  { step: PipelineStep.TableFiltering, progressPct: 30, label: "Filtering tables" },
  { step: PipelineStep.UsecaseGeneration, progressPct: 45, label: "Generating use cases" },
  { step: PipelineStep.DomainClustering, progressPct: 55, label: "Clustering domains" },
  { step: PipelineStep.Scoring, progressPct: 65, label: "Scoring use cases" },
  { step: PipelineStep.SqlGeneration, progressPct: 85, label: "Generating SQL" },
  { step: PipelineStep.GenieRecommendations, progressPct: 100, label: "Building Genie Spaces" },
];

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Start the pipeline for a given run. This is called asynchronously from
 * the API route -- the caller does not await the result.
 *
 * Progress is tracked in Lakebase so the frontend can poll.
 */
export async function startPipeline(runId: string): Promise<void> {
  const run = await getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const ctx: PipelineContext = {
    run,
    metadata: null,
    filteredTables: [],
    useCases: [],
    lineageGraph: null,
    sampleData: null,
    discoveryResult: null,
  };

  /** Helper: record step start/end timing in the run's stepLog. */
  async function logStep(
    step: PipelineStep,
    fn: () => Promise<void>
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    try {
      await fn();
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      await updateRunStepLog(runId, { step, startedAt, completedAt, durationMs });
    } catch (err) {
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateRunStepLog(runId, { step, startedAt, completedAt, durationMs, error: errorMsg });
      throw err;
    }
  }

  try {
    // Mark as running
    await updateRunStatus(runId, "running", STEPS[0].step, 0, undefined, "Initialising pipeline...");
    ctx.run = { ...ctx.run, status: "running" };

    // Step 1: Business Context
    await logStep(PipelineStep.BusinessContext, async () => {
      await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 5, undefined, `Generating business context for ${ctx.run.config.businessName}...`);
      logger.info(`Step 1: ${STEPS[0].label}`, { runId, step: "business-context" });
      const businessContext = await runBusinessContext(ctx, runId);
      ctx.run = { ...ctx.run, businessContext };
      await updateRunBusinessContext(runId, businessContext);
      await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 10, undefined, "Business context generated");
    });

    // Auto-detect industry outcome map if not manually selected
    const detectedIndustries = ctx.run.businessContext?.industries;
    if (!ctx.run.config.industry && detectedIndustries) {
      const detected = await detectIndustryFromContext(detectedIndustries);
      if (detected) {
        ctx.run = {
          ...ctx.run,
          config: { ...ctx.run.config, industry: detected },
        };
        await updateRunIndustry(runId, detected, true);
        logger.info("Auto-detected industry outcome map", {
          runId,
          detected,
          from: detectedIndustries,
        });
        await updateRunMessage(
          runId,
          `Auto-detected industry: ${detected}`
        );
      }
    }

    // Step 2: Metadata Extraction
    await logStep(PipelineStep.MetadataExtraction, async () => {
      await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 12, undefined, `Extracting metadata from ${ctx.run.config.ucMetadata}...`);
      logger.info(`Step 2: ${STEPS[1].label}`, { runId, step: "metadata-extraction" });
      const extractionResult = await runMetadataExtraction(ctx, runId);
      ctx.metadata = extractionResult.snapshot;
      ctx.lineageGraph = extractionResult.lineageGraph;
      if (ctx.metadata.cacheKey) {
        await updateRunMetadataCacheKey(runId, ctx.metadata.cacheKey);
        const { saveMetadataSnapshot } = await import("@/lib/lakebase/metadata-cache");
        await saveMetadataSnapshot(ctx.metadata);
      }
      await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 18, undefined, `Found ${ctx.metadata.tableCount} tables, ${ctx.metadata.columnCount} columns`);
    });

    // Step 2b: Asset Discovery (conditional -- skipped when assetDiscoveryEnabled is false)
    if (ctx.run.config.assetDiscoveryEnabled) {
      await logStep(PipelineStep.AssetDiscovery, async () => {
        await updateRunStatus(runId, "running", PipelineStep.AssetDiscovery, 19, undefined, "Discovering existing Genie spaces, dashboards, and metric views...");
        logger.info("Step 2b: Asset Discovery", { runId, step: "asset-discovery" });
        ctx.discoveryResult = await runAssetDiscovery(ctx, runId);
        const summary = ctx.discoveryResult
          ? `Found ${ctx.discoveryResult.genieSpaces.length} Genie spaces, ${ctx.discoveryResult.dashboards.length} dashboards, ${ctx.discoveryResult.metricViews.length} metric views`
          : "Discovery skipped";
        await updateRunStatus(runId, "running", PipelineStep.AssetDiscovery, 22, undefined, summary);
      });
    }

    // Step 3: Table Filtering
    await logStep(PipelineStep.TableFiltering, async () => {
      await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 24, undefined, `Filtering ${ctx.metadata!.tableCount} tables for business relevance...`);
      logger.info(`Step 3: Table Filtering`, { runId, step: "table-filtering" });
      ctx.filteredTables = await runTableFiltering(ctx, runId);
      await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 30, undefined, `Identified ${ctx.filteredTables.length} business-relevant tables out of ${ctx.metadata!.tableCount}`);
    });

    // Step 4: Use Case Generation
    await logStep(PipelineStep.UsecaseGeneration, async () => {
      await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 32, undefined, `Generating AI use cases from ${ctx.filteredTables.length} tables...`);
      logger.info(`Step 4: ${STEPS[3].label}`, { runId, step: "usecase-generation" });
      ctx.useCases = await runUsecaseGeneration(ctx, runId);

      // Post-generation validation: strip hallucinated table references
      const validFqns = new Set([
        ...ctx.filteredTables,
        ...ctx.filteredTables.map((fqn) => fqn.replace(/`/g, "")),
      ]);
      let hallucinated = 0;
      ctx.useCases = ctx.useCases.filter((uc) => {
        uc.tablesInvolved = uc.tablesInvolved.filter((t) => {
          const clean = t.replace(/`/g, "");
          return validFqns.has(t) || validFqns.has(clean);
        });
        if (uc.tablesInvolved.length === 0) {
          hallucinated++;
          return false;
        }
        return true;
      });
      if (hallucinated > 0) {
        logger.warn("Removed use cases with hallucinated table references", {
          runId,
          removedCount: hallucinated,
          remainingCount: ctx.useCases.length,
        });
      }

      await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 45, undefined, `Generated ${ctx.useCases.length} validated use cases${hallucinated > 0 ? ` (${hallucinated} removed — invalid table refs)` : ""}`);
    });

    // Step 5: Domain Clustering
    await logStep(PipelineStep.DomainClustering, async () => {
      await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 47, undefined, `Assigning domains to ${ctx.useCases.length} use cases...`);
      logger.info(`Step 5: ${STEPS[4].label}`, { runId, step: "domain-clustering" });
      ctx.useCases = await runDomainClustering(ctx, runId);
      const domainCount = new Set(ctx.useCases.map((uc) => uc.domain)).size;
      await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 55, undefined, `Organised use cases into ${domainCount} domains`);
    });

    // Step 6: Scoring & Deduplication
    await logStep(PipelineStep.Scoring, async () => {
      const preScoringCount = ctx.useCases.length;
      await updateRunStatus(runId, "running", PipelineStep.Scoring, 57, undefined, `Scoring and deduplicating ${preScoringCount} use cases...`);
      logger.info(`Step 6: ${STEPS[5].label}`, { runId, step: "scoring" });
      ctx.useCases = await runScoring(ctx, runId);
      await updateRunStatus(runId, "running", PipelineStep.Scoring, 65, undefined, `Scored ${ctx.useCases.length} use cases`);
    });

    // Step 7: SQL Generation
    let sqlOk = 0;
    await logStep(PipelineStep.SqlGeneration, async () => {
      await updateRunStatus(runId, "running", PipelineStep.SqlGeneration, 67, undefined, `Generating SQL for ${ctx.useCases.length} use cases...`);
      logger.info(`Step 7: ${STEPS[6].label}`, { runId, step: "sql-generation" });
      ctx.useCases = await runSqlGeneration(ctx, runId);
      sqlOk = ctx.useCases.filter((uc) => uc.sqlStatus === "generated").length;
      await updateRunStatus(runId, "running", PipelineStep.SqlGeneration, 85, undefined, `Generated SQL for ${sqlOk}/${ctx.useCases.length} use cases`);
    });

    // Persist use cases atomically (delete old + insert new in a transaction)
    logger.info(`Persisting ${ctx.useCases.length} use cases`, { runId });
    const { withPrisma } = await import("@/lib/prisma");
    await withPrisma(async (prisma) => {
      await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        await tx.forgeUseCase.deleteMany({ where: { runId } });
        if (ctx.useCases.length > 0) {
          await tx.forgeUseCase.createMany({
            data: ctx.useCases.map((uc) => ({
              id: uc.id,
              runId: uc.runId,
              useCaseNo: uc.useCaseNo,
              name: uc.name,
              type: uc.type,
              analyticsTechnique: uc.analyticsTechnique,
              statement: uc.statement,
              solution: uc.solution,
              businessValue: uc.businessValue,
              beneficiary: uc.beneficiary,
              sponsor: uc.sponsor,
              domain: uc.domain,
              subdomain: uc.subdomain,
              tablesInvolved: JSON.stringify(uc.tablesInvolved),
              priorityScore: uc.priorityScore,
              feasibilityScore: uc.feasibilityScore,
              impactScore: uc.impactScore,
              overallScore: uc.overallScore,
              sqlCode: uc.sqlCode,
              sqlStatus: uc.sqlStatus,
            })),
          });
        }
      });
    });

    // Generate vector embeddings for use cases + business context (best-effort)
    try {
      const { embedRunResults } = await import("@/lib/embeddings/embed-pipeline");
      const bcJson = ctx.run.businessContext ? JSON.stringify(ctx.run.businessContext) : null;
      await embedRunResults(runId, ctx.useCases, bcJson, ctx.run.config.businessName);
    } catch (embedErr) {
      logger.warn("Use case embedding failed (non-fatal)", {
        runId,
        error: embedErr instanceof Error ? embedErr.message : String(embedErr),
      });
    }

    // Mark as completed -- Genie Engine runs in the background
    const finalDomains = new Set(ctx.useCases.map((uc) => uc.domain)).size;
    await updateRunStatus(runId, "completed", null, 100, undefined, `Pipeline complete: ${ctx.useCases.length} use cases across ${finalDomains} domains (${sqlOk} with SQL)`);
    logger.info("Pipeline completed, starting Genie Engine in background", { runId, useCaseCount: ctx.useCases.length, sqlOk });

    // Fire Genie Engine and Dashboard Engine concurrently in the background.
    startBackgroundEngines(ctx, runId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown pipeline error";
    logger.error(`Pipeline failed`, { runId, error: message });
    try {
      await updateRunStatus(
        runId,
        "failed",
        ctx.run.currentStep,
        ctx.run.progressPct,
        message,
        `Pipeline failed: ${message}`
      );
    } catch (statusError) {
      logger.error("Failed to update run status after pipeline failure", {
        runId,
        originalError: message,
        statusError: statusError instanceof Error ? statusError.message : String(statusError),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Resume
// ---------------------------------------------------------------------------

/**
 * Resume a failed pipeline from the first incomplete step.
 * Restores persisted context (business context, metadata, filtered tables)
 * so that expensive early steps are not re-run.
 */
export async function resumePipeline(runId: string): Promise<void> {
  const run = await getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);
  if (run.status !== "failed") {
    throw new Error(`Cannot resume run with status "${run.status}"`);
  }

  const completedSteps = new Set(
    (run.stepLog ?? [])
      .filter((e) => e.completedAt && !e.error)
      .map((e) => e.step)
  );

  const resumeIndex = STEPS.findIndex((s) => !completedSteps.has(s.step));
  if (resumeIndex < 0) {
    throw new Error("All steps already completed — nothing to resume");
  }

  const ctx: PipelineContext = {
    run,
    metadata: null,
    filteredTables: [],
    useCases: [],
    lineageGraph: null,
    sampleData: null,
    discoveryResult: null,
  };

  // Restore business context (persisted after step 1)
  if (completedSteps.has(PipelineStep.BusinessContext) && run.businessContext) {
    ctx.run = { ...ctx.run, businessContext: run.businessContext };
  }

  // Restore metadata snapshot (persisted after step 2)
  if (completedSteps.has(PipelineStep.MetadataExtraction)) {
    const { loadMetadataForRun } = await import("@/lib/lakebase/metadata-cache");
    const snapshot = await loadMetadataForRun(runId);
    if (snapshot) ctx.metadata = snapshot;
  }

  // Restore discovery result (persisted after step 2b)
  if (completedSteps.has(PipelineStep.AssetDiscovery)) {
    const { getDiscoveryResultsByRunId } = await import("@/lib/lakebase/discovered-assets");
    const discoveryData = await getDiscoveryResultsByRunId(runId);
    if (discoveryData) {
      ctx.discoveryResult = {
        genieSpaces: discoveryData.genieSpaces.map((s) => ({
          ...s,
          description: null,
          instructionLength: 0,
        })),
        dashboards: discoveryData.dashboards.map((d) => ({
          ...d,
          creatorEmail: undefined,
          updatedAt: undefined,
          parentPath: undefined,
        })),
        metricViews: [],
        discoveredAt: new Date().toISOString(),
      };
    }
  }

  // Restore filtered tables (persisted after step 3)
  if (completedSteps.has(PipelineStep.TableFiltering)) {
    const tables = await getRunFilteredTables(runId);
    if (tables) ctx.filteredTables = tables;
  }

  logger.info("Resuming pipeline", {
    runId,
    resumeFromStep: STEPS[resumeIndex].step,
    completedSteps: [...completedSteps],
  });

  /** Helper: record step start/end timing in the run's stepLog. */
  async function logStep(
    step: PipelineStep,
    fn: () => Promise<void>
  ): Promise<void> {
    const startedAt = new Date().toISOString();
    try {
      await fn();
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      await updateRunStepLog(runId, { step, startedAt, completedAt, durationMs });
    } catch (err) {
      const completedAt = new Date().toISOString();
      const durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
      const errorMsg = err instanceof Error ? err.message : String(err);
      await updateRunStepLog(runId, { step, startedAt, completedAt, durationMs, error: errorMsg });
      throw err;
    }
  }

  try {
    await updateRunStatus(runId, "running", STEPS[resumeIndex].step, STEPS[resumeIndex].progressPct, undefined, `Resuming from ${STEPS[resumeIndex].label}...`);
    ctx.run = { ...ctx.run, status: "running" };

    // Step 1: Business Context
    if (resumeIndex <= 0) {
      await logStep(PipelineStep.BusinessContext, async () => {
        await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 5, undefined, `Generating business context for ${ctx.run.config.businessName}...`);
        logger.info("Step 1: Generating business context", { runId, step: "business-context" });
        const businessContext = await runBusinessContext(ctx, runId);
        ctx.run = { ...ctx.run, businessContext };
        await updateRunBusinessContext(runId, businessContext);
        await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 10, undefined, "Business context generated");
      });

      const detectedIndustries = ctx.run.businessContext?.industries;
      if (!ctx.run.config.industry && detectedIndustries) {
        const detected = await detectIndustryFromContext(detectedIndustries);
        if (detected) {
          ctx.run = { ...ctx.run, config: { ...ctx.run.config, industry: detected } };
          await updateRunIndustry(runId, detected, true);
          await updateRunMessage(runId, `Auto-detected industry: ${detected}`);
        }
      }
    }

    // Step 2: Metadata Extraction
    if (resumeIndex <= 1) {
      await logStep(PipelineStep.MetadataExtraction, async () => {
        await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 12, undefined, `Extracting metadata from ${ctx.run.config.ucMetadata}...`);
        logger.info("Step 2: Extracting metadata", { runId, step: "metadata-extraction" });
        const extractionResult = await runMetadataExtraction(ctx, runId);
        ctx.metadata = extractionResult.snapshot;
        ctx.lineageGraph = extractionResult.lineageGraph;
        if (ctx.metadata.cacheKey) {
          await updateRunMetadataCacheKey(runId, ctx.metadata.cacheKey);
          const { saveMetadataSnapshot } = await import("@/lib/lakebase/metadata-cache");
          await saveMetadataSnapshot(ctx.metadata);
        }
        await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 18, undefined, `Found ${ctx.metadata.tableCount} tables, ${ctx.metadata.columnCount} columns`);
      });
    }

    // Step 2b: Asset Discovery (conditional)
    if (resumeIndex <= 2 && ctx.run.config.assetDiscoveryEnabled) {
      await logStep(PipelineStep.AssetDiscovery, async () => {
        await updateRunStatus(runId, "running", PipelineStep.AssetDiscovery, 19, undefined, "Discovering existing Genie spaces, dashboards, and metric views...");
        logger.info("Step 2b: Asset Discovery", { runId, step: "asset-discovery" });
        ctx.discoveryResult = await runAssetDiscovery(ctx, runId);
        const summary = ctx.discoveryResult
          ? `Found ${ctx.discoveryResult.genieSpaces.length} Genie spaces, ${ctx.discoveryResult.dashboards.length} dashboards, ${ctx.discoveryResult.metricViews.length} metric views`
          : "Discovery skipped";
        await updateRunStatus(runId, "running", PipelineStep.AssetDiscovery, 22, undefined, summary);
      });
    }

    // Step 3: Table Filtering
    if (resumeIndex <= 3) {
      await logStep(PipelineStep.TableFiltering, async () => {
        await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 24, undefined, `Filtering ${ctx.metadata!.tableCount} tables for business relevance...`);
        logger.info("Step 3: Filtering tables", { runId, step: "table-filtering" });
        ctx.filteredTables = await runTableFiltering(ctx, runId);
        await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 30, undefined, `Identified ${ctx.filteredTables.length} business-relevant tables out of ${ctx.metadata!.tableCount}`);
      });
    }

    // Step 4: Use Case Generation
    if (resumeIndex <= 4) {
      await logStep(PipelineStep.UsecaseGeneration, async () => {
        await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 32, undefined, `Generating AI use cases from ${ctx.filteredTables.length} tables...`);
        logger.info("Step 4: Generating use cases", { runId, step: "usecase-generation" });
        ctx.useCases = await runUsecaseGeneration(ctx, runId);

        const validFqns = new Set([
          ...ctx.filteredTables,
          ...ctx.filteredTables.map((fqn) => fqn.replace(/`/g, "")),
        ]);
        let hallucinated = 0;
        ctx.useCases = ctx.useCases.filter((uc) => {
          uc.tablesInvolved = uc.tablesInvolved.filter((t) => {
            const clean = t.replace(/`/g, "");
            return validFqns.has(t) || validFqns.has(clean);
          });
          if (uc.tablesInvolved.length === 0) { hallucinated++; return false; }
          return true;
        });
        if (hallucinated > 0) {
          logger.warn("Removed use cases with hallucinated table references", { runId, removedCount: hallucinated, remainingCount: ctx.useCases.length });
        }
        await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 45, undefined, `Generated ${ctx.useCases.length} validated use cases${hallucinated > 0 ? ` (${hallucinated} removed)` : ""}`);
      });
    }

    // Step 5: Domain Clustering
    if (resumeIndex <= 5) {
      await logStep(PipelineStep.DomainClustering, async () => {
        await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 47, undefined, `Assigning domains to ${ctx.useCases.length} use cases...`);
        logger.info("Step 5: Clustering domains", { runId, step: "domain-clustering" });
        ctx.useCases = await runDomainClustering(ctx, runId);
        const domainCount = new Set(ctx.useCases.map((uc) => uc.domain)).size;
        await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 55, undefined, `Organised use cases into ${domainCount} domains`);
      });
    }

    // Step 6: Scoring
    if (resumeIndex <= 6) {
      await logStep(PipelineStep.Scoring, async () => {
        await updateRunStatus(runId, "running", PipelineStep.Scoring, 57, undefined, `Scoring and deduplicating ${ctx.useCases.length} use cases...`);
        logger.info("Step 6: Scoring", { runId, step: "scoring" });
        ctx.useCases = await runScoring(ctx, runId);
        await updateRunStatus(runId, "running", PipelineStep.Scoring, 65, undefined, `Scored ${ctx.useCases.length} use cases`);
      });
    }

    // Step 7: SQL Generation
    let sqlOk = 0;
    if (resumeIndex <= 7) {
      await logStep(PipelineStep.SqlGeneration, async () => {
        await updateRunStatus(runId, "running", PipelineStep.SqlGeneration, 67, undefined, `Generating SQL for ${ctx.useCases.length} use cases...`);
        logger.info("Step 7: Generating SQL", { runId, step: "sql-generation" });
        ctx.useCases = await runSqlGeneration(ctx, runId);
        sqlOk = ctx.useCases.filter((uc) => uc.sqlStatus === "generated").length;
        await updateRunStatus(runId, "running", PipelineStep.SqlGeneration, 85, undefined, `Generated SQL for ${sqlOk}/${ctx.useCases.length} use cases`);
      });
    }

    // Persist use cases
    logger.info(`Persisting ${ctx.useCases.length} use cases`, { runId });
    const { withPrisma } = await import("@/lib/prisma");
    await withPrisma(async (prisma) => {
      await prisma.$transaction(async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        await tx.forgeUseCase.deleteMany({ where: { runId } });
        if (ctx.useCases.length > 0) {
          await tx.forgeUseCase.createMany({
            data: ctx.useCases.map((uc) => ({
              id: uc.id, runId: uc.runId, useCaseNo: uc.useCaseNo,
              name: uc.name, type: uc.type, analyticsTechnique: uc.analyticsTechnique,
              statement: uc.statement, solution: uc.solution, businessValue: uc.businessValue,
              beneficiary: uc.beneficiary, sponsor: uc.sponsor, domain: uc.domain,
              subdomain: uc.subdomain, tablesInvolved: JSON.stringify(uc.tablesInvolved),
              priorityScore: uc.priorityScore, feasibilityScore: uc.feasibilityScore,
              impactScore: uc.impactScore, overallScore: uc.overallScore,
              sqlCode: uc.sqlCode, sqlStatus: uc.sqlStatus,
            })),
          });
        }
      });
    });

    // Step 8: Genie Recommendations
    if (resumeIndex <= 8) {
      // Genie recommendations are handled by the background engine below
    }

    // Generate vector embeddings for use cases + business context (best-effort)
    try {
      const { embedRunResults } = await import("@/lib/embeddings/embed-pipeline");
      const bcJson = ctx.run.businessContext ? JSON.stringify(ctx.run.businessContext) : null;
      await embedRunResults(runId, ctx.useCases, bcJson, ctx.run.config.businessName);
    } catch (embedErr) {
      logger.warn("Use case embedding failed (non-fatal)", {
        runId,
        error: embedErr instanceof Error ? embedErr.message : String(embedErr),
      });
    }

    const finalDomains = new Set(ctx.useCases.map((uc) => uc.domain)).size;
    await updateRunStatus(runId, "completed", null, 100, undefined, `Pipeline complete: ${ctx.useCases.length} use cases across ${finalDomains} domains (${sqlOk} with SQL)`);
    logger.info("Resumed pipeline completed", { runId, useCaseCount: ctx.useCases.length, sqlOk });

    startBackgroundEngines(ctx, runId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown pipeline error";
    logger.error("Resumed pipeline failed", { runId, error: message });
    try {
      await updateRunStatus(runId, "failed", ctx.run.currentStep, ctx.run.progressPct, message, `Pipeline failed: ${message}`);
    } catch (statusError) {
      logger.error("Failed to update run status after resume failure", {
        runId,
        originalError: message,
        statusError: statusError instanceof Error ? statusError.message : String(statusError),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Background Engines (concurrent: Genie + Dashboard)
// ---------------------------------------------------------------------------

/**
 * Fire-and-forget background engines. Genie and Dashboard run concurrently
 * since the Dashboard Engine gracefully handles missing Genie data (it
 * fetches whatever recommendations exist in Lakebase at the time it runs).
 * Each engine's progress is tracked independently via its own status module.
 */
function startBackgroundEngines(
  ctx: PipelineContext,
  runId: string
): void {
  const genieTask = async () => {
    await startJob(runId);
    try {
      const genieCount = await runGenieRecommendations(
        ctx,
        runId,
        (message, percent, completedDomains, totalDomains) => {
          updateJob(runId, message, percent);
          updateJobDomainProgress(runId, completedDomains, totalDomains);
        },
      );
      await completeJob(runId, genieCount);
      logger.info("Background Genie Engine completed", { runId, genieCount });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failJob(runId, msg);
      logger.error("Background Genie Engine failed", { runId, error: msg });
    }
  };

  const dashboardTask = async () => {
    await startDashboardJob(runId);
    try {
      const dashCount = await runDashboardRecommendations(
        ctx,
        runId,
        (message, percent) => updateDashboardJob(runId, message, percent),
      );
      await completeDashboardJob(runId, dashCount);
      logger.info("Background Dashboard Engine completed", { runId, dashboardCount: dashCount });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await failDashboardJob(runId, msg);
      logger.error("Background Dashboard Engine failed", { runId, error: msg });
    }
  };

  Promise.allSettled([genieTask(), dashboardTask()]);
}

/**
 * Returns the ordered list of pipeline steps with labels and progress.
 * Used by the UI to render the progress stepper.
 */
export function getPipelineSteps(): StepDef[] {
  return STEPS;
}

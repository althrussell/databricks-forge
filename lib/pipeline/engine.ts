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
import { runGenieRecommendations } from "./steps/genie-recommendations";

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
  { step: PipelineStep.MetadataExtraction, progressPct: 20, label: "Extracting metadata" },
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
      // Link the metadata snapshot to this run for auditing
      if (ctx.metadata.cacheKey) {
        await updateRunMetadataCacheKey(runId, ctx.metadata.cacheKey);
        // Persist the full snapshot for later use (e.g. Genie recommendations)
        const { saveMetadataSnapshot } = await import("@/lib/lakebase/metadata-cache");
        await saveMetadataSnapshot(ctx.metadata);
      }
      await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 20, undefined, `Found ${ctx.metadata.tableCount} tables, ${ctx.metadata.columnCount} columns`);
    });

    // Step 3: Table Filtering
    await logStep(PipelineStep.TableFiltering, async () => {
      await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 22, undefined, `Filtering ${ctx.metadata!.tableCount} tables for business relevance...`);
      logger.info(`Step 3: ${STEPS[2].label}`, { runId, step: "table-filtering" });
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
    const prisma = await (await import("@/lib/prisma")).getPrisma();
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

    // Step 8: Genie Space Recommendations
    let genieCount = 0;
    await logStep(PipelineStep.GenieRecommendations, async () => {
      await updateRunStatus(runId, "running", PipelineStep.GenieRecommendations, 90, undefined, `Building Genie Space recommendations from ${ctx.useCases.length} use cases...`);
      logger.info(`Step 8: ${STEPS[7].label}`, { runId, step: "genie-recommendations" });
      genieCount = await runGenieRecommendations(ctx, runId);
      await updateRunStatus(runId, "running", PipelineStep.GenieRecommendations, 98, undefined, `Built ${genieCount} Genie Space recommendations`);
    });

    // Mark as completed
    const finalDomains = new Set(ctx.useCases.map((uc) => uc.domain)).size;
    await updateRunStatus(runId, "completed", null, 100, undefined, `Pipeline complete: ${ctx.useCases.length} use cases across ${finalDomains} domains (${sqlOk} with SQL, ${genieCount} Genie spaces)`);
    logger.info(`Pipeline completed`, { runId, useCaseCount: ctx.useCases.length, sqlOk, genieCount });
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

/**
 * Returns the ordered list of pipeline steps with labels and progress.
 * Used by the UI to render the progress stepper.
 */
export function getPipelineSteps(): StepDef[] {
  return STEPS;
}

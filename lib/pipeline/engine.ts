/**
 * Pipeline Engine -- orchestrates the 7 pipeline steps sequentially.
 *
 * Updates Lakebase progress after each step. Handles errors and allows
 * the frontend to poll for status.
 */

import { PipelineStep } from "@/lib/domain/types";
import type { PipelineContext, PipelineRun, UseCase } from "@/lib/domain/types";
import {
  updateRunStatus,
  updateRunBusinessContext,
  updateRunMessage,
  getRunById,
} from "@/lib/lakebase/runs";
import { insertUseCases, deleteUseCasesForRun } from "@/lib/lakebase/usecases";
import { runBusinessContext } from "./steps/business-context";
import { runMetadataExtraction } from "./steps/metadata-extraction";
import { runTableFiltering } from "./steps/table-filtering";
import { runUsecaseGeneration } from "./steps/usecase-generation";
import { runDomainClustering } from "./steps/domain-clustering";
import { runScoring } from "./steps/scoring";
import { runSqlGeneration } from "./steps/sql-generation";

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
  { step: PipelineStep.SqlGeneration, progressPct: 100, label: "Generating SQL" },
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
  let run = await getRunById(runId);
  if (!run) throw new Error(`Run ${runId} not found`);

  const ctx: PipelineContext = {
    run,
    metadata: null,
    filteredTables: [],
    useCases: [],
  };

  try {
    // Mark as running
    await updateRunStatus(runId, "running", STEPS[0].step, 0, undefined, "Initialising pipeline...");
    ctx.run = { ...ctx.run, status: "running" };

    // Step 1: Business Context
    await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 5, undefined, `Generating business context for ${ctx.run.config.businessName}...`);
    console.log(`[engine] Step 1: ${STEPS[0].label}`);
    const businessContext = await runBusinessContext(ctx, runId);
    ctx.run = { ...ctx.run, businessContext };
    await updateRunBusinessContext(runId, businessContext);
    await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 10, undefined, "Business context generated");

    // Step 2: Metadata Extraction
    await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 12, undefined, `Extracting metadata from ${ctx.run.config.ucMetadata}...`);
    console.log(`[engine] Step 2: ${STEPS[1].label}`);
    ctx.metadata = await runMetadataExtraction(ctx, runId);
    await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 20, undefined, `Found ${ctx.metadata.tableCount} tables, ${ctx.metadata.columnCount} columns`);

    // Step 3: Table Filtering
    await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 22, undefined, `Filtering ${ctx.metadata.tableCount} tables for business relevance...`);
    console.log(`[engine] Step 3: ${STEPS[2].label}`);
    ctx.filteredTables = await runTableFiltering(ctx, runId);
    await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 30, undefined, `Identified ${ctx.filteredTables.length} business-relevant tables out of ${ctx.metadata.tableCount}`);

    // Step 4: Use Case Generation
    await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 32, undefined, `Generating AI use cases from ${ctx.filteredTables.length} tables...`);
    console.log(`[engine] Step 4: ${STEPS[3].label}`);
    ctx.useCases = await runUsecaseGeneration(ctx, runId);
    await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 45, undefined, `Generated ${ctx.useCases.length} raw use cases`);

    // Step 5: Domain Clustering
    await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 47, undefined, `Assigning domains to ${ctx.useCases.length} use cases...`);
    console.log(`[engine] Step 5: ${STEPS[4].label}`);
    ctx.useCases = await runDomainClustering(ctx, runId);
    const domainCount = new Set(ctx.useCases.map((uc) => uc.domain)).size;
    await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 55, undefined, `Organised use cases into ${domainCount} domains`);

    // Step 6: Scoring & Deduplication
    const preScoringCount = ctx.useCases.length;
    await updateRunStatus(runId, "running", PipelineStep.Scoring, 57, undefined, `Scoring and deduplicating ${preScoringCount} use cases...`);
    console.log(`[engine] Step 6: ${STEPS[5].label}`);
    ctx.useCases = await runScoring(ctx, runId);
    await updateRunStatus(runId, "running", PipelineStep.Scoring, 65, undefined, `Scored ${ctx.useCases.length} use cases`);

    // Step 7: SQL Generation
    await updateRunStatus(runId, "running", PipelineStep.SqlGeneration, 67, undefined, `Generating SQL for ${ctx.useCases.length} use cases...`);
    console.log(`[engine] Step 7: ${STEPS[6].label}`);
    ctx.useCases = await runSqlGeneration(ctx, runId);
    const sqlOk = ctx.useCases.filter((uc) => uc.sqlStatus === "generated").length;
    await updateRunStatus(runId, "running", PipelineStep.SqlGeneration, 95, undefined, `Generated SQL for ${sqlOk}/${ctx.useCases.length} use cases`);

    // Persist use cases
    console.log(`[engine] Persisting ${ctx.useCases.length} use cases`);
    await deleteUseCasesForRun(runId); // clean up any prior run
    await insertUseCases(ctx.useCases);

    // Mark as completed
    const finalDomains = new Set(ctx.useCases.map((uc) => uc.domain)).size;
    await updateRunStatus(runId, "completed", null, 100, undefined, `Pipeline complete: ${ctx.useCases.length} use cases across ${finalDomains} domains (${sqlOk} with SQL)`);
    console.log(`[engine] Pipeline completed: ${ctx.useCases.length} use cases, ${sqlOk} with SQL`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown pipeline error";
    console.error(`[engine] Pipeline failed: ${message}`);
    await updateRunStatus(
      runId,
      "failed",
      ctx.run.currentStep,
      ctx.run.progressPct,
      message,
      `Pipeline failed: ${message}`
    );
  }
}

/**
 * Returns the ordered list of pipeline steps with labels and progress.
 * Used by the UI to render the progress stepper.
 */
export function getPipelineSteps(): StepDef[] {
  return STEPS;
}

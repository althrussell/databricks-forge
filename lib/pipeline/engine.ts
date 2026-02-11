/**
 * Pipeline Engine -- orchestrates the 6 pipeline steps sequentially.
 *
 * Updates Lakebase progress after each step. Handles errors and allows
 * the frontend to poll for status.
 */

import { PipelineStep } from "@/lib/domain/types";
import type { PipelineContext, PipelineRun, UseCase } from "@/lib/domain/types";
import {
  updateRunStatus,
  updateRunBusinessContext,
  getRunById,
} from "@/lib/lakebase/runs";
import { insertUseCases, deleteUseCasesForRun } from "@/lib/lakebase/usecases";
import { runBusinessContext } from "./steps/business-context";
import { runMetadataExtraction } from "./steps/metadata-extraction";
import { runTableFiltering } from "./steps/table-filtering";
import { runUsecaseGeneration } from "./steps/usecase-generation";
import { runDomainClustering } from "./steps/domain-clustering";
import { runScoring } from "./steps/scoring";

// ---------------------------------------------------------------------------
// Step definitions with progress percentages
// ---------------------------------------------------------------------------

interface StepDef {
  step: PipelineStep;
  progressPct: number;
  label: string;
}

const STEPS: StepDef[] = [
  { step: PipelineStep.BusinessContext, progressPct: 15, label: "Generating business context" },
  { step: PipelineStep.MetadataExtraction, progressPct: 30, label: "Extracting metadata" },
  { step: PipelineStep.TableFiltering, progressPct: 45, label: "Filtering tables" },
  { step: PipelineStep.UsecaseGeneration, progressPct: 65, label: "Generating use cases" },
  { step: PipelineStep.DomainClustering, progressPct: 80, label: "Clustering domains" },
  { step: PipelineStep.Scoring, progressPct: 100, label: "Scoring use cases" },
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
    await updateRunStatus(runId, "running", STEPS[0].step, 0);
    ctx.run = { ...ctx.run, status: "running" };

    // Step 1: Business Context
    await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 5);
    console.log(`[engine] Step 1: ${STEPS[0].label}`);
    const businessContext = await runBusinessContext(ctx);
    ctx.run = { ...ctx.run, businessContext };
    await updateRunBusinessContext(runId, businessContext);
    await updateRunStatus(runId, "running", PipelineStep.BusinessContext, 15);

    // Step 2: Metadata Extraction
    await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 20);
    console.log(`[engine] Step 2: ${STEPS[1].label}`);
    ctx.metadata = await runMetadataExtraction(ctx);
    await updateRunStatus(runId, "running", PipelineStep.MetadataExtraction, 30);

    // Step 3: Table Filtering
    await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 35);
    console.log(`[engine] Step 3: ${STEPS[2].label}`);
    ctx.filteredTables = await runTableFiltering(ctx);
    await updateRunStatus(runId, "running", PipelineStep.TableFiltering, 45);

    // Step 4: Use Case Generation
    await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 50);
    console.log(`[engine] Step 4: ${STEPS[3].label}`);
    ctx.useCases = await runUsecaseGeneration(ctx);
    await updateRunStatus(runId, "running", PipelineStep.UsecaseGeneration, 65);

    // Step 5: Domain Clustering
    await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 70);
    console.log(`[engine] Step 5: ${STEPS[4].label}`);
    ctx.useCases = await runDomainClustering(ctx);
    await updateRunStatus(runId, "running", PipelineStep.DomainClustering, 80);

    // Step 6: Scoring & Deduplication
    await updateRunStatus(runId, "running", PipelineStep.Scoring, 85);
    console.log(`[engine] Step 6: ${STEPS[5].label}`);
    ctx.useCases = await runScoring(ctx);
    await updateRunStatus(runId, "running", PipelineStep.Scoring, 95);

    // Persist use cases
    console.log(`[engine] Persisting ${ctx.useCases.length} use cases`);
    await deleteUseCasesForRun(runId); // clean up any prior run
    await insertUseCases(ctx.useCases);

    // Mark as completed
    await updateRunStatus(runId, "completed", null, 100);
    console.log(`[engine] Pipeline completed: ${ctx.useCases.length} use cases`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown pipeline error";
    console.error(`[engine] Pipeline failed: ${message}`);
    await updateRunStatus(
      runId,
      "failed",
      ctx.run.currentStep,
      ctx.run.progressPct,
      message
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

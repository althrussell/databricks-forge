/**
 * Auto-Improve Loop -- iteratively runs benchmarks, categorizes failures,
 * applies targeted fixes, and re-benchmarks until a target score is reached
 * or max iterations are exhausted.
 *
 * Supports a three-space architecture for safe iteration:
 *   - Production: the original space, never modified during improvement
 *   - Dev-Best: the best configuration discovered so far (rollback target)
 *   - Dev-Working: where changes are tested before promotion
 *
 * On improvement: dev-working -> dev-best.
 * On regression: dev-best -> dev-working (rollback).
 * On completion: dev-best is promoted (caller handles final publish).
 */

import {
  runBenchmarks,
  type BenchmarkRunSummary,
  type BenchmarkRunOptions,
} from "./benchmark-runner";
import { analyzeFeedbackForFixes, type FeedbackEntry } from "./benchmark-feedback";
import {
  getGenieSpace,
  createGenieSpace,
  updateGenieSpace,
  trashGenieSpace,
} from "@/lib/dbx/genie";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoImproveConfig {
  spaceId: string;
  benchmarks: Array<{ question: string; expectedSql?: string }>;
  targetScore: number;
  maxIterations: number;
  benchmarkOptions?: BenchmarkRunOptions;
  /** Milliseconds to wait after updating a space before re-scoring (default 30000). */
  indexingWaitMs?: number;
  /** Enable three-space architecture for safe rollback (default true). */
  enableThreeSpace?: boolean;
}

export interface AutoImproveIteration {
  iteration: number;
  benchmarkSummary: BenchmarkRunSummary;
  passRate: number;
  fixCheckIds: string[];
  strategiesApplied: string[];
  durationMs: number;
}

export interface AutoImproveResult {
  finalScore: number;
  targetReached: boolean;
  iterations: AutoImproveIteration[];
  totalDurationMs: number;
  stoppedReason: "target_reached" | "max_iterations" | "no_improvement" | "aborted";
  /** Space IDs used during improvement (only when three-space is enabled). */
  devSpaces?: ThreeSpaceIds;
}

export type AutoImproveProgressCallback = (event: {
  phase: "benchmark" | "analyze" | "fix" | "indexing" | "setup" | "cleanup" | "complete";
  iteration: number;
  maxIterations: number;
  passRate: number;
  targetScore: number;
  message: string;
}) => void;

// ---------------------------------------------------------------------------
// Three-Space Architecture
// ---------------------------------------------------------------------------

export interface ThreeSpaceIds {
  production: string;
  devBest: string;
  devWorking: string;
}

/**
 * Create dev-best and dev-working clones from the production space.
 * Returns the IDs for all three spaces.
 */
export async function createDevSpaces(productionSpaceId: string): Promise<ThreeSpaceIds> {
  const prod = await getGenieSpace(productionSpaceId);
  const title = prod.title ?? "Untitled";
  const serializedSpace = prod.serialized_space ?? "{}";
  const warehouseId = prod.warehouse_id ?? "";

  const devBest = await createGenieSpace({
    title: `[Dev-Best] ${title}`,
    description: `Auto-improve dev-best clone of ${productionSpaceId}`,
    serializedSpace,
    warehouseId,
  });

  const devWorking = await createGenieSpace({
    title: `[Dev-Working] ${title}`,
    description: `Auto-improve dev-working clone of ${productionSpaceId}`,
    serializedSpace,
    warehouseId,
  });

  logger.info("Three-space architecture initialized", {
    production: productionSpaceId,
    devBest: devBest.space_id,
    devWorking: devWorking.space_id,
  });

  return {
    production: productionSpaceId,
    devBest: devBest.space_id,
    devWorking: devWorking.space_id,
  };
}

/**
 * Copy dev-working config to dev-best (on score improvement).
 */
async function promoteWorkingToBest(ids: ThreeSpaceIds): Promise<void> {
  const working = await getGenieSpace(ids.devWorking);
  await updateGenieSpace(ids.devBest, {
    serializedSpace: working.serialized_space ?? "{}",
  });
  logger.info("Promoted dev-working to dev-best", { devBest: ids.devBest });
}

/**
 * Copy dev-best config back to dev-working (rollback on regression).
 */
async function rollbackWorkingFromBest(ids: ThreeSpaceIds): Promise<void> {
  const best = await getGenieSpace(ids.devBest);
  await updateGenieSpace(ids.devWorking, {
    serializedSpace: best.serialized_space ?? "{}",
  });
  logger.info("Rolled back dev-working from dev-best", { devWorking: ids.devWorking });
}

/**
 * Clean up dev spaces after the improvement loop completes.
 * Caller can read dev-best config before cleanup to apply to production.
 */
export async function cleanupDevSpaces(ids: ThreeSpaceIds): Promise<void> {
  const cleanup = async (spaceId: string, label: string) => {
    try {
      await trashGenieSpace(spaceId);
    } catch (err) {
      logger.warn(`Failed to trash ${label} space`, { spaceId, error: String(err) });
    }
  };
  await Promise.all([cleanup(ids.devWorking, "dev-working"), cleanup(ids.devBest, "dev-best")]);
  logger.info("Dev spaces cleaned up", { ...ids });
}

/**
 * Get the final improved serialized_space from dev-best for promotion.
 */
export async function getDevBestConfig(ids: ThreeSpaceIds): Promise<string> {
  const best = await getGenieSpace(ids.devBest);
  return best.serialized_space ?? "{}";
}

// ---------------------------------------------------------------------------
// Indexing Wait
// ---------------------------------------------------------------------------

const DEFAULT_INDEXING_WAIT_MS = 30_000;

async function waitForIndexing(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Main Loop
// ---------------------------------------------------------------------------

/**
 * Run the auto-improve loop.
 *
 * @param config - Loop configuration (space, benchmarks, target, limits)
 * @param applyFixes - Callback that receives check IDs and the target space ID,
 *                     applies fixes to the space, and returns applied strategies.
 * @param onProgress - Optional progress callback for UI updates.
 * @param signal - Optional AbortSignal to cancel the loop.
 */
export async function runAutoImproveLoop(
  config: AutoImproveConfig,
  applyFixes: (checkIds: string[], targetSpaceId?: string) => Promise<string[]>,
  onProgress?: AutoImproveProgressCallback,
  signal?: AbortSignal,
): Promise<AutoImproveResult> {
  const {
    spaceId,
    benchmarks,
    targetScore,
    maxIterations,
    benchmarkOptions,
    indexingWaitMs = DEFAULT_INDEXING_WAIT_MS,
    enableThreeSpace = true,
  } = config;
  const iterations: AutoImproveIteration[] = [];
  const startTime = Date.now();
  let previousPassRate = -1;
  let stagnationCount = 0;
  const MAX_STAGNATION = 2;

  // Three-space setup
  let devSpaces: ThreeSpaceIds | undefined;
  let benchmarkSpaceId = spaceId;

  if (enableThreeSpace) {
    onProgress?.({
      phase: "setup",
      iteration: 0,
      maxIterations,
      passRate: 0,
      targetScore,
      message: "Creating dev spaces for safe iteration...",
    });

    try {
      devSpaces = await createDevSpaces(spaceId);
      benchmarkSpaceId = devSpaces.devWorking;
    } catch (err) {
      logger.warn("Three-space setup failed, falling back to in-place improvement", {
        error: String(err),
      });
      devSpaces = undefined;
      benchmarkSpaceId = spaceId;
    }
  }

  logger.info("Auto-improve loop starting", {
    spaceId,
    benchmarkSpaceId,
    benchmarkCount: benchmarks.length,
    targetScore,
    maxIterations,
    threeSpaceEnabled: !!devSpaces,
    indexingWaitMs,
  });

  const buildResult = (stoppedReason: AutoImproveResult["stoppedReason"]): AutoImproveResult => ({
    finalScore: iterations.length > 0 ? iterations[iterations.length - 1].passRate : 0,
    targetReached: stoppedReason === "target_reached",
    iterations,
    totalDurationMs: Date.now() - startTime,
    stoppedReason,
    devSpaces,
  });

  for (let i = 1; i <= maxIterations; i++) {
    if (signal?.aborted) return buildResult("aborted");

    const iterStart = Date.now();

    onProgress?.({
      phase: "benchmark",
      iteration: i,
      maxIterations,
      passRate: previousPassRate >= 0 ? previousPassRate : 0,
      targetScore,
      message: `Running benchmarks (iteration ${i}/${maxIterations})...`,
    });

    const summary = await runBenchmarks(benchmarkSpaceId, benchmarks, benchmarkOptions);
    const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

    logger.info("Auto-improve benchmark run", {
      iteration: i,
      passRate,
      passed: summary.passed,
      total: summary.total,
    });

    if (passRate >= targetScore) {
      if (devSpaces && passRate > (previousPassRate >= 0 ? previousPassRate : -1)) {
        await promoteWorkingToBest(devSpaces);
      }
      iterations.push({
        iteration: i,
        benchmarkSummary: summary,
        passRate,
        fixCheckIds: [],
        strategiesApplied: [],
        durationMs: Date.now() - iterStart,
      });

      onProgress?.({
        phase: "complete",
        iteration: i,
        maxIterations,
        passRate,
        targetScore,
        message: `Target score reached! ${passRate}% >= ${targetScore}%`,
      });

      return buildResult("target_reached");
    }

    // Stagnation detection with three-space rollback
    if (previousPassRate >= 0 && passRate <= previousPassRate) {
      stagnationCount++;

      if (devSpaces && passRate < previousPassRate) {
        await rollbackWorkingFromBest(devSpaces);
        logger.info("Regression detected, rolled back to dev-best", {
          iteration: i,
          passRate,
          previousPassRate,
        });
      }

      if (stagnationCount >= MAX_STAGNATION) {
        iterations.push({
          iteration: i,
          benchmarkSummary: summary,
          passRate,
          fixCheckIds: [],
          strategiesApplied: [],
          durationMs: Date.now() - iterStart,
        });

        onProgress?.({
          phase: "complete",
          iteration: i,
          maxIterations,
          passRate,
          targetScore,
          message: `No improvement after ${MAX_STAGNATION} iterations. Stopping at ${passRate}%.`,
        });

        return buildResult("no_improvement");
      }
    } else {
      if (devSpaces && previousPassRate >= 0) {
        await promoteWorkingToBest(devSpaces);
      }
      stagnationCount = 0;
    }
    previousPassRate = passRate;

    if (i === maxIterations) {
      iterations.push({
        iteration: i,
        benchmarkSummary: summary,
        passRate,
        fixCheckIds: [],
        strategiesApplied: [],
        durationMs: Date.now() - iterStart,
      });
      break;
    }

    // Analyze failures and determine fixes
    onProgress?.({
      phase: "analyze",
      iteration: i,
      maxIterations,
      passRate,
      targetScore,
      message: `Analyzing ${summary.failed} failures and planning fixes...`,
    });

    const feedbackEntries: FeedbackEntry[] = summary.results.map((r) => ({
      question: r.question,
      isCorrect: r.passed,
      expectedSql: r.expectedSql ?? undefined,
      failureCategory: r.failureCategory,
    }));

    const checkIds = analyzeFeedbackForFixes(feedbackEntries);

    if (checkIds.length === 0) {
      iterations.push({
        iteration: i,
        benchmarkSummary: summary,
        passRate,
        fixCheckIds: [],
        strategiesApplied: [],
        durationMs: Date.now() - iterStart,
      });
      break;
    }

    // Apply fixes to the working space
    onProgress?.({
      phase: "fix",
      iteration: i,
      maxIterations,
      passRate,
      targetScore,
      message: `Applying ${checkIds.length} fix strategies...`,
    });

    const strategiesApplied = await applyFixes(checkIds, benchmarkSpaceId);

    // Wait for Genie indexing before next benchmark run
    if (indexingWaitMs > 0 && i < maxIterations) {
      onProgress?.({
        phase: "indexing",
        iteration: i,
        maxIterations,
        passRate,
        targetScore,
        message: `Waiting ${Math.round(indexingWaitMs / 1000)}s for Genie indexing...`,
      });
      await waitForIndexing(indexingWaitMs, signal);
    }

    const iteration: AutoImproveIteration = {
      iteration: i,
      benchmarkSummary: summary,
      passRate,
      fixCheckIds: checkIds,
      strategiesApplied,
      durationMs: Date.now() - iterStart,
    };
    iterations.push(iteration);

    logger.info("Auto-improve iteration complete", {
      iteration: i,
      passRate,
      checkIds,
      strategiesApplied,
      durationMs: iteration.durationMs,
    });
  }

  const finalScore = iterations.length > 0 ? iterations[iterations.length - 1].passRate : 0;

  onProgress?.({
    phase: "complete",
    iteration: maxIterations,
    maxIterations,
    passRate: finalScore,
    targetScore,
    message: `Max iterations reached. Final score: ${finalScore}%.`,
  });

  return buildResult("max_iterations");
}

// ---------------------------------------------------------------------------
// Sequential Fix Evaluation (Gap 2)
// ---------------------------------------------------------------------------

export interface SequentialFixConfig {
  spaceId: string;
  benchmarks: Array<{ question: string; expectedSql?: string }>;
  /** Check IDs to apply as individual fixes, in order. */
  checkIds: string[];
  benchmarkOptions?: BenchmarkRunOptions;
  indexingWaitMs?: number;
}

export interface SequentialFixResult {
  /** Fix results for each check ID attempted. */
  fixResults: Array<{
    checkId: string;
    applied: boolean;
    kept: boolean;
    passRateBefore: number;
    passRateAfter: number;
    reason: string;
  }>;
  finalPassRate: number;
  totalDurationMs: number;
}

/**
 * Apply fix strategies one at a time, re-scoring after each.
 * Keeps improvements, rolls back regressions.
 *
 * Requires three-space architecture: fixes are applied to dev-working,
 * scored, and promoted/rolled-back relative to dev-best.
 *
 * @param config - Fix configuration
 * @param applyOneFix - Callback to apply a single check ID to the target space.
 *                      Returns the strategy name that was applied (or empty string).
 * @param devSpaces - Three-space IDs (must be pre-created).
 * @param onProgress - Optional progress callback.
 * @param signal - Optional abort signal.
 */
export async function applyFixesSequentially(
  config: SequentialFixConfig,
  applyOneFix: (checkId: string, targetSpaceId: string) => Promise<string>,
  devSpaces: ThreeSpaceIds,
  onProgress?: AutoImproveProgressCallback,
  signal?: AbortSignal,
): Promise<SequentialFixResult> {
  const {
    benchmarks,
    checkIds,
    benchmarkOptions,
    indexingWaitMs = DEFAULT_INDEXING_WAIT_MS,
  } = config;
  const startTime = Date.now();
  const fixResults: SequentialFixResult["fixResults"] = [];

  // Initial score
  const initialSummary = await runBenchmarks(devSpaces.devWorking, benchmarks, benchmarkOptions);
  let currentPassRate =
    initialSummary.total > 0 ? Math.round((initialSummary.passed / initialSummary.total) * 100) : 0;

  logger.info("Sequential fix evaluation starting", {
    checkIds,
    initialPassRate: currentPassRate,
    spaceId: devSpaces.devWorking,
  });

  for (let i = 0; i < checkIds.length; i++) {
    if (signal?.aborted) break;
    const checkId = checkIds[i];

    onProgress?.({
      phase: "fix",
      iteration: i + 1,
      maxIterations: checkIds.length,
      passRate: currentPassRate,
      targetScore: 100,
      message: `Applying fix ${i + 1}/${checkIds.length}: ${checkId}...`,
    });

    try {
      const strategy = await applyOneFix(checkId, devSpaces.devWorking);
      if (!strategy) {
        fixResults.push({
          checkId,
          applied: false,
          kept: false,
          passRateBefore: currentPassRate,
          passRateAfter: currentPassRate,
          reason: "No strategy matched",
        });
        continue;
      }

      // Wait for indexing
      if (indexingWaitMs > 0) {
        await waitForIndexing(indexingWaitMs, signal);
      }

      // Re-score
      const summary = await runBenchmarks(devSpaces.devWorking, benchmarks, benchmarkOptions);
      const newPassRate =
        summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

      if (newPassRate > currentPassRate) {
        // Improvement -- keep and promote
        await promoteWorkingToBest(devSpaces);
        fixResults.push({
          checkId,
          applied: true,
          kept: true,
          passRateBefore: currentPassRate,
          passRateAfter: newPassRate,
          reason: `Score improved: ${currentPassRate}% → ${newPassRate}%`,
        });
        currentPassRate = newPassRate;
      } else if (newPassRate < currentPassRate) {
        // Regression -- rollback
        await rollbackWorkingFromBest(devSpaces);
        fixResults.push({
          checkId,
          applied: true,
          kept: false,
          passRateBefore: currentPassRate,
          passRateAfter: newPassRate,
          reason: `Score regressed: ${currentPassRate}% → ${newPassRate}%, rolled back`,
        });
      } else {
        // No change -- keep (neutral fixes don't harm)
        fixResults.push({
          checkId,
          applied: true,
          kept: true,
          passRateBefore: currentPassRate,
          passRateAfter: newPassRate,
          reason: `Score unchanged at ${newPassRate}%`,
        });
      }
    } catch (err) {
      fixResults.push({
        checkId,
        applied: false,
        kept: false,
        passRateBefore: currentPassRate,
        passRateAfter: currentPassRate,
        reason: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    logger.info("Sequential fix result", {
      checkId,
      result: fixResults[fixResults.length - 1],
    });
  }

  return {
    fixResults,
    finalPassRate: currentPassRate,
    totalDurationMs: Date.now() - startTime,
  };
}

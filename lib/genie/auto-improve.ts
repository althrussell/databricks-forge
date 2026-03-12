/**
 * Auto-Improve Loop -- iteratively runs benchmarks, categorizes failures,
 * applies targeted fixes, and re-benchmarks until a target score is reached
 * or max iterations are exhausted.
 */

import {
  runBenchmarks,
  type BenchmarkRunSummary,
  type BenchmarkRunOptions,
} from "./benchmark-runner";
import { analyzeFeedbackForFixes, type FeedbackEntry } from "./benchmark-feedback";
import { logger } from "@/lib/logger";

export interface AutoImproveConfig {
  spaceId: string;
  benchmarks: Array<{ question: string; expectedSql?: string }>;
  targetScore: number;
  maxIterations: number;
  benchmarkOptions?: BenchmarkRunOptions;
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
}

export type AutoImproveProgressCallback = (event: {
  phase: "benchmark" | "analyze" | "fix" | "complete";
  iteration: number;
  maxIterations: number;
  passRate: number;
  targetScore: number;
  message: string;
}) => void;

/**
 * Run the auto-improve loop.
 *
 * @param config - Loop configuration (space, benchmarks, target, limits)
 * @param applyFixes - Callback that receives check IDs and applies fixes to the space.
 *                     Returns the list of strategies that were actually applied.
 * @param onProgress - Optional progress callback for UI updates.
 * @param signal - Optional AbortSignal to cancel the loop.
 */
export async function runAutoImproveLoop(
  config: AutoImproveConfig,
  applyFixes: (checkIds: string[]) => Promise<string[]>,
  onProgress?: AutoImproveProgressCallback,
  signal?: AbortSignal,
): Promise<AutoImproveResult> {
  const { spaceId, benchmarks, targetScore, maxIterations, benchmarkOptions } = config;
  const iterations: AutoImproveIteration[] = [];
  const startTime = Date.now();
  let previousPassRate = -1;
  let stagnationCount = 0;
  const MAX_STAGNATION = 2;

  logger.info("Auto-improve loop starting", {
    spaceId,
    benchmarkCount: benchmarks.length,
    targetScore,
    maxIterations,
  });

  for (let i = 1; i <= maxIterations; i++) {
    if (signal?.aborted) {
      return {
        finalScore: iterations.length > 0 ? iterations[iterations.length - 1].passRate : 0,
        targetReached: false,
        iterations,
        totalDurationMs: Date.now() - startTime,
        stoppedReason: "aborted",
      };
    }

    const iterStart = Date.now();

    onProgress?.({
      phase: "benchmark",
      iteration: i,
      maxIterations,
      passRate: previousPassRate >= 0 ? previousPassRate : 0,
      targetScore,
      message: `Running benchmarks (iteration ${i}/${maxIterations})...`,
    });

    const summary = await runBenchmarks(spaceId, benchmarks, benchmarkOptions);
    const passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 100) : 0;

    logger.info("Auto-improve benchmark run", {
      iteration: i,
      passRate,
      passed: summary.passed,
      total: summary.total,
    });

    if (passRate >= targetScore) {
      const iteration: AutoImproveIteration = {
        iteration: i,
        benchmarkSummary: summary,
        passRate,
        fixCheckIds: [],
        strategiesApplied: [],
        durationMs: Date.now() - iterStart,
      };
      iterations.push(iteration);

      onProgress?.({
        phase: "complete",
        iteration: i,
        maxIterations,
        passRate,
        targetScore,
        message: `Target score reached! ${passRate}% >= ${targetScore}%`,
      });

      return {
        finalScore: passRate,
        targetReached: true,
        iterations,
        totalDurationMs: Date.now() - startTime,
        stoppedReason: "target_reached",
      };
    }

    // Check for stagnation
    if (previousPassRate >= 0 && passRate <= previousPassRate) {
      stagnationCount++;
      if (stagnationCount >= MAX_STAGNATION) {
        const iteration: AutoImproveIteration = {
          iteration: i,
          benchmarkSummary: summary,
          passRate,
          fixCheckIds: [],
          strategiesApplied: [],
          durationMs: Date.now() - iterStart,
        };
        iterations.push(iteration);

        onProgress?.({
          phase: "complete",
          iteration: i,
          maxIterations,
          passRate,
          targetScore,
          message: `No improvement after ${MAX_STAGNATION} iterations. Stopping at ${passRate}%.`,
        });

        return {
          finalScore: passRate,
          targetReached: false,
          iterations,
          totalDurationMs: Date.now() - startTime,
          stoppedReason: "no_improvement",
        };
      }
    } else {
      stagnationCount = 0;
    }
    previousPassRate = passRate;

    if (i === maxIterations) {
      const iteration: AutoImproveIteration = {
        iteration: i,
        benchmarkSummary: summary,
        passRate,
        fixCheckIds: [],
        strategiesApplied: [],
        durationMs: Date.now() - iterStart,
      };
      iterations.push(iteration);
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
      const iteration: AutoImproveIteration = {
        iteration: i,
        benchmarkSummary: summary,
        passRate,
        fixCheckIds: [],
        strategiesApplied: [],
        durationMs: Date.now() - iterStart,
      };
      iterations.push(iteration);
      break;
    }

    // Apply fixes
    onProgress?.({
      phase: "fix",
      iteration: i,
      maxIterations,
      passRate,
      targetScore,
      message: `Applying ${checkIds.length} fix strategies...`,
    });

    const strategiesApplied = await applyFixes(checkIds);

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

  return {
    finalScore,
    targetReached: false,
    iterations,
    totalDurationMs: Date.now() - startTime,
    stoppedReason: "max_iterations",
  };
}

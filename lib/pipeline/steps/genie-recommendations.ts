/**
 * Pipeline Step 8: Genie Space Recommendations
 *
 * Uses the Genie Engine to generate production-grade Genie Space
 * recommendations with full knowledge stores, benchmarks, and metric
 * view proposals. Falls back to the legacy generator if the engine fails.
 */

import type { PipelineContext } from "@/lib/domain/types";
import { runGenieEngine } from "@/lib/genie/engine";
import { generateGenieRecommendations } from "@/lib/genie/recommend";
import { saveGenieRecommendations } from "@/lib/lakebase/genie-recommendations";
import { getGenieEngineConfig } from "@/lib/lakebase/genie-engine-config";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import { logger as fallbackLogger } from "@/lib/logger";

export async function runGenieRecommendations(
  ctx: PipelineContext,
  runId: string,
  onProgress?: (
    message: string,
    percent: number,
    completedDomains: number,
    totalDomains: number,
    completedDomainName?: string,
  ) => void,
  onDomainsReady?: (domains: Array<{ domain: string; tables: number }>) => void,
  onDomainPhase?: (domain: string, phase: import("@/lib/genie/engine-status").DomainPhase) => void,
): Promise<number> {
  const log = ctx.logger ?? fallbackLogger;
  const metadata = ctx.metadata ?? (await loadMetadataForRun(runId));
  if (!metadata) {
    log.warn("Skipping Genie recommendations: no metadata snapshot available", {
      fn: "runGenieRecommendations",
      errorCategory: "data",
      runId,
    });
    return 0;
  }

  if (ctx.useCases.length === 0) {
    log.warn("Skipping Genie recommendations: no use cases available", {
      fn: "runGenieRecommendations",
      errorCategory: "data",
      runId,
    });
    return 0;
  }

  try {
    // Load engine config (defaults if none saved)
    const { config, version } = await getGenieEngineConfig(runId);

    const result = await runGenieEngine({
      run: ctx.run,
      useCases: ctx.useCases,
      metadata,
      config,
      sampleData: ctx.sampleData,
      existingSpaces: ctx.discoveryResult?.genieSpaces,
      onProgress,
      onDomainsReady,
      onDomainPhase,
    });

    await saveGenieRecommendations(runId, result.recommendations, result.passOutputs, version);

    log.info("Genie Engine recommendations generated and persisted", {
      runId,
      recommendationCount: result.recommendations.length,
      domains: result.recommendations.map((r) => r.domain),
      engineConfigVersion: version,
    });

    return result.recommendations.length;
  } catch (err) {
    // Fallback to legacy generator
    log.warn("Genie Engine failed, falling back to legacy generator", {
      fn: "runGenieRecommendations",
      errorCategory: "llm_error",
      runId,
      error: err instanceof Error ? err.message : String(err),
    });

    const { config: fallbackConfig } = await getGenieEngineConfig(runId);
    const recommendations = generateGenieRecommendations(
      ctx.run,
      ctx.useCases,
      metadata,
      fallbackConfig.questionComplexity,
    );

    await saveGenieRecommendations(runId, recommendations);

    log.info("Legacy Genie recommendations generated (fallback)", {
      fn: "runGenieRecommendations",
      recommendationCount: recommendations.length,
    });

    return recommendations.length;
  }
}

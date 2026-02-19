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
import { logger } from "@/lib/logger";

export async function runGenieRecommendations(
  ctx: PipelineContext,
  runId: string
): Promise<number> {
  const metadata = ctx.metadata ?? (await loadMetadataForRun(runId));
  if (!metadata) {
    logger.warn("Skipping Genie recommendations: no metadata snapshot available", { runId });
    return 0;
  }

  if (ctx.useCases.length === 0) {
    logger.warn("Skipping Genie recommendations: no use cases available", { runId });
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
    });

    await saveGenieRecommendations(runId, result.recommendations, result.passOutputs, version);

    logger.info("Genie Engine recommendations generated and persisted", {
      runId,
      recommendationCount: result.recommendations.length,
      domains: result.recommendations.map((r) => r.domain),
      engineConfigVersion: version,
    });

    return result.recommendations.length;
  } catch (err) {
    // Fallback to legacy generator
    logger.warn("Genie Engine failed, falling back to legacy generator", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });

    const recommendations = generateGenieRecommendations(
      ctx.run,
      ctx.useCases,
      metadata
    );

    await saveGenieRecommendations(runId, recommendations);

    logger.info("Legacy Genie recommendations generated (fallback)", {
      runId,
      recommendationCount: recommendations.length,
    });

    return recommendations.length;
  }
}

/**
 * Pipeline Step: Dashboard Recommendations
 *
 * Uses the Dashboard Engine to generate AI/BI (Lakeview) dashboard
 * recommendations per domain. Runs as a background task after pipeline
 * completion, alongside the Genie Engine.
 */

import type { PipelineContext } from "@/lib/domain/types";
import { runDashboardEngine } from "@/lib/dashboard/engine";
import { saveDashboardRecommendations } from "@/lib/lakebase/dashboard-recommendations";
import { getGenieRecommendationsByRunId } from "@/lib/lakebase/genie-recommendations";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import { logger } from "@/lib/logger";

export async function runDashboardRecommendations(
  ctx: PipelineContext,
  runId: string,
  onProgress?: (message: string, percent: number) => void,
): Promise<number> {
  const metadata = ctx.metadata ?? (await loadMetadataForRun(runId));
  if (!metadata) {
    logger.warn("Skipping dashboard recommendations: no metadata snapshot available", { runId });
    return 0;
  }

  if (ctx.useCases.length === 0) {
    logger.warn("Skipping dashboard recommendations: no use cases available", { runId });
    return 0;
  }

  try {
    // Load Genie recommendations to enrich dashboard design (if available)
    let genieRecommendations;
    try {
      genieRecommendations = await getGenieRecommendationsByRunId(runId);
    } catch {
      logger.info("No Genie recommendations available for dashboard enrichment", { runId });
    }

    const result = await runDashboardEngine({
      run: ctx.run,
      useCases: ctx.useCases,
      metadata,
      genieRecommendations,
      existingDashboards: ctx.discoveryResult?.dashboards,
      onProgress,
    });

    await saveDashboardRecommendations(runId, result.recommendations);

    logger.info("Dashboard recommendations generated and persisted", {
      runId,
      recommendationCount: result.recommendations.length,
      domains: result.recommendations.map((r) => r.domain),
    });

    return result.recommendations.length;
  } catch (err) {
    logger.error("Dashboard Engine failed", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

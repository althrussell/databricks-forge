/**
 * Pipeline Step 8: Genie Space Recommendations
 *
 * Generates Genie Space recommendations from the pipeline context:
 * - Uses scored & clustered use cases (with SQL) to inform the spaces
 * - Uses metadata snapshot for table details, FKs, and metric views
 * - Uses business context for text instructions
 * - Persists recommendations to Lakebase for immediate UI access
 */

import type { PipelineContext } from "@/lib/domain/types";
import { generateGenieRecommendations } from "@/lib/genie/recommend";
import { saveGenieRecommendations } from "@/lib/lakebase/genie-recommendations";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import { logger } from "@/lib/logger";

export async function runGenieRecommendations(
  ctx: PipelineContext,
  runId: string
): Promise<number> {
  // Metadata is required for table details, FKs, and metric views
  const metadata = ctx.metadata ?? (await loadMetadataForRun(runId));
  if (!metadata) {
    logger.warn("Skipping Genie recommendations: no metadata snapshot available", { runId });
    return 0;
  }

  if (ctx.useCases.length === 0) {
    logger.warn("Skipping Genie recommendations: no use cases available", { runId });
    return 0;
  }

  // Generate recommendations using the full pipeline context
  const recommendations = generateGenieRecommendations(
    ctx.run,
    ctx.useCases,
    metadata
  );

  // Persist to Lakebase
  await saveGenieRecommendations(runId, recommendations);

  logger.info("Genie recommendations generated and persisted", {
    runId,
    recommendationCount: recommendations.length,
    domains: recommendations.map((r) => r.domain),
  });

  return recommendations.length;
}

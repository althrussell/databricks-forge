/**
 * API: /api/genie-spaces/[spaceId]/health
 *
 * GET -- Run a deterministic health check on a Genie Space and return the report.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGenieSpace } from "@/lib/dbx/genie";
import { runHealthCheck } from "@/lib/genie/space-health-check";
import { getHealthCheckConfig, saveHealthScore } from "@/lib/lakebase/space-health";
import { getSpaceCache, setSpaceCache } from "@/lib/genie/space-cache";
import { isSafeId } from "@/lib/validation";
import { logger } from "@/lib/logger";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    if (!isSafeId(spaceId)) {
      return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
    }

    let serializedSpace: string;

    const cached = getSpaceCache(spaceId);
    if (cached) {
      serializedSpace = cached;
    } else {
      const spaceResponse = await getGenieSpace(spaceId);
      serializedSpace = spaceResponse.serialized_space ?? "{}";
      setSpaceCache(spaceId, serializedSpace);
    }

    const space = JSON.parse(serializedSpace);

    const config = await getHealthCheckConfig().catch(() => ({
      overrides: [],
      customChecks: [],
      categoryWeights: null,
    }));

    const report = runHealthCheck(
      space,
      config.overrides.length > 0 ? config.overrides : undefined,
      config.customChecks.length > 0 ? config.customChecks : undefined,
      config.categoryWeights ?? undefined,
    );

    // Best-effort persist the score for trending
    saveHealthScore(spaceId, report, "manual").catch((err) => {
      logger.warn({ spaceId, error: String(err) }, "Failed to persist health score");
    });

    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: message }, "Health check failed");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

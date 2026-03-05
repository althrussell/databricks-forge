/**
 * API: /api/genie-spaces/[spaceId]/detail
 *
 * GET -- Returns the full space detail: serialized_space, parsed metadata,
 *        health report, and tracking info, in one call. Used by the space
 *        detail page to avoid multiple round-trips.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGenieSpace } from "@/lib/dbx/genie";
import { runHealthCheck } from "@/lib/genie/space-health-check";
import { getHealthCheckConfig } from "@/lib/lakebase/space-health";
import { getSpaceCache, setSpaceCache } from "@/lib/genie/space-cache";
import { getTrackedBySpaceId } from "@/lib/lakebase/genie-spaces";
import { extractSpaceMetadata, parseSerializedSpace } from "@/lib/genie/space-metadata";
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

    // Fetch space detail (OBO auth) and tracking info in parallel
    let serializedSpace = getSpaceCache(spaceId);
    let title = "";
    let description = "";

    if (!serializedSpace) {
      const spaceResponse = await getGenieSpace(spaceId);
      serializedSpace = spaceResponse.serialized_space ?? "{}";
      title = spaceResponse.title ?? "";
      description = spaceResponse.description ?? "";
      setSpaceCache(spaceId, serializedSpace);
    } else {
      // Still need basic info -- fetch without serialized_space
      try {
        const spaceResponse = await getGenieSpace(spaceId);
        title = spaceResponse.title ?? "";
        description = spaceResponse.description ?? "";
      } catch {
        // Use cached space only
      }
    }

    const [tracked, healthConfig] = await Promise.all([
      getTrackedBySpaceId(spaceId).catch(() => null),
      getHealthCheckConfig().catch(() => ({
        overrides: [],
        customChecks: [],
        categoryWeights: null,
      })),
    ]);

    const metadata = extractSpaceMetadata(serializedSpace);

    const parsed = parseSerializedSpace(serializedSpace);
    let healthReport = null;
    if (parsed) {
      healthReport = runHealthCheck(
        parsed,
        healthConfig.overrides.length > 0 ? healthConfig.overrides : undefined,
        healthConfig.customChecks.length > 0 ? healthConfig.customChecks : undefined,
        healthConfig.categoryWeights ?? undefined,
      );
    }

    return NextResponse.json({
      spaceId,
      title: tracked?.title ?? title,
      description,
      domain: tracked?.domain ?? null,
      runId: tracked?.runId ?? null,
      status: tracked?.status ?? "active",
      source: tracked ? "pipeline" : "workspace",
      serializedSpace,
      metadata,
      healthReport,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Space detail fetch failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

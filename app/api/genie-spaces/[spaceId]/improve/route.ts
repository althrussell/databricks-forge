/**
 * API: /api/genie-spaces/[spaceId]/improve
 *
 * POST -- Start a full Genie Engine improvement run for an existing space.
 *         Extracts tables from the current serialized_space and runs the
 *         ad-hoc engine in full mode asynchronously.
 *
 * GET  -- Poll improvement status for a space.
 *
 * DELETE -- Cancel a running improvement job.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGenieSpace, sanitizeSerializedSpace } from "@/lib/dbx/genie";
import { runAdHocGenieEngine, type AdHocGenieConfig } from "@/lib/genie/adhoc-engine";
import { getSpaceCache, setSpaceCache } from "@/lib/genie/space-cache";
import { parseSerializedSpace } from "@/lib/genie/space-metadata";
import {
  startImproveJob,
  getImproveJob,
  updateImproveJob,
  completeImproveJob,
  failImproveJob,
  cancelImproveJob,
  dismissImproveJob,
  computeImproveStats,
  computeImproveChanges,
} from "@/lib/genie/improve-jobs";
import { isSafeId } from "@/lib/validation";
import { logger } from "@/lib/logger";
import { safeErrorMessage } from "@/lib/error-utils";
import type { GenieSpaceRecommendation } from "@/lib/genie/types";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    if (!isSafeId(spaceId)) {
      return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
    }

    const existing = getImproveJob(spaceId);
    if (existing && existing.status === "generating") {
      return NextResponse.json(
        { error: "An improvement is already running for this space" },
        { status: 409 },
      );
    }

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
      try {
        const spaceResponse = await getGenieSpace(spaceId);
        title = spaceResponse.title ?? "";
        description = spaceResponse.description ?? "";
      } catch {
        // proceed with cached space
      }
    }

    const parsed = parseSerializedSpace(serializedSpace);
    if (!parsed) {
      return NextResponse.json({ error: "Cannot parse space configuration" }, { status: 400 });
    }

    const tables = parsed.data_sources?.tables?.map((t) => t.identifier).filter(Boolean) ?? [];
    if (tables.length === 0) {
      return NextResponse.json({ error: "Space has no tables to improve" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const userConfig = (body as { config?: Partial<AdHocGenieConfig> }).config;

    const controller = startImproveJob(spaceId);

    const config: AdHocGenieConfig = {
      mode: "full",
      title,
      description,
      generateBenchmarks: true,
      generateTrustedAssets: true,
      ...userConfig,
    };

    logger.info("Starting Genie Engine improvement", {
      spaceId,
      tableCount: tables.length,
      title,
    });

    runAdHocGenieEngine({
      tables,
      config,
      signal: controller.signal,
      onProgress: (message, percent) => {
        updateImproveJob(spaceId, message, percent);
      },
    })
      .then((engineResult) => {
        const newSerializedSpace = sanitizeSerializedSpace(
          engineResult.recommendation.serializedSpace,
        );

        const statsBefore = computeImproveStats(serializedSpace!);
        const statsAfter = computeImproveStats(newSerializedSpace);
        const changes = computeImproveChanges(statsBefore, statsAfter);

        const recommendation: GenieSpaceRecommendation = {
          ...engineResult.recommendation,
          serializedSpace: newSerializedSpace,
        };

        completeImproveJob(spaceId, {
          recommendation,
          originalSerializedSpace: serializedSpace!,
          changes,
          statsBefore,
          statsAfter,
        });

        logger.info("Genie Engine improvement completed", {
          spaceId,
          changeCount: changes.length,
        });
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("Genie Engine improvement failed", { spaceId, error: msg });
        failImproveJob(spaceId, msg);
      });

    return NextResponse.json({ spaceId, status: "generating" });
  } catch (error) {
    logger.error("Improve endpoint error", { error: safeErrorMessage(error) });
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    if (!isSafeId(spaceId)) {
      return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
    }

    const job = getImproveJob(spaceId);
    if (!job) {
      return NextResponse.json({ status: "idle" });
    }

    return NextResponse.json({
      spaceId: job.spaceId,
      status: job.status,
      message: job.message,
      percent: job.percent,
      error: job.error,
      result: job.status === "completed" ? job.result : null,
    });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ spaceId: string }> },
) {
  try {
    const { spaceId } = await params;
    if (!isSafeId(spaceId)) {
      return NextResponse.json({ error: "Invalid spaceId" }, { status: 400 });
    }

    const action = request.nextUrl.searchParams.get("action");

    if (action === "dismiss") {
      dismissImproveJob(spaceId);
      return NextResponse.json({ spaceId, status: "dismissed" });
    }

    cancelImproveJob(spaceId);
    return NextResponse.json({ spaceId, status: "cancelled" });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

/**
 * API: /api/metric-views/[id]/deploy
 *
 * POST -- Deploy a single metric view proposal to Unity Catalog.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import {
  getMetricViewProposalById,
  updateDeploymentStatus,
} from "@/lib/lakebase/metric-view-proposals";
import { deployAsset } from "@/lib/genie/deploy";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      targetSchema?: string;
      resourcePrefix?: string;
    };

    const proposal = await getMetricViewProposalById(id);
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    if (proposal.validationStatus === "error") {
      return NextResponse.json(
        {
          error: "Cannot deploy a metric view with validation errors",
          issues: proposal.validationIssues,
        },
        { status: 400 },
      );
    }

    const derivedSchema = body.targetSchema ?? proposal.schemaScope;
    const result = await deployAsset(
      { name: proposal.name, ddl: proposal.ddl },
      derivedSchema,
      body.resourcePrefix,
    );

    if (result.deployed) {
      await updateDeploymentStatus(id, "deployed", result.fqn);
      logger.info("Metric view proposal deployed", { id, fqn: result.fqn });

      return NextResponse.json({
        deployed: true,
        fqn: result.fqn,
      });
    } else {
      await updateDeploymentStatus(id, "failed");
      logger.warn("Metric view proposal deployment failed", { id, error: result.error });

      return NextResponse.json({ deployed: false, error: result.error }, { status: 422 });
    }
  } catch (err) {
    logger.error("Metric view deploy endpoint error", { error: safeErrorMessage(err) });
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

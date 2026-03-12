/**
 * API: /api/genie-spaces
 *
 * GET  -- List Genie spaces from the workspace + local tracking data.
 *         With ?deployJobId=... : poll deploy job status.
 * POST -- Create a new Genie space (fire-and-forget with polling).
 *         Returns { jobId } immediately; client polls GET ?deployJobId=...
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import { listGenieSpaces, createGenieSpace } from "@/lib/dbx/genie";
import { listTrackedGenieSpaces, trackGenieSpaceCreated } from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";
import { safeErrorMessage } from "@/lib/error-utils";
import type { GenieAuthMode } from "@/lib/settings";
import { revalidateSerializedSpace } from "@/lib/genie/deploy-validation";
import { validateFqn } from "@/lib/validation";
import {
  deployMetricViews,
  patchSpaceWithMetricViews,
  type MetricViewDeployResult,
} from "@/lib/genie/deploy";

// ---------------------------------------------------------------------------
// Deploy job tracker (in-memory, same pattern as generate route)
// ---------------------------------------------------------------------------

interface DeployJobStatus {
  jobId: string;
  status: "deploying" | "completed" | "failed";
  message: string;
  startedAt: number;
  completedAt: number | null;
  result: {
    spaceId: string;
    title: string;
    trackingId: string;
    metricViewResults?: MetricViewDeployResult[];
  } | null;
  error: string | null;
}

const deployJobs = new Map<string, DeployJobStatus>();
const DEPLOY_JOB_TTL_MS = 30 * 60 * 1000;

function evictStaleDeployJobs(): void {
  const now = Date.now();
  for (const [id, job] of deployJobs) {
    if (job.completedAt && now - job.completedAt > DEPLOY_JOB_TTL_MS) {
      deployJobs.delete(id);
    } else if (!job.completedAt && now - job.startedAt > DEPLOY_JOB_TTL_MS * 2) {
      deployJobs.delete(id);
    }
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const deployJobId = request.nextUrl.searchParams.get("deployJobId");

  // Poll deploy job status
  if (deployJobId) {
    evictStaleDeployJobs();
    const job = deployJobs.get(deployJobId);
    if (!job) {
      return NextResponse.json({ error: "Deploy job not found or expired" }, { status: 404 });
    }
    return NextResponse.json({
      jobId: job.jobId,
      status: job.status,
      message: job.message,
      result: job.result,
      error: job.error,
    });
  }

  // Default: list all spaces (iterate all Databricks API pages)
  try {
    const fetchAllSpaces = async () => {
      const allSpaces: Awaited<ReturnType<typeof listGenieSpaces>>["spaces"] = [];
      let pageToken: string | undefined;
      do {
        const page = await listGenieSpaces(100, pageToken);
        allSpaces.push(...(page.spaces ?? []));
        pageToken = page.next_page_token;
      } while (pageToken);
      return allSpaces;
    };

    const [allSpaces, tracked] = await Promise.all([
      fetchAllSpaces().catch(() => [] as Awaited<ReturnType<typeof listGenieSpaces>>["spaces"]),
      listTrackedGenieSpaces().catch(() => []),
    ]);

    const workspaceIds = new Set(allSpaces.map((s) => s.space_id));
    const liveTracked = tracked.filter(
      (t) => t.status === "trashed" || workspaceIds.has(t.spaceId),
    );
    const staleCount = tracked.length - liveTracked.length;

    if (staleCount > 0) {
      logger.info("[genie-spaces] Filtered stale tracked spaces", {
        staleCount,
        staleIds: tracked
          .filter((t) => t.status !== "trashed" && !workspaceIds.has(t.spaceId))
          .map((t) => t.spaceId),
      });
    }

    return NextResponse.json(
      {
        spaces: allSpaces,
        tracked: liveTracked,
        staleCount,
      },
      {
        headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST handler (fire-and-forget)
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      title,
      description,
      serializedSpace,
      runId,
      domain,
      parentPath,
      authMode,
      quality,
      targetSchema,
      metricViews,
      resourcePrefix,
    } = body as {
      title: string;
      description: string;
      serializedSpace: string;
      runId?: string;
      domain: string;
      parentPath?: string;
      authMode?: GenieAuthMode;
      quality?: {
        gateDecision?: "allow" | "warn" | "block";
        promptVersion?: string;
      };
      targetSchema?: string;
      metricViews?: Array<{ name: string; ddl: string; description?: string }>;
      resourcePrefix?: string;
    };

    if (!title || !serializedSpace || !domain) {
      return NextResponse.json(
        { error: "Missing required fields: title, serializedSpace, domain" },
        { status: 400 },
      );
    }

    // Validate targetSchema format synchronously if provided
    if (targetSchema) {
      if (targetSchema.split(".").length !== 2) {
        return NextResponse.json(
          { error: "targetSchema must be in catalog.schema format" },
          { status: 400 },
        );
      }
      try {
        validateFqn(targetSchema, "targetSchema");
      } catch {
        return NextResponse.json(
          { error: "targetSchema contains invalid characters" },
          { status: 400 },
        );
      }
    }

    // Fire-and-forget: return jobId immediately, run deploy in background
    const jobId = uuidv4();

    deployJobs.set(jobId, {
      jobId,
      status: "deploying",
      message: "Starting deployment...",
      startedAt: Date.now(),
      completedAt: null,
      result: null,
      error: null,
    });

    runDeploy(jobId, {
      title,
      description,
      serializedSpace,
      runId,
      domain,
      parentPath,
      authMode,
      quality,
      targetSchema,
      metricViews,
      resourcePrefix,
    }).catch((err) => {
      const job = deployJobs.get(jobId);
      if (job && job.status === "deploying") {
        job.status = "failed";
        job.message = "Deployment failed";
        job.error = safeErrorMessage(err);
        job.completedAt = Date.now();
      }
    });

    return NextResponse.json({ jobId, status: "deploying" });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Background deploy logic
// ---------------------------------------------------------------------------

async function runDeploy(
  jobId: string,
  params: {
    title: string;
    description: string;
    serializedSpace: string;
    runId?: string;
    domain: string;
    parentPath?: string;
    authMode?: GenieAuthMode;
    quality?: { gateDecision?: "allow" | "warn" | "block"; promptVersion?: string };
    targetSchema?: string;
    metricViews?: Array<{ name: string; ddl: string; description?: string }>;
    resourcePrefix?: string;
  },
): Promise<void> {
  const job = deployJobs.get(jobId);
  if (!job) return;

  // Step 1: Validate serialized space
  job.message = "Validating space configuration...";
  const validation = await revalidateSerializedSpace(params.serializedSpace);
  if (!validation.ok) {
    job.status = "failed";
    job.message = "Validation failed";
    job.error = validation.error;
    job.completedAt = Date.now();
    return;
  }

  // Step 2: Deploy metric views if provided
  let finalSerializedSpace = params.serializedSpace;
  const deployedMvFqns: string[] = [];
  let mvResults: MetricViewDeployResult[] = [];

  if (params.metricViews && params.metricViews.length > 0 && params.targetSchema) {
    job.message = `Deploying ${params.metricViews.length} metric view${params.metricViews.length !== 1 ? "s" : ""}...`;
    const mvDeploy = await deployMetricViews(
      params.metricViews,
      params.targetSchema,
      params.resourcePrefix,
    );
    mvResults = mvDeploy.results;
    deployedMvFqns.push(...mvDeploy.deployedFqns);
    finalSerializedSpace = patchSpaceWithMetricViews(params.serializedSpace, deployedMvFqns);
  }

  // Step 3: Create the Genie Space
  job.message = "Creating Genie Space in Databricks...";
  const config = getConfig();
  const result = await createGenieSpace({
    title: params.title,
    description: params.description || "",
    serializedSpace: finalSerializedSpace,
    warehouseId: config.warehouseId,
    parentPath: params.parentPath,
    authMode: params.authMode,
  });

  // Step 4: Track in Lakebase
  job.message = "Tracking space...";
  const trackingId = uuidv4();
  await trackGenieSpaceCreated(
    trackingId,
    result.space_id,
    params.runId ?? null,
    params.domain,
    params.title,
    {
      functions: [],
      metricViews: deployedMvFqns,
      metadata: {
        promptVersion: params.quality?.promptVersion ?? "genie-v2",
        gateDecision: params.quality?.gateDecision ?? "allow",
      },
    },
    params.authMode,
  );

  logger.info("Genie space created successfully", {
    spaceId: result.space_id,
    runId: params.runId,
    domain: params.domain,
    title: params.title,
    metricViewsDeployed: deployedMvFqns.length,
  });

  // Mark complete
  job.status = "completed";
  job.message = "Deployment complete";
  job.completedAt = Date.now();
  job.result = {
    spaceId: result.space_id,
    title: result.title,
    trackingId,
    metricViewResults: mvResults.length > 0 ? mvResults : undefined,
  };
}

/**
 * API: /api/runs/[runId]/genie-deploy
 *
 * POST -- Orchestrates the full Genie deployment flow:
 *   1. Validate pre-existing metric views from metadata
 *   2. Rewrite metric view / function DDLs to the chosen target schema
 *   3. Execute each DDL (with auto-fix for common errors)
 *   4. Prepare a clean serializedSpace: strip undeployed/failed refs, add deployed FQNs
 *   5. Create or update Genie spaces via the Databricks API
 *   6. Track each space in Lakebase
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import { createGenieSpace, updateGenieSpace } from "@/lib/dbx/genie";
import {
  trackGenieSpaceCreated,
  trackGenieSpaceUpdated as trackSpaceUpdated,
} from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";
import { isSafeId, validateFqn } from "@/lib/validation";
import type { GenieAuthMode } from "@/lib/settings";
import {
  type DeployAsset,
  type AssetResult,
  type StrippedRef,
  deployAsset,
  validatePreExistingMetricViews,
  prepareSerializedSpace,
  validateFinalSpace,
  normalizeIdentifiersToFqn,
  extractPreExistingMvFqns,
} from "@/lib/genie/deploy";

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

interface DomainDeployRequest {
  domain: string;
  title: string;
  description: string;
  serializedSpace: string;
  metricViews: DeployAsset[];
  existingSpaceId?: string;
}

interface RequestBody {
  domains: DomainDeployRequest[];
  targetSchema: string; // "catalog.schema"
  authMode?: GenieAuthMode;
}

interface DomainResult {
  domain: string;
  assets: AssetResult[];
  spaceId?: string;
  spaceError?: string;
  orphanedAssets?: { metricViews: string[] };
  patchedSpace?: string;
  strippedRefs?: StrippedRef[];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  if (!isSafeId(runId)) {
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as RequestBody;

    if (!body.domains || !Array.isArray(body.domains) || body.domains.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: domains" },
        { status: 400 }
      );
    }

    if (!body.targetSchema || body.targetSchema.split(".").length !== 2) {
      return NextResponse.json(
        { error: "targetSchema must be in catalog.schema format" },
        { status: 400 }
      );
    }

    try {
      validateFqn(body.targetSchema, "targetSchema");
    } catch {
      return NextResponse.json(
        { error: "targetSchema contains invalid characters" },
        { status: 400 }
      );
    }

    const config = getConfig();
    const results: DomainResult[] = [];

    for (const domainReq of body.domains) {
      const assets: AssetResult[] = [];
      const deployedMvs: { fqn: string; description?: string }[] = [];

      // 1. Deploy metric views (with auto-fix)
      for (const mv of domainReq.metricViews) {
        const result = await deployAsset(mv, body.targetSchema);
        assets.push(result);
        if (result.deployed) {
          deployedMvs.push({ fqn: result.fqn, description: mv.description });
          logger.info("Metric view deployed", { runId, domain: domainReq.domain, fqn: result.fqn });
        }
      }

      // 2. Validate pre-existing metric views from the serialized space.
      //    Only validate identifiers that are already FQNs (3-part names). Bare names
      //    come from the assembler (first deploy) and haven't been created yet —
      //    validating them produces spurious failures.
      const isFqn = (id: string) => id.replace(/`/g, "").split(".").length >= 3;

      const preExistingMvFqns = extractPreExistingMvFqns(domainReq.serializedSpace).filter(isFqn);

      const { valid: validPreExistingMvs, stripped: mvValidationStripped } =
        await validatePreExistingMetricViews(preExistingMvFqns);

      // 3. Prepare a clean serialized space (strip undeployed, add deployed FQNs)
      const { json: preparedSpace, strippedRefs } = prepareSerializedSpace(
        domainReq.serializedSpace,
        deployedMvs,
        validPreExistingMvs,
      );

      // 4. Final existence check — verify every reference in the space is real
      const { json: validatedSpace, stripped: finalStripped } =
        await validateFinalSpace(preparedSpace);

      // 4b. Normalize all identifiers to 3-part FQNs — Genie API requires
      // fully-qualified catalog.schema.object names for functions and metric views.
      const finalSpace = normalizeIdentifiersToFqn(validatedSpace, body.targetSchema);

      const allStripped = [
        ...mvValidationStripped,
        ...strippedRefs,
        ...finalStripped,
      ];

      if (allStripped.length > 0) {
        logger.info("Stripped references from serialized space", {
          domain: domainReq.domain,
          stripped: allStripped.map((s) => `${s.type}:${s.identifier}`),
        });
      }

      // 5. Create or update Genie space
      const deployedAssetsPayload = {
        functions: [] as string[],
        metricViews: deployedMvs.map((m) => m.fqn),
      };

      try {
        let spaceId: string;

        if (domainReq.existingSpaceId) {
          const result = await updateGenieSpace(domainReq.existingSpaceId, {
            serializedSpace: finalSpace,
            authMode: body.authMode,
          });
          spaceId = result.space_id;
          try {
            await trackSpaceUpdated(spaceId, undefined, deployedAssetsPayload);
          } catch (trackErr) {
            logger.error("Lakebase tracking failed after space update (space exists in Genie)", {
              spaceId,
              domain: domainReq.domain,
              error: trackErr instanceof Error ? trackErr.message : String(trackErr),
            });
            try {
              await trackSpaceUpdated(spaceId, undefined, deployedAssetsPayload);
            } catch { /* exhausted retry */ }
          }
          logger.info("Genie space updated", {
            runId, domain: domainReq.domain, spaceId,
          });
        } else {
          const result = await createGenieSpace({
            title: domainReq.title,
            description: domainReq.description || "",
            serializedSpace: finalSpace,
            warehouseId: config.warehouseId,
            authMode: body.authMode,
          });
          spaceId = result.space_id;

          const trackingId = uuidv4();
          try {
            await trackGenieSpaceCreated(
              trackingId,
              spaceId,
              runId,
              domainReq.domain,
              domainReq.title,
              deployedAssetsPayload,
              body.authMode,
            );
          } catch (trackErr) {
            logger.error("Lakebase tracking failed after space creation (space exists in Genie)", {
              spaceId,
              domain: domainReq.domain,
              error: trackErr instanceof Error ? trackErr.message : String(trackErr),
            });
            try {
              await trackGenieSpaceCreated(
                trackingId, spaceId, runId, domainReq.domain, domainReq.title, deployedAssetsPayload, body.authMode,
              );
            } catch { /* exhausted retry */ }
          }
        }

        results.push({
          domain: domainReq.domain,
          assets,
          spaceId,
          patchedSpace: finalSpace,
          strippedRefs: allStripped.length > 0 ? allStripped : undefined,
        });

        logger.info("Genie space deployed", {
          runId,
          domain: domainReq.domain,
          spaceId,
          metricViews: deployedMvs.length,
          strippedRefs: allStripped.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const orphanedAssets = {
          metricViews: deployedMvs.map((m) => m.fqn),
        };
        if (orphanedAssets.metricViews.length > 0) {
          logger.warn("Genie space creation failed -- UC assets deployed but not attached to any space", {
            domain: domainReq.domain,
            orphanedAssets,
          });
        }
        results.push({
          domain: domainReq.domain,
          assets,
          spaceError: msg,
          orphanedAssets: orphanedAssets.metricViews.length > 0
            ? orphanedAssets : undefined,
          patchedSpace: finalSpace,
          strippedRefs: allStripped.length > 0 ? allStripped : undefined,
        });
        logger.error("Genie space creation failed during deploy", {
          domain: domainReq.domain,
          error: msg,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Genie deploy failed", { error: message });
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}



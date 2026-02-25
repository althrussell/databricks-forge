/**
 * API: /api/genie-spaces/[spaceId]/trash-preview
 *
 * GET -- Returns the deployed assets for a space, partitioned into
 *        "safe to delete" and "shared with other spaces".  The UI uses
 *        this to build a confirmation dialog before trashing.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDeployedAssets,
  findSpacesReferencingAssets,
} from "@/lib/lakebase/genie-spaces";
import { isSafeId } from "@/lib/validation";

interface SharedAsset {
  fqn: string;
  usedBy: string[];
}

interface TrashPreviewResponse {
  assets: { functions: string[]; metricViews: string[] };
  shared: { functions: SharedAsset[]; metricViews: SharedAsset[] };
  safeToDelete: { functions: string[]; metricViews: string[] };
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

    const assets = await getDeployedAssets(spaceId);
    if (!assets) {
      return NextResponse.json({
        assets: { functions: [], metricViews: [] },
        shared: { functions: [], metricViews: [] },
        safeToDelete: { functions: [], metricViews: [] },
      } satisfies TrashPreviewResponse);
    }

    const allFqns = [...assets.functions, ...assets.metricViews];
    const sharedMap = await findSpacesReferencingAssets(allFqns, spaceId);

    const sharedFns: SharedAsset[] = [];
    const sharedMvs: SharedAsset[] = [];
    const safeFns: string[] = [];
    const safeMvs: string[] = [];

    for (const fqn of assets.functions) {
      const usedBy = sharedMap.get(fqn);
      if (usedBy && usedBy.length > 0) {
        sharedFns.push({ fqn, usedBy });
      } else {
        safeFns.push(fqn);
      }
    }

    for (const fqn of assets.metricViews) {
      const usedBy = sharedMap.get(fqn);
      if (usedBy && usedBy.length > 0) {
        sharedMvs.push({ fqn, usedBy });
      } else {
        safeMvs.push(fqn);
      }
    }

    return NextResponse.json({
      assets,
      shared: { functions: sharedFns, metricViews: sharedMvs },
      safeToDelete: { functions: safeFns, metricViews: safeMvs },
    } satisfies TrashPreviewResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

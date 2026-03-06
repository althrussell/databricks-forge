/**
 * API: /api/metric-views
 *
 * GET  -- List metric view proposals (by runId or schemaScope query param)
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import {
  getMetricViewProposalsByRun,
  getMetricViewProposalsBySchema,
} from "@/lib/lakebase/metric-view-proposals";
import { isValidUUID } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId");
    const schemaScope = url.searchParams.get("schemaScope");

    if (runId) {
      if (!isValidUUID(runId)) {
        return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
      }
      const proposals = await getMetricViewProposalsByRun(runId);
      return NextResponse.json({ proposals });
    }

    if (schemaScope) {
      const proposals = await getMetricViewProposalsBySchema(schemaScope);
      return NextResponse.json({ proposals });
    }

    return NextResponse.json(
      { error: "Provide either runId or schemaScope query parameter" },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

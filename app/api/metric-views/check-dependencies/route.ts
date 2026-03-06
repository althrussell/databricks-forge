/**
 * API: /api/metric-views/check-dependencies
 *
 * POST -- Read-only check for metric view dependencies.
 *         Accepts either explicit FQNs or a runId+domain pair (to look up
 *         proposals that should exist).  Returns which are deployed and which
 *         are missing, along with proposal metadata the frontend needs to
 *         offer deployment.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import { checkMetricViewDependencies } from "@/lib/genie/metric-view-dependencies";
import { getMetricViewProposalsByRunDomain } from "@/lib/lakebase/metric-view-proposals";

interface RequestBody {
  fqns?: string[];
  runId?: string;
  domain?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;

    let fqnsToCheck: string[] = [];

    if (body.fqns && body.fqns.length > 0) {
      fqnsToCheck = body.fqns;
    } else if (body.runId && body.domain) {
      const proposals = await getMetricViewProposalsByRunDomain(body.runId, body.domain);
      const proposed = proposals.filter(
        (p) => p.deploymentStatus !== "deployed" && p.validationStatus !== "error" && p.ddl,
      );
      fqnsToCheck = proposed
        .map((p) => {
          const match = p.ddl.match(
            /VIEW\s+(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i,
          );
          return match ? match[1].replace(/`/g, "") : null;
        })
        .filter((fqn): fqn is string => fqn !== null);
    }

    if (fqnsToCheck.length === 0) {
      return NextResponse.json({ allDeployed: true, missing: [], deployed: [] });
    }

    const result = await checkMetricViewDependencies(fqnsToCheck);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

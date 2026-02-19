/**
 * API: /api/runs/[runId]/genie-engine/[domain]/functions
 *
 * POST -- Execute a trusted function (UDF) DDL statement to create the
 *         function in Unity Catalog.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/lib/dbx/sql";
import { getRunById } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; domain: string }> }
) {
  try {
    const { runId, domain } = await params;
    const decodedDomain = decodeURIComponent(domain);

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      ddl: string;
      name: string;
    };

    if (!body.ddl || !body.name) {
      return NextResponse.json(
        { error: "Missing required fields: ddl, name" },
        { status: 400 }
      );
    }

    if (
      !body.ddl.toUpperCase().includes("CREATE") ||
      !body.ddl.toUpperCase().includes("FUNCTION")
    ) {
      return NextResponse.json(
        { error: "DDL does not appear to be a valid function statement" },
        { status: 400 }
      );
    }

    await executeSQL(body.ddl);

    logger.info("Trusted function created via DDL", {
      runId,
      domain: decodedDomain,
      functionName: body.name,
    });

    return NextResponse.json({
      success: true,
      functionName: body.name,
      domain: decodedDomain,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Trusted function deployment failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

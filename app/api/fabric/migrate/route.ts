/**
 * API: /api/fabric/migrate
 *
 * POST -- start a new migration (step 1: Gold schema proposal)
 * GET  -- list migrations
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { runGoldSchemaStep } from "@/lib/fabric/migration-orchestrator";
import { getCurrentUserEmail } from "@/lib/dbx/client";
import { withPrisma } from "@/lib/prisma";

export async function GET() {
  try {
    await ensureMigrated();
    const migrations = await withPrisma(async (prisma) => {
      return prisma.forgeFabricMigration.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });
    return NextResponse.json(migrations);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list migrations" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureMigrated();
    const body = (await request.json()) as {
      scanId: string;
      targetCatalog: string;
      targetSchema: string;
    };

    if (!body.scanId || !body.targetCatalog || !body.targetSchema) {
      return NextResponse.json(
        { error: "scanId, targetCatalog, and targetSchema are required" },
        { status: 400 }
      );
    }

    const migrationId = randomUUID();
    const state = await runGoldSchemaStep(
      migrationId,
      body.scanId,
      body.targetCatalog,
      body.targetSchema
    );

    return NextResponse.json(state, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start migration" },
      { status: 500 }
    );
  }
}

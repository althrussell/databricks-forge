import { NextResponse } from "next/server";
import { isDemoModeEnabled } from "@/lib/demo/config";
import { runDataEngine } from "@/lib/demo/data-engine/engine";
import {
  startDataJob,
  completeDataJob,
  failDataJob,
  initTableList,
  updateTablePhase,
  updateDataJob,
} from "@/lib/demo/data-engine/engine-status";
import {
  getDemoSessionResearch,
  updateDemoSessionStatus,
} from "@/lib/lakebase/demo-sessions";
import { logActivity } from "@/lib/lakebase/activity-log";
import { logger } from "@/lib/logger";

export async function POST(request: Request) {
  if (!isDemoModeEnabled()) {
    return NextResponse.json({ error: "Demo mode is not enabled" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const {
      sessionId,
      catalog,
      schema,
      catalogCreated: _catalogCreated = false,
      targetRowCount = { min: 2000, max: 10000 },
    } = body as {
      sessionId: string;
      catalog: string;
      schema: string;
      catalogCreated?: boolean;
      targetRowCount?: { min: number; max: number };
    };

    if (!sessionId || !catalog || !schema) {
      return NextResponse.json(
        { error: "sessionId, catalog, and schema are required" },
        { status: 400 },
      );
    }

    const research = await getDemoSessionResearch(sessionId);
    if (!research) {
      return NextResponse.json(
        { error: "Research not found for session" },
        { status: 404 },
      );
    }

    await updateDemoSessionStatus(sessionId, "generating", {
      tablesJson: JSON.stringify([]),
    });

    const controller = await startDataJob(sessionId);

    // Fire-and-forget
    (async () => {
      try {
        const result = await runDataEngine({
          sessionId,
          research,
          catalog,
          schema,
          targetRowCount,
          signal: controller.signal,
          onProgress: (message, percent) => {
            updateDataJob(sessionId, message, percent);
          },
          onTablePhase: (tableName, phase) => {
            updateTablePhase(sessionId, tableName, phase);
          },
          onTablesReady: (tables) => {
            initTableList(
              sessionId,
              tables.map((t) => ({ tableName: t.name })),
            );
          },
        });

        const tableFqns = result.tables.map((t) => t.fqn);

        await updateDemoSessionStatus(sessionId, "completed", {
          dataModelJson: JSON.stringify(result.designs),
          tablesJson: JSON.stringify(tableFqns),
          tablesCreated: result.totalTables,
          totalRows: result.totalRows,
          durationMs: result.durationMs,
          completedAt: new Date(),
        });

        await completeDataJob(sessionId);
        await logActivity("demo_generate", {
          resourceId: sessionId,
          metadata: {
            catalog,
            schema,
            tables: result.totalTables,
            rows: result.totalRows,
            durationMs: result.durationMs,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("[demo/generate] Engine failed", { sessionId, error: msg });
        await failDataJob(sessionId, msg);
        await updateDemoSessionStatus(sessionId, "failed", { errorMessage: msg });
      }
    })();

    return NextResponse.json({ sessionId });
  } catch (err) {
    logger.error("[demo/generate] Request error", { error: String(err) });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

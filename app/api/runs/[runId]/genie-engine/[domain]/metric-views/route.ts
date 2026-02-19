/**
 * API: /api/runs/[runId]/genie-engine/[domain]/metric-views
 *
 * POST -- Execute a metric view DDL statement to create the metric view
 *         in Databricks, then add it to the domain's serialized space
 *         as a data source metric view.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/lib/dbx/sql";
import { getPrisma } from "@/lib/prisma";
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
      description?: string;
    };

    if (!body.ddl || !body.name) {
      return NextResponse.json(
        { error: "Missing required fields: ddl, name" },
        { status: 400 }
      );
    }

    if (!body.ddl.includes("WITH METRICS") || !body.ddl.includes("LANGUAGE YAML")) {
      return NextResponse.json(
        { error: "DDL does not appear to be a valid metric view statement" },
        { status: 400 }
      );
    }

    // Execute the DDL to create the metric view in Databricks
    await executeSQL(body.ddl);

    logger.info("Metric view created via DDL", {
      runId,
      domain: decodedDomain,
      metricViewName: body.name,
    });

    // Extract the FQN from the DDL (CREATE OR REPLACE VIEW catalog.schema.name)
    const fqnMatch = body.ddl.match(
      /VIEW\s+(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i
    );
    const metricViewFqn = fqnMatch
      ? fqnMatch[1].replace(/`/g, "")
      : body.name;

    // Add the metric view to the domain's serialized space
    const prisma = await getPrisma();
    const rec = await prisma.forgeGenieRecommendation.findFirst({
      where: { runId, domain: decodedDomain },
    });

    if (rec) {
      try {
        const space = JSON.parse(rec.serializedSpace) as Record<string, unknown>;
        const dataSources = space.data_sources as Record<string, unknown[]> | undefined;

        if (dataSources) {
          const metricViews = (dataSources.metric_views ?? []) as Array<{
            identifier: string;
            description?: string[];
          }>;

          const alreadyExists = metricViews.some(
            (mv) => mv.identifier.toLowerCase() === metricViewFqn.toLowerCase()
          );

          if (!alreadyExists) {
            metricViews.push({
              identifier: metricViewFqn,
              ...(body.description ? { description: [body.description] } : {}),
            });
            dataSources.metric_views = metricViews;

            const existingMvList: string[] = rec.metricViews
              ? (JSON.parse(rec.metricViews as string) as string[])
              : [];
            const updatedMvList = [...existingMvList, metricViewFqn];

            await prisma.forgeGenieRecommendation.update({
              where: { id: rec.id },
              data: {
                serializedSpace: JSON.stringify(space),
                metricViewCount: updatedMvList.length,
                metricViews: JSON.stringify(updatedMvList),
              },
            });

            logger.info("Metric view added to serialized space", {
              runId,
              domain: decodedDomain,
              metricViewFqn,
            });
          }
        }
      } catch (parseErr) {
        logger.warn("Failed to update serialized space with new metric view", {
          error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
      }
    }

    return NextResponse.json({
      success: true,
      metricViewFqn,
      domain: decodedDomain,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Metric view deployment failed", {
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

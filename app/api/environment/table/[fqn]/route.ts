/**
 * GET /api/environment/table/[fqn] -- Aggregated table detail.
 *
 * Returns all available information about a table across the latest scan:
 * table detail, columns, history, health, lineage, and related use cases.
 */

import { NextRequest } from "next/server";
import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fqn: string }> },
) {
  try {
    const { fqn: encodedFqn } = await params;
    const fqn = decodeURIComponent(encodedFqn);

    const data = await withPrisma(async (prisma) => {
      const detail = await prisma.forgeTableDetail.findFirst({
        where: { tableFqn: fqn },
        orderBy: { scan: { createdAt: "desc" } },
        include: { scan: true },
      });

      if (!detail) return null;

      const [history, lineageUp, lineageDown, insights, useCases] = await Promise.all([
        prisma.forgeTableHistorySummary.findFirst({
          where: { tableFqn: fqn, scanId: detail.scanId },
        }),
        prisma.forgeTableLineage.findMany({
          where: { targetTableFqn: fqn, scanId: detail.scanId },
        }),
        prisma.forgeTableLineage.findMany({
          where: { sourceTableFqn: fqn, scanId: detail.scanId },
        }),
        prisma.forgeTableInsight.findMany({
          where: { tableFqn: fqn, scanId: detail.scanId },
        }),
        prisma.forgeUseCase.findMany({
          where: {
            tablesInvolved: { contains: fqn },
          },
          orderBy: { overallScore: "desc" },
          take: 20,
        }),
      ]);

      const columns = detail.columnsJson ? JSON.parse(detail.columnsJson) : [];

      return {
        detail: {
          ...detail,
          sizeInBytes: detail.sizeInBytes?.toString() ?? null,
          numRows: detail.numRows?.toString() ?? null,
        },
        columns,
        history: history
          ? {
              ...history,
              lastWriteRows: history.lastWriteRows?.toString() ?? null,
              lastWriteBytes: history.lastWriteBytes?.toString() ?? null,
            }
          : null,
        lineage: {
          upstream: lineageUp,
          downstream: lineageDown,
        },
        insights,
        useCases: useCases.map((uc) => ({
          id: uc.id,
          name: uc.name,
          domain: uc.domain,
          type: uc.type,
          overallScore: uc.overallScore,
          runId: uc.runId,
        })),
        scanId: detail.scanId,
      };
    });

    if (!data) {
      return Response.json({ error: "Table not found" }, { status: 404 });
    }

    return Response.json(data);
  } catch (err) {
    logger.error("[api/environment/table] Error", { error: String(err) });
    return Response.json(
      { error: "Failed to load table detail" },
      { status: 500 },
    );
  }
}

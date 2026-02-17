/**
 * API: /api/runs/[runId]/usecases/[usecaseId]
 *
 * PATCH -- update a use case's name, statement, tablesInvolved, or user-adjusted scores.
 * Allows inline editing and score adjustment before export.
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidUUID } from "@/lib/validation";
import { getPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { computeOverallScore } from "@/lib/domain/scoring";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; usecaseId: string }> }
) {
  try {
    const { runId, usecaseId } = await params;

    if (!isValidUUID(runId) || !isValidUUID(usecaseId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const body = await request.json();
    const prisma = await getPrisma();

    const updateData: Record<string, unknown> = {};

    // Text field edits
    if (typeof body.name === "string" && body.name.trim()) {
      updateData.name = body.name.trim();
    }
    if (typeof body.statement === "string" && body.statement.trim()) {
      updateData.statement = body.statement.trim();
    }
    if (Array.isArray(body.tablesInvolved)) {
      updateData.tablesInvolved = JSON.stringify(body.tablesInvolved);
    }

    // User-adjusted scores (0-1 range, or null to reset)
    const scoreFields = [
      "userPriorityScore",
      "userFeasibilityScore",
      "userImpactScore",
      "userOverallScore",
    ] as const;

    for (const field of scoreFields) {
      if (field in body) {
        const val = body[field];
        if (val === null) {
          updateData[field] = null;
        } else if (typeof val === "number" && val >= 0 && val <= 1) {
          updateData[field] = Number(val.toFixed(3));
        }
      }
    }

    // If user adjusted dimension scores but not overall, auto-compute user overall
    if (body.resetScores === true) {
      updateData.userPriorityScore = null;
      updateData.userFeasibilityScore = null;
      updateData.userImpactScore = null;
      updateData.userOverallScore = null;
    } else if (
      ("userPriorityScore" in body ||
        "userFeasibilityScore" in body ||
        "userImpactScore" in body) &&
      !("userOverallScore" in body) &&
      body.resetScores !== true
    ) {
      // Fetch current use case to get system scores as fallbacks
      const current = await prisma.forgeUseCase.findUnique({
        where: { id: usecaseId, runId },
        select: {
          priorityScore: true,
          feasibilityScore: true,
          impactScore: true,
          userPriorityScore: true,
          userFeasibilityScore: true,
          userImpactScore: true,
        },
      });
      if (current) {
        const p =
          (updateData.userPriorityScore as number | null) ??
          body.userPriorityScore ??
          current.userPriorityScore ??
          current.priorityScore ??
          0;
        const f =
          (updateData.userFeasibilityScore as number | null) ??
          body.userFeasibilityScore ??
          current.userFeasibilityScore ??
          current.feasibilityScore ??
          0;
        const i =
          (updateData.userImpactScore as number | null) ??
          body.userImpactScore ??
          current.userImpactScore ??
          current.impactScore ??
          0;
        updateData.userOverallScore = computeOverallScore(p, f, i);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await prisma.forgeUseCase.update({
      where: { id: usecaseId, runId },
      data: updateData,
    });

    logger.info("[api/runs/usecases] Use case updated", { runId, usecaseId, fields: Object.keys(updateData) });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[api/runs/usecases] PATCH failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to update use case" },
      { status: 500 }
    );
  }
}

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

    if (!isValidUUID(runId)) {
      return NextResponse.json({ error: `Invalid run ID: "${runId}"` }, { status: 400 });
    }
    if (!isValidUUID(usecaseId)) {
      return NextResponse.json({ error: `Invalid use case ID: "${usecaseId}"` }, { status: 400 });
    }

    const body = await request.json();
    const prisma = await getPrisma();

    // Verify the use case exists and belongs to the run
    const existing = await prisma.forgeUseCase.findFirst({
      where: { id: usecaseId, runId },
      select: {
        id: true,
        priorityScore: true,
        feasibilityScore: true,
        impactScore: true,
        userPriorityScore: true,
        userFeasibilityScore: true,
        userImpactScore: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "Use case not found" }, { status: 404 });
    }

    // Build typed update payload
    const updateData: {
      name?: string;
      statement?: string;
      tablesInvolved?: string;
      userPriorityScore?: number | null;
      userFeasibilityScore?: number | null;
      userImpactScore?: number | null;
      userOverallScore?: number | null;
    } = {};

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
    if (body.resetScores === true) {
      updateData.userPriorityScore = null;
      updateData.userFeasibilityScore = null;
      updateData.userImpactScore = null;
      updateData.userOverallScore = null;
    } else {
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

      // Auto-compute overall if dimension scores changed but overall wasn't sent
      if (
        ("userPriorityScore" in body ||
          "userFeasibilityScore" in body ||
          "userImpactScore" in body) &&
        !("userOverallScore" in body)
      ) {
        const p =
          updateData.userPriorityScore ??
          existing.userPriorityScore ??
          existing.priorityScore ??
          0;
        const f =
          updateData.userFeasibilityScore ??
          existing.userFeasibilityScore ??
          existing.feasibilityScore ??
          0;
        const i =
          updateData.userImpactScore ??
          existing.userImpactScore ??
          existing.impactScore ??
          0;
        updateData.userOverallScore = computeOverallScore(p, f, i);
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    await prisma.forgeUseCase.update({
      where: { id: usecaseId },
      data: updateData,
    });

    logger.info("[api/runs/usecases] Use case updated", { runId, usecaseId, fields: Object.keys(updateData) });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[api/runs/usecases] PATCH failed", { error: msg });
    return NextResponse.json(
      { error: `Failed to update use case: ${msg}` },
      { status: 500 }
    );
  }
}

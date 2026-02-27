/**
 * CRUD operations for the ForgeAssistantLog table.
 *
 * Stores every Ask Forge interaction for analytics, feedback tracking,
 * and future model improvement.
 */

import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface CreateAssistantLogInput {
  sessionId: string;
  question: string;
  intent?: string;
  intentConfidence?: number;
  ragChunkIds?: string[];
  response?: string;
  sqlGenerated?: string;
  durationMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  userId?: string;
}

export interface UpdateAssistantLogInput {
  sqlExecuted?: boolean;
  sqlResult?: string;
  actionsTaken?: string[];
  feedbackRating?: "up" | "down";
  feedbackText?: string;
}

/**
 * Create a new assistant interaction log entry.
 */
export async function createAssistantLog(
  input: CreateAssistantLogInput,
): Promise<string> {
  return withPrisma(async (prisma) => {
    const log = await prisma.forgeAssistantLog.create({
      data: {
        sessionId: input.sessionId,
        question: input.question,
        intent: input.intent,
        intentConfidence: input.intentConfidence,
        ragChunkIds: input.ragChunkIds ? JSON.stringify(input.ragChunkIds) : null,
        response: input.response,
        sqlGenerated: input.sqlGenerated,
        durationMs: input.durationMs,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: input.totalTokens,
        userId: input.userId,
      },
    });

    logger.debug("[assistant-log] Created log entry", { id: log.id, sessionId: input.sessionId });
    return log.id;
  });
}

/**
 * Update an existing log entry (feedback, SQL execution tracking, actions).
 */
export async function updateAssistantLog(
  logId: string,
  input: UpdateAssistantLogInput,
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeAssistantLog.update({
      where: { id: logId },
      data: {
        sqlExecuted: input.sqlExecuted,
        sqlResult: input.sqlResult,
        actionsTaken: input.actionsTaken ? JSON.stringify(input.actionsTaken) : undefined,
        feedbackRating: input.feedbackRating,
        feedbackText: input.feedbackText,
      },
    });

    logger.debug("[assistant-log] Updated log entry", { logId });
  });
}

/**
 * Get recent assistant logs for a session.
 */
export async function getSessionLogs(
  sessionId: string,
  limit = 50,
) {
  return withPrisma(async (prisma) => {
    return prisma.forgeAssistantLog.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  });
}

/**
 * Get recent assistant logs across all sessions.
 */
export async function getRecentLogs(limit = 100) {
  return withPrisma(async (prisma) => {
    return prisma.forgeAssistantLog.findMany({
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  });
}

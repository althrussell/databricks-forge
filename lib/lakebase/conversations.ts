/**
 * CRUD operations for the ForgeConversation table.
 *
 * Manages conversation history for Ask Forge, with all queries
 * scoped to a specific userId to enforce per-user isolation.
 */

import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface ConversationSummary {
  id: string;
  title: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  intent?: string;
  intentConfidence?: number;
  sqlGenerated?: string;
  feedbackRating?: string;
  createdAt: string;
  logId: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

/**
 * Create a new conversation for the given user.
 */
export async function createConversation(
  userId: string,
  title: string,
  sessionId: string,
): Promise<string> {
  return withPrisma(async (prisma) => {
    const conv = await prisma.forgeConversation.create({
      data: { userId, title, sessionId },
    });
    logger.debug("[conversations] Created conversation", {
      id: conv.id,
      userId,
      sessionId,
    });
    return conv.id;
  });
}

/**
 * List conversations for a user, ordered by most recently updated.
 */
export async function getUserConversations(
  userId: string,
  limit = 50,
): Promise<ConversationSummary[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        sessionId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      sessionId: r.sessionId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  });
}

/**
 * Load a conversation and its messages. Returns null if not found
 * or the conversation does not belong to the given user.
 */
export async function getConversationWithMessages(
  conversationId: string,
  userId: string,
): Promise<ConversationDetail | null> {
  return withPrisma(async (prisma) => {
    const conv = await prisma.forgeConversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv || conv.userId !== userId) return null;

    const logs = await prisma.forgeAssistantLog.findMany({
      where: { sessionId: conv.sessionId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        question: true,
        response: true,
        intent: true,
        intentConfidence: true,
        sqlGenerated: true,
        feedbackRating: true,
        createdAt: true,
      },
    });

    const messages: ConversationMessage[] = [];
    for (const log of logs) {
      messages.push({
        id: `${log.id}-q`,
        role: "user",
        content: log.question,
        createdAt: log.createdAt.toISOString(),
        logId: log.id,
      });
      if (log.response) {
        messages.push({
          id: `${log.id}-a`,
          role: "assistant",
          content: log.response,
          intent: log.intent ?? undefined,
          intentConfidence: log.intentConfidence ?? undefined,
          sqlGenerated: log.sqlGenerated ?? undefined,
          feedbackRating: log.feedbackRating ?? undefined,
          createdAt: log.createdAt.toISOString(),
          logId: log.id,
        });
      }
    }

    return {
      id: conv.id,
      title: conv.title,
      sessionId: conv.sessionId,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
      messages,
    };
  });
}

/**
 * Rename a conversation. Returns false if not found or not owned by userId.
 */
export async function updateConversationTitle(
  conversationId: string,
  userId: string,
  title: string,
): Promise<boolean> {
  return withPrisma(async (prisma) => {
    const conv = await prisma.forgeConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    });
    if (!conv || conv.userId !== userId) return false;

    await prisma.forgeConversation.update({
      where: { id: conversationId },
      data: { title },
    });
    return true;
  });
}

/**
 * Delete a conversation and its associated logs.
 * Returns false if not found or not owned by userId.
 */
export async function deleteConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  return withPrisma(async (prisma) => {
    const conv = await prisma.forgeConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true, sessionId: true },
    });
    if (!conv || conv.userId !== userId) return false;

    await prisma.forgeAssistantLog.deleteMany({
      where: { sessionId: conv.sessionId },
    });
    await prisma.forgeConversation.delete({
      where: { id: conversationId },
    });

    logger.debug("[conversations] Deleted conversation", { conversationId });
    return true;
  });
}

/**
 * Update the `updatedAt` timestamp when a new message is added.
 */
export async function touchConversation(sessionId: string): Promise<void> {
  try {
    await withPrisma(async (prisma) => {
      await prisma.forgeConversation.update({
        where: { sessionId },
        data: { updatedAt: new Date() },
      });
    });
  } catch {
    // best-effort -- conversation may not exist yet
  }
}

/**
 * Find a conversation by sessionId. Returns the conversation id or null.
 */
export async function findConversationBySession(
  sessionId: string,
): Promise<string | null> {
  return withPrisma(async (prisma) => {
    const conv = await prisma.forgeConversation.findUnique({
      where: { sessionId },
      select: { id: true },
    });
    return conv?.id ?? null;
  });
}

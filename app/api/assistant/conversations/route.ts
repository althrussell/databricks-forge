/**
 * GET  /api/assistant/conversations -- list the current user's conversations
 * POST /api/assistant/conversations -- create a new conversation
 */

import { getCurrentUserEmail } from "@/lib/dbx/client";
import {
  getUserConversations,
  createConversation,
} from "@/lib/lakebase/conversations";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const userId = await getCurrentUserEmail();
    if (!userId) {
      return Response.json({ conversations: [], authenticated: false });
    }

    const conversations = await getUserConversations(userId);
    return Response.json({ conversations, authenticated: true });
  } catch (err) {
    logger.error("[api/conversations] List error", { error: String(err) });
    return Response.json({ error: "Failed to list conversations" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getCurrentUserEmail();
    if (!userId) {
      return Response.json({ error: "User identity required" }, { status: 401 });
    }

    const body = await req.json();
    const title = (body.title as string) ?? "New conversation";
    const sessionId = (body.sessionId as string) ?? crypto.randomUUID();

    const id = await createConversation(userId, title, sessionId);
    return Response.json({ id, sessionId });
  } catch (err) {
    logger.error("[api/conversations] Create error", { error: String(err) });
    return Response.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}

/**
 * Databricks Genie Spaces REST API client.
 *
 * Follows the same pattern as workspace.ts: uses getConfig() for host,
 * getAppHeaders() for auth, fetchWithTimeout with TIMEOUTS.WORKSPACE.
 *
 * API docs: https://docs.databricks.com/api/workspace/genie
 */

import { getConfig, getAppHeaders } from "./client";
import { fetchWithTimeout, TIMEOUTS } from "./fetch-with-timeout";
import { mkdirs } from "./workspace";
import { logger } from "@/lib/logger";
import type { GenieSpaceResponse, GenieListResponse } from "@/lib/genie/types";

export const DEFAULT_GENIE_PARENT_PATH = "/Shared/Forge Genie Spaces/";

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listGenieSpaces(
  pageSize = 100,
  pageToken?: string
): Promise<GenieListResponse> {
  const config = getConfig();
  const params = new URLSearchParams({ page_size: String(pageSize) });
  if (pageToken) params.set("page_token", pageToken);

  const url = `${config.host}/api/2.0/genie/spaces?${params}`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    { method: "GET", headers },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Genie list spaces failed (${response.status}): ${text}`);
  }

  return (await response.json()) as GenieListResponse;
}

// ---------------------------------------------------------------------------
// Get
// ---------------------------------------------------------------------------

export async function getGenieSpace(
  spaceId: string
): Promise<GenieSpaceResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}?include_serialized_space=true`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    { method: "GET", headers },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Genie get space failed (${response.status}): ${text}`);
  }

  return (await response.json()) as GenieSpaceResponse;
}

// ---------------------------------------------------------------------------
// Sanitise serialized space before sending to the API.
// Fixes known enum casing issues (e.g. benchmark answer format must be
// uppercase "SQL", not lowercase "sql") so that older persisted payloads
// still deploy successfully.
// ---------------------------------------------------------------------------

const VALID_BENCHMARK_FORMATS = new Set(["SQL"]);

export function sanitizeSerializedSpace(raw: string): string {
  try {
    const parsed = JSON.parse(raw);

    // Fix benchmark answer format enum casing
    const questions = parsed?.benchmarks?.questions;
    if (Array.isArray(questions)) {
      for (const q of questions) {
        if (Array.isArray(q.answer)) {
          for (const a of q.answer) {
            if (
              typeof a.format === "string" &&
              !VALID_BENCHMARK_FORMATS.has(a.format)
            ) {
              a.format = a.format.toUpperCase();
            }
          }
        }
      }
    }

    // Collapse text_instructions to at most one entry (API limit)
    const instrs = parsed?.instructions?.text_instructions;
    if (Array.isArray(instrs) && instrs.length > 1) {
      const allContent = instrs.flatMap(
        (i: { content?: string[] }) => i.content ?? []
      );
      parsed.instructions.text_instructions = [
        { id: instrs[0].id, content: allContent },
      ];
    }

    // Strip unsupported fields from data_sources.tables
    const tables = parsed?.data_sources?.tables;
    if (Array.isArray(tables)) {
      for (const t of tables) {
        delete t.columns;
      }
    }

    // Strip unsupported `instructions` field from sql_snippets (measures, filters, expressions)
    const snippets = parsed?.instructions?.sql_snippets;
    if (snippets) {
      for (const key of ["measures", "filters", "expressions"] as const) {
        const items = snippets[key];
        if (Array.isArray(items)) {
          for (const item of items) {
            delete item.instructions;
          }
        }
      }
    }

    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createGenieSpace(opts: {
  title: string;
  description: string;
  serializedSpace: string;
  warehouseId: string;
  parentPath?: string;
}): Promise<GenieSpaceResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces`;
  const headers = await getAppHeaders();

  const parentPath = opts.parentPath ?? DEFAULT_GENIE_PARENT_PATH;

  // Best-effort: pre-create the parent folder. The Genie API creates it
  // automatically, so this is not required. It may fail in Databricks Apps
  // where the `workspace` scope is unavailable.
  try {
    await mkdirs(parentPath);
  } catch (err) {
    logger.debug("mkdirs for Genie parent path failed (non-fatal)", {
      parentPath,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const body = {
    title: opts.title,
    description: opts.description,
    serialized_space: sanitizeSerializedSpace(opts.serializedSpace),
    warehouse_id: opts.warehouseId,
    parent_path: parentPath,
  };

  const response = await fetchWithTimeout(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Genie create space failed (${response.status}): ${text}`);
  }

  return (await response.json()) as GenieSpaceResponse;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateGenieSpace(
  spaceId: string,
  opts: {
    title?: string;
    description?: string;
    serializedSpace?: string;
    warehouseId?: string;
  }
): Promise<GenieSpaceResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}`;
  const headers = await getAppHeaders();

  const body: Record<string, string> = {};
  if (opts.title !== undefined) body.title = opts.title;
  if (opts.description !== undefined) body.description = opts.description;
  if (opts.serializedSpace !== undefined)
    body.serialized_space = sanitizeSerializedSpace(opts.serializedSpace);
  if (opts.warehouseId !== undefined) body.warehouse_id = opts.warehouseId;

  const response = await fetchWithTimeout(
    url,
    { method: "PATCH", headers, body: JSON.stringify(body) },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Genie update space failed (${response.status}): ${text}`);
  }

  return (await response.json()) as GenieSpaceResponse;
}

// ---------------------------------------------------------------------------
// Conversation API -- ask questions to a deployed Genie Space
// ---------------------------------------------------------------------------

export interface GenieConversationMessage {
  question: string;
  conversationId: string;
  messageId: string;
  status: "COMPLETED" | "EXECUTING_QUERY" | "FAILED" | "CANCELLED" | "SUBMITTED" | "FILTERING_RESULTS" | "ASKING_AI" | "CANCELLED_BY_USER";
  sql?: string;
  textResponse?: string;
  error?: string;
}

async function pollMessageCompletion(
  spaceId: string,
  conversationId: string,
  messageId: string,
  timeoutMs = 120_000
): Promise<GenieConversationMessage> {
  const config = getConfig();
  const headers = await getAppHeaders();
  const deadline = Date.now() + timeoutMs;
  const terminalStatuses = new Set(["COMPLETED", "FAILED", "CANCELLED", "CANCELLED_BY_USER"]);

  while (Date.now() < deadline) {
    const url = `${config.host}/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages/${messageId}`;
    const response = await fetchWithTimeout(url, { method: "GET", headers }, TIMEOUTS.WORKSPACE);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Genie get message failed (${response.status}): ${text}`);
    }

    const msg = (await response.json()) as {
      id: string;
      status: string;
      query_result?: { query_text?: string };
      error?: { message?: string };
      content?: string;
    };

    if (terminalStatuses.has(msg.status)) {
      return {
        question: "",
        conversationId,
        messageId,
        status: msg.status as GenieConversationMessage["status"],
        sql: msg.query_result?.query_text,
        textResponse: msg.content,
        error: msg.error?.message,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  return {
    question: "",
    conversationId,
    messageId,
    status: "FAILED",
    error: `Timed out after ${timeoutMs}ms`,
  };
}

/**
 * Start a new conversation with a Genie Space by asking a question.
 * Polls until the response is complete or times out.
 */
export async function startConversation(
  spaceId: string,
  question: string,
  timeoutMs = 120_000
): Promise<GenieConversationMessage> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}/conversations`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content: question }),
    },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Genie start conversation failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as {
    conversation_id: string;
    message_id: string;
  };

  const result = await pollMessageCompletion(
    spaceId,
    data.conversation_id,
    data.message_id,
    timeoutMs
  );

  return { ...result, question };
}

/**
 * Send a follow-up question in an existing Genie conversation.
 * Polls until the response is complete or times out.
 */
export async function sendFollowUp(
  spaceId: string,
  conversationId: string,
  question: string,
  timeoutMs = 120_000
): Promise<GenieConversationMessage> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}/conversations/${conversationId}/messages`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ content: question }),
    },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Genie follow-up failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { id: string };

  const result = await pollMessageCompletion(
    spaceId,
    conversationId,
    data.id,
    timeoutMs
  );

  return { ...result, question };
}

// ---------------------------------------------------------------------------
// Trash (soft delete)
// ---------------------------------------------------------------------------

export async function trashGenieSpace(spaceId: string): Promise<void> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}`;
  const headers = await getAppHeaders();

  const response = await fetchWithTimeout(
    url,
    { method: "DELETE", headers },
    TIMEOUTS.WORKSPACE
  );

  if (!response.ok) {
    const text = await response.text();
    if (response.status !== 404) {
      throw new Error(
        `Genie trash space failed (${response.status}): ${text}`
      );
    }
  }
}

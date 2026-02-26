/**
 * Databricks Genie Spaces REST API client.
 *
 * Follows the same pattern as workspace.ts: uses getConfig() for host,
 * getAppHeaders() for auth, fetchWithTimeout with TIMEOUTS.WORKSPACE.
 *
 * API docs: https://docs.databricks.com/api/workspace/genie
 */

import { getConfig, getAppHeaders, getHeaders } from "./client";
import { fetchWithTimeout, TIMEOUTS } from "./fetch-with-timeout";
import { mkdirs } from "./workspace";
import { logger } from "@/lib/logger";
import type { GenieSpaceResponse, GenieListResponse } from "@/lib/genie/types";
import type { GenieAuthMode } from "@/lib/settings";

/** Resolve auth headers based on the deploy auth mode. */
async function resolveHeaders(authMode?: GenieAuthMode): Promise<Record<string, string>> {
  return authMode === "obo" ? getHeaders() : getAppHeaders();
}

export const DEFAULT_GENIE_PARENT_PATH = "/Shared/Forge Genie Spaces/";
const FALLBACK_GENIE_PARENT_PATH = "/Shared/";

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

    // Sort metric_views by identifier (Genie API requirement)
    const metricViews = parsed?.data_sources?.metric_views;
    if (Array.isArray(metricViews)) {
      metricViews.sort(
        (a: { identifier?: string }, b: { identifier?: string }) =>
          (a.identifier ?? "").localeCompare(b.identifier ?? "")
      );
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

    // Sanitize join_specs: rewrite FQN SQL to alias format, add aliases, encode relationship_type
    const joinSpecs = parsed?.instructions?.join_specs;
    if (Array.isArray(joinSpecs)) {
      for (const js of joinSpecs) {
        const leftId: string = js.left?.identifier ?? "";
        const rightId: string = js.right?.identifier ?? "";

        // Add aliases if missing
        if (leftId && !js.left.alias) {
          js.left.alias = leftId.split(".").pop() ?? leftId;
        }
        if (rightId && !js.right.alias) {
          let alias = rightId.split(".").pop() ?? rightId;
          if (alias === js.left.alias) alias = `${alias}_2`;
          js.right.alias = alias;
        }

        // Rewrite FQN.column references in sql[] to `alias`.`column` format
        if (Array.isArray(js.sql) && leftId && rightId) {
          const leftAlias = js.left.alias as string;
          const rightAlias = js.right.alias as string;

          js.sql = js.sql.map((s: string) => {
            if (s.startsWith("--")) return s;
            let result = s;
            // Sort by length descending to avoid partial matches
            const replacements = (
              [[leftId, leftAlias], [rightId, rightAlias]] as [string, string][]
            ).sort((a, b) => b[0].length - a[0].length);
            for (const [fqn, alias] of replacements) {
              const escaped = fqn.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              result = result.replace(
                new RegExp(`${escaped}\\.([a-zA-Z_]\\w*)`, "g"),
                `\`${alias}\`.\`$1\``
              );
            }
            return result;
          });
        }

        // Encode relationship_type as SQL comment if present
        if (js.relationship_type) {
          const rtTag = `FROM_RELATIONSHIP_TYPE_${String(js.relationship_type).toUpperCase()}`;
          if (Array.isArray(js.sql) && !js.sql.some((s: string) => s.includes("--rt="))) {
            js.sql.push(`--rt=${rtTag}--`);
          }
          delete js.relationship_type;
        }
      }
    }

    // Strip any leftover sql_functions (no longer supported)
    if (parsed?.instructions?.sql_functions) {
      delete parsed.instructions.sql_functions;
    }

    // Normalize + sort all id-keyed arrays (Genie API requires lowercase 32-hex UUIDs without hyphens, sorted)
    for (const arr of [
      parsed?.config?.sample_questions,
      parsed?.instructions?.join_specs,
      parsed?.instructions?.example_question_sqls,
      parsed?.instructions?.text_instructions,
      parsed?.instructions?.sql_snippets?.measures,
      parsed?.instructions?.sql_snippets?.filters,
      parsed?.instructions?.sql_snippets?.expressions,
      parsed?.benchmarks?.questions,
    ]) {
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (typeof item?.id === "string") {
            item.id = item.id.replace(/-/g, "").toLowerCase();
          }
        }
        arr.sort((a: { id?: string }, b: { id?: string }) =>
          (a.id ?? "").localeCompare(b.id ?? "")
        );
      }
    }

    // Sort data_sources.tables by identifier (Genie API requirement)
    const dsTables = parsed?.data_sources?.tables;
    if (Array.isArray(dsTables)) {
      dsTables.sort(
        (a: { identifier?: string }, b: { identifier?: string }) =>
          (a.identifier ?? "").localeCompare(b.identifier ?? "")
      );
    }

    return JSON.stringify(parsed);
  } catch (err) {
    logger.error("sanitizeSerializedSpace: failed to parse JSON, returning raw", {
      error: err instanceof Error ? err.message : String(err),
      rawLength: raw.length,
    });
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
  authMode?: GenieAuthMode;
}): Promise<GenieSpaceResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces`;
  const headers = await resolveHeaders(opts.authMode);
  const sanitized = sanitizeSerializedSpace(opts.serializedSpace);

  let parentPath = opts.parentPath ?? DEFAULT_GENIE_PARENT_PATH;

  // Best-effort: pre-create the parent folder.
  try {
    await mkdirs(parentPath);
  } catch {
    // Will be caught by the retry below if the path doesn't exist
  }

  const body = {
    title: opts.title,
    description: opts.description,
    serialized_space: sanitized,
    warehouse_id: opts.warehouseId,
    parent_path: parentPath,
  };

  let response = await fetchWithTimeout(
    url,
    { method: "POST", headers, body: JSON.stringify(body) },
    TIMEOUTS.WORKSPACE
  );

  // If the parent path doesn't exist, retry with /Shared/ as fallback
  if (!response.ok) {
    const text = await response.text();
    if (text.includes("RESOURCE_DOES_NOT_EXIST") && parentPath !== FALLBACK_GENIE_PARENT_PATH) {
      logger.warn("Genie parent path does not exist, retrying with /Shared/", { parentPath });
      parentPath = FALLBACK_GENIE_PARENT_PATH;
      body.parent_path = parentPath;
      response = await fetchWithTimeout(
        url,
        { method: "POST", headers, body: JSON.stringify(body) },
        TIMEOUTS.WORKSPACE
      );
      if (!response.ok) {
        const retryText = await response.text();
        throw new Error(`Genie create space failed (${response.status}): ${retryText}`);
      }
    } else {
      throw new Error(`Genie create space failed (${response.status}): ${text}`);
    }
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
    authMode?: GenieAuthMode;
  }
): Promise<GenieSpaceResponse> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}`;
  const headers = await resolveHeaders(opts.authMode);

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
 *
 * API: POST /api/2.0/genie/spaces/{space_id}/start-conversation
 */
export async function startConversation(
  spaceId: string,
  question: string,
  timeoutMs = 120_000
): Promise<GenieConversationMessage> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}/start-conversation`;
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
    conversation_id?: string;
    message_id?: string;
    conversation?: { id: string };
    message?: { message_id: string };
  };

  const conversationId = data.conversation_id ?? data.conversation?.id;
  const messageId = data.message_id ?? data.message?.message_id;

  if (!conversationId || !messageId) {
    throw new Error("Genie start-conversation response missing conversation_id or message_id");
  }

  const result = await pollMessageCompletion(
    spaceId,
    conversationId,
    messageId,
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

  const data = (await response.json()) as {
    id?: string;
    message_id?: string;
  };

  const messageId = data.id ?? data.message_id;
  if (!messageId) {
    throw new Error("Genie follow-up response missing message id");
  }

  const result = await pollMessageCompletion(
    spaceId,
    conversationId,
    messageId,
    timeoutMs
  );

  return { ...result, question };
}

// ---------------------------------------------------------------------------
// Trash (soft delete)
// ---------------------------------------------------------------------------

export async function trashGenieSpace(spaceId: string, authMode?: GenieAuthMode): Promise<void> {
  const config = getConfig();
  const url = `${config.host}/api/2.0/genie/spaces/${spaceId}`;
  const headers = await resolveHeaders(authMode);

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

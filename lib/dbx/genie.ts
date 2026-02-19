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
import type { GenieSpaceResponse, GenieListResponse } from "@/lib/genie/types";

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

function sanitizeSerializedSpace(raw: string): string {
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

  const parentPath = opts.parentPath ?? "/Shared/Forge Genie Spaces/";

  // Ensure the parent folder exists in the workspace
  await mkdirs(parentPath);

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

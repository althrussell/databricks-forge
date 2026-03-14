/**
 * Research Engine endpoint resolution.
 *
 * The Research Engine is a premium feature -- all LLM calls default to
 * databricks-claude-opus-4-6 with databricks-gpt-5-4 as fallback. This
 * bypasses the queue-depth task router to ensure consistent quality.
 */

import { getModelPool } from "@/lib/dbx/model-registry";
import { resolveEndpoint } from "@/lib/dbx/client";

const PREFERRED = "databricks-claude-opus-4-6";
const FALLBACK = "databricks-gpt-5-4";

let _cached: string | null = null;

export function resolveResearchEndpoint(): string {
  if (_cached) return _cached;

  const pool = getModelPool();
  const poolNames = new Set(pool.map((ep) => ep.name));

  if (poolNames.has(PREFERRED)) {
    _cached = PREFERRED;
  } else if (poolNames.has(FALLBACK)) {
    _cached = FALLBACK;
  } else {
    _cached = resolveEndpoint("reasoning");
  }

  return _cached;
}

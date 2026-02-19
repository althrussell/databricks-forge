/**
 * Safely parse JSON from LLM responses that may be wrapped in
 * markdown code fences (```json ... ``` or ``` ... ```).
 */
export function parseLLMJson(raw: string): unknown {
  const stripped = raw
    .replace(/^[\s\S]*?```(?:json)?\s*\n?/i, "")
    .replace(/\n?\s*```[\s\S]*$/, "")
    .trim();

  // Try the stripped version first, fall back to raw
  try {
    return JSON.parse(stripped);
  } catch {
    return JSON.parse(raw);
  }
}

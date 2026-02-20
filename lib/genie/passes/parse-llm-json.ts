/**
 * Safely parse JSON from LLM responses that may be wrapped in
 * markdown code fences, contain preamble/postamble text, or
 * include BOM characters.
 *
 * Multi-strategy approach:
 * 1. Try raw JSON.parse (fast path for well-behaved models)
 * 2. Extract between ```json / ``` fences using indexOf
 * 3. Bracket-match: find first { or [ and last } or ]
 * 4. Repair common LLM JSON errors (missing commas, trailing commas)
 * 5. Throw descriptive error
 */
export function parseLLMJson(raw: string): unknown {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();

  // Strategy 1: direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // Strategy 2: extract from markdown code fences (indexOf, not regex)
  const fenced = extractFromFences(trimmed);
  if (fenced !== null) {
    try {
      return JSON.parse(fenced);
    } catch {
      // continue to bracket matching on the fenced content
      const bracketed = extractBrackets(fenced);
      if (bracketed !== null) {
        try {
          return JSON.parse(bracketed);
        } catch {
          // try repair on fenced bracket content
          return tryRepairAndParse(bracketed);
        }
      }
    }
  }

  // Strategy 3: bracket-match on the full string
  const bracketed = extractBrackets(trimmed);
  if (bracketed !== null) {
    try {
      return JSON.parse(bracketed);
    } catch {
      // Strategy 4: repair common LLM JSON errors then re-parse
      return tryRepairAndParse(bracketed);
    }
  }

  throw new SyntaxError(
    `parseLLMJson: unable to extract valid JSON from LLM response (${trimmed.length} chars, starts with: ${JSON.stringify(trimmed.slice(0, 60))})`
  );
}

/**
 * Attempt to repair common JSON errors produced by LLMs and re-parse.
 * Throws the original SyntaxError if repair doesn't help.
 */
function tryRepairAndParse(text: string): unknown {
  const repaired = repairLlmJson(text);
  return JSON.parse(repaired);
}

/**
 * Fix common structural JSON errors in LLM output.
 *
 * In valid JSON, literal newlines only appear between tokens (never inside
 * strings, where they must be escaped as \n). This means patterns like
 * `}\n{` are unambiguously a missing comma between adjacent array elements.
 */
function repairLlmJson(text: string): string {
  let result = text;

  // Fix 1: Missing comma between adjacent objects in arrays — the #1 LLM JSON error.
  //   } <whitespace/newline> {  →  }, {
  //   Also handles same-line  } {  (compact JSON from json_object mode).
  result = result.replace(/\}(\s+)\{/g, "},$1{");

  // Fix 2: Missing comma between a closing bracket/brace and the next element.
  //   ] <whitespace> {  or  } <whitespace> [
  result = result.replace(/\](\s+)\{/g, "],$1{");
  result = result.replace(/\}(\s+)\[/g, "},$1[");

  // Fix 3: Trailing commas before ] or } (common when LLM adds a comma after
  // the last element).
  result = result.replace(/,(\s*[\]}])/g, "$1");

  return result;
}

function extractFromFences(text: string): string | null {
  // Find opening fence: ``` optionally followed by "json" and whitespace
  const openPatterns = ["```json\n", "```json\r\n", "```json ", "```\n", "```\r\n"];
  let openIdx = -1;
  let contentStart = -1;

  for (const pat of openPatterns) {
    const idx = text.indexOf(pat);
    if (idx !== -1 && (openIdx === -1 || idx < openIdx)) {
      openIdx = idx;
      contentStart = idx + pat.length;
    }
  }

  if (openIdx === -1 || contentStart === -1) return null;

  // Find closing fence after the content starts
  const closeIdx = text.indexOf("```", contentStart);
  if (closeIdx === -1) {
    // No closing fence -- take everything after the opening
    return text.slice(contentStart).trim();
  }

  return text.slice(contentStart, closeIdx).trim();
}

function extractBrackets(text: string): string | null {
  const firstBrace = text.indexOf("{");
  const firstBracket = text.indexOf("[");

  let start: number;
  let closeChar: string;

  if (firstBrace === -1 && firstBracket === -1) return null;

  if (firstBrace === -1) {
    start = firstBracket;
    closeChar = "]";
  } else if (firstBracket === -1) {
    start = firstBrace;
    closeChar = "}";
  } else if (firstBracket < firstBrace) {
    start = firstBracket;
    closeChar = "]";
  } else {
    start = firstBrace;
    closeChar = "}";
  }

  const end = text.lastIndexOf(closeChar);
  if (end <= start) return null;

  return text.slice(start, end + 1);
}

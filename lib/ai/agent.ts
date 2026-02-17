/**
 * AI Agent -- wrapper for executing LLM calls via Databricks Model Serving.
 *
 * All LLM interactions go through the Foundation Model API (FMAPI) using
 * the OpenAI-compatible chat completions endpoint. This replaces the
 * previous ai_query() SQL path, giving:
 *   - Lower latency (no SQL warehouse overhead or polling)
 *   - Structured output via JSON mode (response_format)
 *   - Token usage metrics for cost tracking
 *   - System/user message separation
 *   - Optional streaming for long-running generations
 *
 * Features:
 * - Temperature control per prompt type (low for structured output,
 *   moderate for creative generation)
 * - Automatic retry with exponential backoff (configurable)
 * - Optional JSON mode for structured responses
 */

import { randomUUID } from "crypto";
import {
  chatCompletion,
  chatCompletionStream,
  ModelServingError,
  type ChatMessage,
  type StreamCallback,
  type TokenUsage,
} from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import { insertPromptLog } from "@/lib/lakebase/prompt-logs";
import { formatPrompt, PROMPT_VERSIONS, type PromptKey } from "./templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AIQueryOptions {
  /** The prompt template key */
  promptKey: PromptKey;
  /** Variables to inject into the template */
  variables: Record<string, string>;
  /** The AI model endpoint to use */
  modelEndpoint: string;
  /**
   * Temperature for the LLM (0.0 - 1.0).
   * Low (0.1-0.3): scoring, classification, SQL generation, dedup.
   * Moderate (0.5-0.7): use case generation, business context.
   * Defaults based on prompt type if not provided.
   */
  temperature?: number;
  /**
   * Maximum tokens for the response.
   * When omitted, no max_tokens constraint is sent — the model uses its
   * own default, which avoids mid-response truncation.
   */
  maxTokens?: number;
  /**
   * Number of retry attempts on failure (default: 2).
   * Set to 0 for no retries.
   */
  retries?: number;
  /**
   * Pipeline run ID. When set, the call is logged to InspirePromptLog
   * for auditing and debugging.
   */
  runId?: string;
  /**
   * Pipeline step context (e.g. "business-context", "sql-generation").
   * Logged alongside runId for per-step filtering.
   */
  step?: string;
  /**
   * When set to "json_object", instructs the model to return valid JSON.
   * The prompt must also mention JSON in its output format instructions.
   * Eliminates the need for markdown fence stripping and bracket-finding.
   */
  responseFormat?: "text" | "json_object";
  /**
   * Optional system message to prepend. When provided, the prompt template
   * content is sent as the "user" message and this becomes the "system"
   * message. Enables better persona/instruction separation.
   */
  systemMessage?: string;
}

/**
 * Honesty score threshold below which a warning is logged.
 * Scores are 0.0-1.0. Responses below this threshold may indicate the LLM
 * is uncertain about its output quality.
 */
const LOW_HONESTY_THRESHOLD = 0.3;

export interface AIQueryResult {
  /** Raw response text from the LLM */
  rawResponse: string;
  /** Extracted honesty score (if present, 0.0-1.0) */
  honestyScore: number | null;
  /** The prompt template version hash used for this call */
  promptVersion: string;
  /** Duration of the LLM call in milliseconds */
  durationMs: number;
  /** Token usage statistics (prompt, completion, total). Null if unavailable. */
  tokenUsage: TokenUsage | null;
}

// Re-export TokenUsage for consumers
export type { TokenUsage } from "@/lib/dbx/model-serving";

// ---------------------------------------------------------------------------
// Per-prompt temperature configuration
// ---------------------------------------------------------------------------
// Ported from the reference notebook's TECHNICAL_CONTEXT.
// Low temps (0.1-0.2) for structured/deterministic output (scoring, SQL, classification).
// Medium temps (0.3-0.5) for semi-structured reasoning (business context, domains, dedup).
// Higher temps (0.7-0.8) for creative generation (use case ideation).

const PROMPT_TEMPERATURES: Partial<Record<PromptKey, number>> = {
  // Phase 1: Initialization
  BUSINESS_CONTEXT_WORKER_PROMPT: 0.3,
  // Phase 2: Table Filtering
  FILTER_BUSINESS_TABLES_PROMPT: 0.2,
  // Phase 3: Use Case Generation (creative -- needs diversity)
  BASE_USE_CASE_GEN_PROMPT: 0.7,
  AI_USE_CASE_GEN_PROMPT: 0.8,
  STATS_USE_CASE_GEN_PROMPT: 0.7,
  // Phase 4: Domain Clustering
  DOMAIN_FINDER_PROMPT: 0.5,
  SUBDOMAIN_DETECTOR_PROMPT: 0.4,
  DOMAINS_MERGER_PROMPT: 0.4,
  // Phase 5: Scoring & Deduplication (deterministic)
  SCORE_USE_CASES_PROMPT: 0.2,
  REVIEW_USE_CASES_PROMPT: 0.3,
  GLOBAL_SCORE_CALIBRATION_PROMPT: 0.2,
  CROSS_DOMAIN_DEDUP_PROMPT: 0.3,
  // Phase 6: SQL Generation (precise)
  USE_CASE_SQL_GEN_PROMPT: 0.1,
  USE_CASE_SQL_FIX_PROMPT: 0.1,
  // Phase 7: Export & Translation
  SUMMARY_GEN_PROMPT: 0.5,
  KEYWORDS_TRANSLATE_PROMPT: 0.2,
  USE_CASE_TRANSLATE_PROMPT: 0.3,
};

function getDefaultTemperature(promptKey: PromptKey): number {
  return PROMPT_TEMPERATURES[promptKey] ?? 0.3;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute an LLM call via Databricks Model Serving (FMAPI) and return
 * the raw response.
 *
 * Uses the chat completions endpoint with system/user message separation.
 * Retries on transient failures with exponential backoff.
 *
 * Endpoint: POST /serving-endpoints/{endpoint}/invocations
 * Docs: https://docs.databricks.com/en/machine-learning/model-serving/score-foundation-models.html
 */
export async function executeAIQuery(
  options: AIQueryOptions
): Promise<AIQueryResult> {
  const maxRetries = options.retries ?? 2;
  const temperature = options.temperature ?? getDefaultTemperature(options.promptKey);
  const maxTokens = options.maxTokens;
  const promptVersion = PROMPT_VERSIONS[options.promptKey] ?? "unknown";

  // Pre-render the prompt once for logging (executeAIQueryOnce also renders it,
  // but we need it here to log on both success and failure paths)
  const renderedPrompt = options.runId
    ? formatPrompt(options.promptKey, options.variables)
    : "";

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        logger.info("FMAPI retrying", {
          promptKey: options.promptKey,
          attempt,
          maxRetries,
          backoffMs,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      const result = await executeAIQueryOnce(options, temperature, maxTokens);

      // Fire-and-forget: log successful call
      if (options.runId) {
        insertPromptLog({
          logId: randomUUID(),
          runId: options.runId,
          step: options.step ?? options.promptKey,
          promptKey: options.promptKey,
          promptVersion,
          model: options.modelEndpoint,
          temperature,
          renderedPrompt,
          rawResponse: result.rawResponse,
          honestyScore: result.honestyScore,
          durationMs: result.durationMs,
          tokenUsage: result.tokenUsage,
          success: true,
          errorMessage: null,
        });
      }

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn("FMAPI attempt failed", {
        promptKey: options.promptKey,
        attempt: attempt + 1,
        maxRetries,
        error: lastError.message,
      });

      // Don't retry on client errors (4xx) -- these are non-retryable
      if (isNonRetryableError(lastError)) {
        break;
      }
    }
  }

  // Fire-and-forget: log failed call (after all retries exhausted)
  if (options.runId && lastError) {
    insertPromptLog({
      logId: randomUUID(),
      runId: options.runId,
      step: options.step ?? options.promptKey,
      promptKey: options.promptKey,
      promptVersion,
      model: options.modelEndpoint,
      temperature,
      renderedPrompt,
      rawResponse: null,
      honestyScore: null,
      durationMs: null,
      tokenUsage: null,
      success: false,
      errorMessage: lastError.message,
    });
  }

  throw lastError ?? new Error(`FMAPI call failed for ${options.promptKey}`);
}

/**
 * Check if an error is non-retryable (4xx client errors).
 * Only retry on 5xx, timeouts, and network errors.
 */
function isNonRetryableError(error: Error): boolean {
  // Direct status code check for ModelServingError
  if (error instanceof ModelServingError) {
    return error.statusCode >= 400 && error.statusCode < 500;
  }

  const msg = error.message;
  // Match HTTP 4xx status codes in error messages
  const httpStatusMatch = msg.match(/\((\d{3})\)/);
  if (httpStatusMatch) {
    const status = parseInt(httpStatusMatch[1], 10);
    if (status >= 400 && status < 500) return true;
  }
  // Check for specific non-retryable error patterns
  if (msg.includes("INSUFFICIENT_PERMISSIONS")) {
    return true;
  }
  return false;
}

/**
 * Execute a single LLM call via the Databricks Model Serving chat
 * completions endpoint.
 *
 * Builds messages in the system/user format, sends via FMAPI, and
 * extracts the response content along with token usage metrics.
 */
async function executeAIQueryOnce(
  options: AIQueryOptions,
  temperature: number,
  maxTokens: number | undefined
): Promise<AIQueryResult> {
  const prompt = formatPrompt(options.promptKey, options.variables);
  const promptVersion = PROMPT_VERSIONS[options.promptKey] ?? "unknown";

  // Build chat messages with system/user separation
  const messages: ChatMessage[] = [];

  if (options.systemMessage) {
    messages.push({ role: "system", content: options.systemMessage });
  }

  messages.push({ role: "user", content: prompt });

  const startTime = Date.now();

  logger.info("FMAPI executing", {
    promptKey: options.promptKey,
    promptVersion,
    model: options.modelEndpoint,
    promptChars: prompt.length,
    temperature,
    responseFormat: options.responseFormat ?? "text",
    ...(maxTokens !== undefined && { maxTokens }),
  });

  const response = await chatCompletion({
    endpoint: options.modelEndpoint,
    messages,
    temperature,
    maxTokens,
    responseFormat: options.responseFormat,
  });

  const rawResponse = response.content;
  const durationMs = Date.now() - startTime;

  if (!rawResponse) {
    throw new Error(`FMAPI returned empty response for ${options.promptKey}`);
  }

  const honestyScore = extractHonestyScore(rawResponse);

  logger.info("FMAPI response received", {
    promptKey: options.promptKey,
    promptVersion,
    model: response.model || options.modelEndpoint,
    responseChars: rawResponse.length,
    durationMs,
    honestyScore,
    finishReason: response.finishReason,
    ...(response.usage && {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    }),
  });

  // Warn on low honesty scores
  if (honestyScore !== null && honestyScore < LOW_HONESTY_THRESHOLD) {
    logger.warn("Low honesty score — LLM may be uncertain about output quality", {
      promptKey: options.promptKey,
      honestyScore,
      threshold: LOW_HONESTY_THRESHOLD,
    });
  }

  // Warn if the response was truncated (finish_reason: "length")
  if (response.finishReason === "length") {
    logger.warn("FMAPI response truncated (hit token limit)", {
      promptKey: options.promptKey,
      completionTokens: response.usage?.completionTokens,
    });
  }

  return {
    rawResponse,
    honestyScore,
    promptVersion,
    durationMs,
    tokenUsage: response.usage,
  };
}

// ---------------------------------------------------------------------------
// Streaming Execution
// ---------------------------------------------------------------------------

/**
 * Execute an LLM call with SSE streaming via Databricks Model Serving.
 *
 * Similar to executeAIQuery but streams the response, calling `onChunk`
 * for each content delta. Useful for long-running generations (e.g. SQL)
 * where incremental progress is valuable.
 *
 * Does NOT retry -- streaming calls are typically for single attempts.
 * The caller should handle failures and fall back to non-streaming if needed.
 */
export async function executeAIQueryStream(
  options: AIQueryOptions,
  onChunk?: StreamCallback
): Promise<AIQueryResult> {
  const temperature = options.temperature ?? getDefaultTemperature(options.promptKey);
  const maxTokens = options.maxTokens;
  const promptVersion = PROMPT_VERSIONS[options.promptKey] ?? "unknown";
  const prompt = formatPrompt(options.promptKey, options.variables);

  const messages: ChatMessage[] = [];
  if (options.systemMessage) {
    messages.push({ role: "system", content: options.systemMessage });
  }
  messages.push({ role: "user", content: prompt });

  const startTime = Date.now();

  logger.info("FMAPI streaming executing", {
    promptKey: options.promptKey,
    promptVersion,
    model: options.modelEndpoint,
    promptChars: prompt.length,
    temperature,
  });

  const response = await chatCompletionStream(
    {
      endpoint: options.modelEndpoint,
      messages,
      temperature,
      maxTokens,
      responseFormat: options.responseFormat,
    },
    onChunk
  );

  const rawResponse = response.content;
  const durationMs = Date.now() - startTime;

  if (!rawResponse) {
    throw new Error(`FMAPI streaming returned empty response for ${options.promptKey}`);
  }

  const honestyScore = extractHonestyScore(rawResponse);

  logger.info("FMAPI streaming response complete", {
    promptKey: options.promptKey,
    promptVersion,
    model: response.model || options.modelEndpoint,
    responseChars: rawResponse.length,
    durationMs,
    finishReason: response.finishReason,
    ...(response.usage && {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    }),
  });

  // Log to prompt audit trail
  if (options.runId) {
    insertPromptLog({
      logId: randomUUID(),
      runId: options.runId,
      step: options.step ?? options.promptKey,
      promptKey: options.promptKey,
      promptVersion,
      model: options.modelEndpoint,
      temperature,
      renderedPrompt: prompt,
      rawResponse,
      honestyScore,
      durationMs,
      tokenUsage: response.usage,
      success: true,
      errorMessage: null,
    });
  }

  return {
    rawResponse,
    honestyScore,
    promptVersion,
    durationMs,
    tokenUsage: response.usage,
  };
}

// ---------------------------------------------------------------------------
// Response Parsers
// ---------------------------------------------------------------------------

/**
 * Parse a CSV response from the LLM into rows of string arrays.
 * Handles quoted fields and malformed rows gracefully.
 */
export function parseCSVResponse(
  rawResponse: string,
  expectedColumns: number
): string[][] {
  const cleaned = cleanCSVResponse(rawResponse);
  const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);

  const rows: string[][] = [];
  for (const line of lines) {
    const fields = parseCSVLine(line);
    // Accept rows with roughly the right number of columns
    if (fields.length >= expectedColumns - 2 && fields.length <= expectedColumns + 2) {
      // Pad or trim to expected columns
      while (fields.length < expectedColumns) fields.push("");
      rows.push(fields.slice(0, expectedColumns));
    }
  }

  return rows;
}

/**
 * Parse a JSON response from the LLM.
 */
export function parseJSONResponse<T = Record<string, unknown>>(
  rawResponse: string
): T {
  const cleaned = cleanJSONResponse(rawResponse);
  return JSON.parse(cleaned);
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

function cleanCSVResponse(response: string): string {
  let cleaned = response.trim();
  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:csv)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  // Remove any leading header row that matches common patterns
  const firstLine = cleaned.split("\n")[0];
  if (
    firstLine &&
    (firstLine.toLowerCase().includes("no,") ||
      firstLine.toLowerCase().includes("no, name"))
  ) {
    cleaned = cleaned.substring(cleaned.indexOf("\n") + 1);
  }
  return cleaned.trim();
}

function cleanJSONResponse(response: string): string {
  let cleaned = response.trim();
  // Remove markdown code fences
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "");
  cleaned = cleaned.replace(/\n?```\s*$/i, "");
  // Find the first { or [
  const jsonStart = Math.min(
    cleaned.indexOf("{") === -1 ? Infinity : cleaned.indexOf("{"),
    cleaned.indexOf("[") === -1 ? Infinity : cleaned.indexOf("[")
  );
  if (jsonStart !== Infinity) {
    cleaned = cleaned.substring(jsonStart);
  }
  // Find the last } or ]
  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const jsonEnd = Math.max(lastBrace, lastBracket);
  if (jsonEnd > 0) {
    cleaned = cleaned.substring(0, jsonEnd + 1);
  }
  return cleaned;
}

function extractHonestyScore(response: string): number | null {
  // Try JSON format
  const jsonMatch = response.match(/"honesty_score"\s*:\s*([\d.]+)/);
  if (jsonMatch) return parseFloat(jsonMatch[1]);

  // Try CSV format (last/second-to-last column)
  const csvMatch = response.match(/,(0\.\d+),/);
  if (csvMatch) return parseFloat(csvMatch[1]);

  return null;
}

function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // skip escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        fields.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

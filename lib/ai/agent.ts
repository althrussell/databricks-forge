/**
 * AI Agent -- wrapper for executing ai_query() calls via SQL Warehouse.
 *
 * All LLM interactions go through Databricks ai_query() SQL function.
 * This module builds the SQL, executes it, and parses the response.
 *
 * Features:
 * - Temperature control via modelParameters (low for structured output,
 *   moderate for creative generation)
 * - Automatic retry with exponential backoff (configurable)
 */

import { executeSQL } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";
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
   * Maximum tokens for the response. Passed to modelParameters.
   * Defaults to 8192.
   */
  maxTokens?: number;
  /**
   * Number of retry attempts on failure (default: 1).
   * Set to 0 for no retries.
   */
  retries?: number;
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
}

// ---------------------------------------------------------------------------
// Default temperatures by prompt type
// ---------------------------------------------------------------------------

const CREATIVE_PROMPTS: Set<PromptKey> = new Set([
  "BUSINESS_CONTEXT_WORKER_PROMPT",
  "AI_USE_CASE_GEN_PROMPT",
  "STATS_USE_CASE_GEN_PROMPT",
  "BASE_USE_CASE_GEN_PROMPT",
  "SUMMARY_GEN_PROMPT",
]);

function getDefaultTemperature(promptKey: PromptKey): number {
  return CREATIVE_PROMPTS.has(promptKey) ? 0.5 : 0.2;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute an ai_query() call via SQL and return the raw LLM response.
 *
 * Uses modelParameters for temperature and max_tokens control.
 * Retries on transient failures with exponential backoff.
 *
 * Syntax: SELECT ai_query(endpoint, request, modelParameters => ...)
 * See: https://docs.databricks.com/sql/language-manual/functions/ai_query
 */
export async function executeAIQuery(
  options: AIQueryOptions
): Promise<AIQueryResult> {
  const maxRetries = options.retries ?? 1;
  const temperature = options.temperature ?? getDefaultTemperature(options.promptKey);
  const maxTokens = options.maxTokens ?? 8192;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        logger.info("ai_query retrying", {
          promptKey: options.promptKey,
          attempt,
          maxRetries,
          backoffMs,
        });
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }

      return await executeAIQueryOnce(options, temperature, maxTokens);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.warn("ai_query attempt failed", {
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

  throw lastError ?? new Error(`ai_query failed for ${options.promptKey}`);
}

/**
 * Check if an error is non-retryable (4xx client errors).
 * Only retry on 5xx, timeouts, and network errors.
 */
function isNonRetryableError(error: Error): boolean {
  const msg = error.message;
  // Match HTTP 4xx status codes in error messages
  const httpStatusMatch = msg.match(/\((\d{3})\)/);
  if (httpStatusMatch) {
    const status = parseInt(httpStatusMatch[1], 10);
    if (status >= 400 && status < 500) return true;
  }
  // Check for specific non-retryable error patterns
  if (msg.includes("INSUFFICIENT_PERMISSIONS") || msg.includes("SQLSTATE: 42")) {
    return true;
  }
  return false;
}

async function executeAIQueryOnce(
  options: AIQueryOptions,
  temperature: number,
  maxTokens: number
): Promise<AIQueryResult> {
  const prompt = formatPrompt(options.promptKey, options.variables);
  const promptVersion = PROMPT_VERSIONS[options.promptKey] ?? "unknown";

  // Escape the prompt for SQL string literal (single quotes and backslashes)
  const escapedPrompt = prompt.replace(/\\/g, "\\\\").replace(/'/g, "''");

  const sql = `
    SELECT ai_query(
      '${options.modelEndpoint}',
      '${escapedPrompt}',
      modelParameters => named_struct(
        'temperature', ${temperature.toFixed(2)},
        'max_tokens', ${maxTokens}
      )
    ) AS response
  `;

  const startTime = Date.now();

  logger.info("ai_query executing", {
    promptKey: options.promptKey,
    promptVersion,
    model: options.modelEndpoint,
    promptChars: prompt.length,
    temperature,
    maxTokens,
  });

  const result = await executeSQL(sql);

  if (result.rows.length === 0 || !result.rows[0][0]) {
    throw new Error(`ai_query returned no response for ${options.promptKey}`);
  }

  const rawResponse = result.rows[0][0];
  const durationMs = Date.now() - startTime;

  const honestyScore = extractHonestyScore(rawResponse);

  logger.info("ai_query response received", {
    promptKey: options.promptKey,
    promptVersion,
    model: options.modelEndpoint,
    responseChars: rawResponse.length,
    durationMs,
    honestyScore,
  });

  // Warn on low honesty scores
  if (honestyScore !== null && honestyScore < LOW_HONESTY_THRESHOLD) {
    logger.warn("Low honesty score — LLM may be uncertain about output quality", {
      promptKey: options.promptKey,
      honestyScore,
      threshold: LOW_HONESTY_THRESHOLD,
    });
  }

  return { rawResponse, honestyScore, promptVersion, durationMs };
}

// ---------------------------------------------------------------------------
// Response Parsers
// ---------------------------------------------------------------------------

/**
 * Parse a CSV response from ai_query into rows of string arrays.
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
 * Parse a JSON response from ai_query.
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

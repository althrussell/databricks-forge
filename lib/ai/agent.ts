/**
 * AI Agent -- wrapper for executing ai_query() calls via SQL Warehouse.
 *
 * All LLM interactions go through Databricks ai_query() SQL function.
 * This module builds the SQL, executes it, and parses the response.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { formatPrompt, type PromptKey } from "./templates";

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
   * Maximum tokens for the response.
   * @deprecated ai_query() no longer accepts maxTokens as a parameter.
   * Kept for interface compatibility but ignored.
   */
  maxTokens?: number;
}

export interface AIQueryResult {
  /** Raw response text from the LLM */
  rawResponse: string;
  /** Extracted honesty score (if present) */
  honestyScore: number | null;
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * Execute an ai_query() call via SQL and return the raw LLM response.
 *
 * Syntax: SELECT ai_query(endpoint, request)
 * See: https://docs.databricks.com/sql/language-manual/functions/ai_query
 */
export async function executeAIQuery(
  options: AIQueryOptions
): Promise<AIQueryResult> {
  const prompt = formatPrompt(options.promptKey, options.variables);

  // Escape the prompt for SQL string literal
  const escapedPrompt = prompt.replace(/'/g, "''");

  const sql = `
    SELECT ai_query(
      '${options.modelEndpoint}',
      '${escapedPrompt}'
    ) AS response
  `;

  console.log(
    `[ai_query] Executing prompt: ${options.promptKey} (${prompt.length} chars)`
  );

  const result = await executeSQL(sql);

  if (result.rows.length === 0 || !result.rows[0][0]) {
    throw new Error(`ai_query returned no response for ${options.promptKey}`);
  }

  const rawResponse = result.rows[0][0];

  console.log(
    `[ai_query] Response received: ${options.promptKey} (${rawResponse.length} chars)`
  );

  const honestyScore = extractHonestyScore(rawResponse);

  return { rawResponse, honestyScore };
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

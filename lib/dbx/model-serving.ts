/**
 * Databricks Foundation Model API (FMAPI) client.
 *
 * Provides a thin wrapper around the Model Serving chat completions endpoint.
 * Replaces the previous ai_query() SQL path with direct REST calls, giving:
 *   - Lower latency (no SQL warehouse overhead or polling)
 *   - Structured output via response_format (JSON mode)
 *   - Token usage metrics for cost tracking
 *   - System/user message separation for better prompt hygiene
 *   - Streaming support (SSE) for long-running generations
 *
 * Auth uses getAppHeaders() (service principal / PAT) since model-serving
 * scopes are not available in user authorization tokens.
 *
 * Endpoint: POST {host}/serving-endpoints/{endpoint}/invocations
 * OpenAI-compatible chat completions format.
 *
 * Docs: https://docs.databricks.com/en/machine-learning/model-serving/score-foundation-models.html
 */

import { getConfig, getAppHeaders } from "./client";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single message in the chat completions format. */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Options for a chat completion request. */
export interface ChatCompletionOptions {
  /** Model serving endpoint name (e.g. "databricks-claude-opus-4-6"). */
  endpoint: string;
  /** Messages to send (system + user). */
  messages: ChatMessage[];
  /** Sampling temperature (0.0 - 1.0). */
  temperature?: number;
  /** Maximum tokens for the response. When omitted, uses model default. */
  maxTokens?: number;
  /**
   * Response format hint. When set to "json_object", instructs the model to
   * return valid JSON. The prompt must also mention JSON output.
   */
  responseFormat?: "text" | "json_object";
}

/** Token usage statistics returned by the model. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Response from a chat completion request. */
export interface ChatCompletionResponse {
  /** The generated text content. */
  content: string;
  /** Token usage statistics (if available). */
  usage: TokenUsage | null;
  /** The model identifier that served the request. */
  model: string;
  /** The finish reason (e.g. "stop", "length"). */
  finishReason: string | null;
}

/** Callback invoked for each chunk during streaming. */
export type StreamCallback = (chunk: string) => void;

// ---------------------------------------------------------------------------
// Timeouts
// ---------------------------------------------------------------------------

/**
 * LLM inference can take 1-3+ minutes for complex prompts.
 * This timeout covers the entire request lifecycle (non-streaming).
 */
const LLM_TIMEOUT_MS = 300_000; // 5 minutes

/**
 * Streaming requests get a longer timeout since data arrives incrementally.
 */
const LLM_STREAM_TIMEOUT_MS = 600_000; // 10 minutes

// ---------------------------------------------------------------------------
// Chat Completions (non-streaming)
// ---------------------------------------------------------------------------

/**
 * Send a chat completion request to a Databricks Model Serving endpoint.
 *
 * Uses the OpenAI-compatible `/serving-endpoints/{endpoint}/invocations`
 * path with the chat completions payload format.
 */
export async function chatCompletion(
  options: ChatCompletionOptions
): Promise<ChatCompletionResponse> {
  const { host } = getConfig();
  const url = `${host}/serving-endpoints/${options.endpoint}/invocations`;

  const headers = await getAppHeaders();
  const body: Record<string, unknown> = {
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
  };

  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens;
  }

  // Note: response_format is NOT sent. Claude models on Databricks FMAPI do
  // not support { type: "json_object" }. Instead, all prompts include explicit
  // JSON output instructions which Claude follows reliably.

  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    LLM_TIMEOUT_MS
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new ModelServingError(
      `Model Serving request failed (${resp.status}): ${text}`,
      resp.status
    );
  }

  const data = await resp.json();
  return parseCompletionResponse(data);
}

// ---------------------------------------------------------------------------
// Chat Completions (streaming)
// ---------------------------------------------------------------------------

/**
 * Send a streaming chat completion request.
 *
 * Invokes the same endpoint with `stream: true`. Calls `onChunk` for each
 * content delta as it arrives. Returns the final assembled response with
 * accumulated content and usage stats.
 */
export async function chatCompletionStream(
  options: ChatCompletionOptions,
  onChunk?: StreamCallback
): Promise<ChatCompletionResponse> {
  const { host } = getConfig();
  const url = `${host}/serving-endpoints/${options.endpoint}/invocations`;

  const headers = await getAppHeaders();
  const body: Record<string, unknown> = {
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    stream: true,
  };

  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens;
  }

  // response_format omitted — see note in chatCompletion()

  const resp = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    LLM_STREAM_TIMEOUT_MS
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new ModelServingError(
      `Model Serving streaming request failed (${resp.status}): ${text}`,
      resp.status
    );
  }

  if (!resp.body) {
    throw new ModelServingError("Streaming response has no body", 0);
  }

  return parseSSEStream(resp.body, onChunk);
}

// ---------------------------------------------------------------------------
// SSE stream parser
// ---------------------------------------------------------------------------

async function parseSSEStream(
  body: ReadableStream<Uint8Array>,
  onChunk?: StreamCallback
): Promise<ChatCompletionResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();

  let content = "";
  let model = "";
  let finishReason: string | null = null;
  let usage: TokenUsage | null = null;
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.model) {
            model = parsed.model;
          }

          const choice = parsed.choices?.[0];
          if (choice) {
            const delta = choice.delta?.content;
            if (delta) {
              content += delta;
              onChunk?.(delta);
            }
            if (choice.finish_reason) {
              finishReason = choice.finish_reason;
            }
          }

          // Usage stats are sent in the final chunk
          if (parsed.usage) {
            usage = {
              promptTokens: parsed.usage.prompt_tokens ?? 0,
              completionTokens: parsed.usage.completion_tokens ?? 0,
              totalTokens: parsed.usage.total_tokens ?? 0,
            };
          }
        } catch {
          // Skip malformed SSE data lines
          logger.debug("Skipping malformed SSE chunk", { data });
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return { content, usage, model, finishReason };
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

function parseCompletionResponse(
  data: Record<string, unknown>
): ChatCompletionResponse {
  const choices = data.choices as Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;

  const content = choices?.[0]?.message?.content ?? "";
  const finishReason = choices?.[0]?.finish_reason ?? null;
  const model = (data.model as string) ?? "";

  const rawUsage = data.usage as
    | { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
    | undefined;

  const usage: TokenUsage | null = rawUsage
    ? {
        promptTokens: rawUsage.prompt_tokens ?? 0,
        completionTokens: rawUsage.completion_tokens ?? 0,
        totalTokens: rawUsage.total_tokens ?? 0,
      }
    : null;

  return { content, usage, model, finishReason };
}

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class ModelServingError extends Error {
  /** HTTP status code from the Model Serving endpoint. */
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ModelServingError";
    this.statusCode = statusCode;
  }
}

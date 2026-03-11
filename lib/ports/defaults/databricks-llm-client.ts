/**
 * Default Databricks LLM client implementation.
 *
 * Wraps `cachedChatCompletion` (retry + rate-limit + cache) and
 * `chatCompletionStream` from `@/lib/dbx/model-serving`.
 */

import { cachedChatCompletion } from "@/lib/toolkit/llm-cache";
import { chatCompletionStream } from "@/lib/dbx/model-serving";
import type { LLMClient, LLMRequestOptions, LLMResponse, StreamCallback } from "../llm-client";

export const databricksLLMClient: LLMClient = {
  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const resp = await cachedChatCompletion({
      endpoint: options.endpoint,
      messages: options.messages,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      responseFormat: options.responseFormat,
      signal: options.signal,
    });
    return {
      content: resp.content,
      usage: resp.usage,
      model: resp.model,
      finishReason: resp.finishReason,
    };
  },

  async chatStream(options: LLMRequestOptions, onChunk?: StreamCallback): Promise<LLMResponse> {
    const resp = await chatCompletionStream(
      {
        endpoint: options.endpoint,
        messages: options.messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        responseFormat: options.responseFormat,
        signal: options.signal,
      },
      onChunk,
    );
    return {
      content: resp.content,
      usage: resp.usage,
      model: resp.model,
      finishReason: resp.finishReason,
    };
  },
};

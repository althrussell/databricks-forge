# Release Notes -- 2026-03-07

**Databricks Forge AI v0.12.1**

---

## Improvements

### LLM 429 Rate-Limit Endpoint Fallback

When the primary Model Serving endpoint (`databricks-claude-opus-4-6`) exhausts its 429 retry budget, the app now automatically falls back to the review endpoint (`databricks-gpt-5-4`) instead of failing the operation. This applies to:

- **Genie Engine** (`lib/genie/llm-cache.ts`) -- all `cachedChatCompletion` calls
- **Pipeline agent** (`lib/ai/agent.ts`) -- both `executeAIQuery` (non-streaming) and `executeAIQueryStream` (streaming) calls

A new centralized `getFallbackEndpoint()` helper in `lib/dbx/client.ts` resolves the alternate endpoint, preferring the review endpoint and avoiding self-fallback loops. The fallback gets a small retry budget (2 attempts, 5s backoff) to avoid long delays.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `3dd4ce5` | Add 429 rate-limit endpoint fallback to review model |

**Uncommitted changes:** None.

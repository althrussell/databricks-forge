# Release Notes -- 2026-03-13

**Databricks Forge v0.31.1**

---

## Bug Fixes

- **Reasoning model content parsing** -- Fixed `e.replace is not a function` and `e.trim is not a function` crashes when Gemini 3 models return array-of-blocks content (reasoning + text blocks) instead of a plain string. New `extractContentText()` safely extracts text from both formats.

- **JSON mode 400 errors** -- Replaced string-matching `supportsJsonResponseFormat()` with a registry-backed lookup. Only GPT-5.x models (verified `supportsJsonMode: true`) now receive `response_format: json_object`. Gemini, Llama, and Claude models no longer trigger `400 BAD_REQUEST` from unsupported JSON mode requests.

- **maxTokens exceeds model limit** -- Added automatic token clamping in both `chatCompletion` and `chatCompletionStream`. Requests for 12288 tokens to Gemini Flash Lite (max 8192) are now silently clamped instead of returning `400 BAD_REQUEST`.

- **GPT-5.4 empty responses (finishReason=length)** -- Doubled the SQL reviewer per-item token budget (1024->2048 review, 2048->4096 fix) and added a 16384 token floor. GPT-5.4's hidden reasoning tokens no longer exhaust the budget before producing visible output.

- **Unknown model rejection** -- `templateFor()` now returns `null` for unrecognised models, and `buildPool()` skips them with a warning log. Prevents undefined-capability models from entering the pool with permissive defaults.

- **Codex model removal** -- Removed `databricks-gpt-5-3-codex` from `KNOWN_MODELS`. All Codex models require the Responses API (AI Gateway beta only) and are not supported until GA.

---

## Improvements

### Per-call model observability
Every `chatCompletion` call now logs the endpoint, requested maxTokens, JSON mode, and model capabilities. `resolveEndpoint` logs tier, chosen endpoint, and resolution source at debug level. All Genie Engine passes (semantic expressions, trusted assets, benchmarks, column intelligence, instructions) include the endpoint in their status logs.

### Verified model capability registry
`KNOWN_MODELS` in `model-registry.ts` now includes `supportsJsonMode` and `maxOutputTokens` for every supported model, sourced from Databricks documentation. New `getModelCapabilities()` public API enables any module to query model limits. Pool startup summary now includes JSON mode support and max output tokens per endpoint.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `a95199e` | fix: model compatibility guards -- content parsing, JSON mode gate, token clamping, and per-call logging |

**Uncommitted changes:** Version bump to 0.31.1, release notes.

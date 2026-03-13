# Release Notes -- 2026-03-13

**Databricks Forge v0.29.2**

---

## Bug Fixes

- **Metric view placeholder catalog references** -- The LLM sometimes copied the literal `catalog.schema` placeholder from the prompt examples into generated DDL, causing `NO_SUCH_CATALOG_EXCEPTION` dry-run failures. The prompt now injects the real catalog.schema scope, and a post-processing safety net replaces any residual placeholders.
- **Trusted-asset batch review parse failures** -- Batch review responses for trusted assets failed to parse 100% of the time due to output truncation and minimal JSON parsing. Replaced `JSON.parse` with `parseLLMJson` (handles truncation recovery, preamble stripping, malformed JSON) and doubled `maxTokens` per item when `requestFix` is true.
- **Metric view dry-run timeout risk** -- `dryRunMetricViewDdl` used default SQL timeouts allowing up to ~10 minutes of polling per proposal. Now uses explicit 30s `waitTimeout` and 35s `submitTimeoutMs` to prevent domain-blocking hangs.

---

## Improvements

### SQL Review 429 Overflow Routing
When the `sql`-tier review endpoint (`databricks-gpt-5-4`) enters 429 backoff, the task router now overflows to any unblocked pool endpoint instead of queuing behind the 60s circuit breaker. This allows Claude models to absorb review load during rate-limit storms.

### Global SQL Review Concurrency Limiter
Added a cross-domain concurrency cap (4 concurrent) on all `reviewChatCompletion` calls. With 8+ domains running reviews in parallel, this prevents burst pressure on the review endpoint and reduces 429 activations.

### Post-Dry-Run LLM Repair Loop
Metric view proposals that pass static validation but fail dry-run with repairable errors (e.g. `METRIC_VIEW_INVALID_VIEW_DEFINITION`, `UNRESOLVED_COLUMN`) now get a second-chance LLM repair attempt. The repaired DDL is re-validated and re-dry-run before acceptance.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `21eb93d` | fix: Genie Engine metric view quality and review performance |

**Uncommitted changes:** Version bump to 0.29.2, release notes.

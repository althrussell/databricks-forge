# Release Notes -- 2026-03-13

**Databricks Forge v0.31.2**

---

## Improvements

### Progressive 429 Backoff (10s / 20s / 30s)
Replaced the flat 60-second rate-limit backoff with a progressive escalation ladder: first 429 triggers a 10-second pause, second escalates to 20 seconds, and third+ caps at 30 seconds. Successful calls immediately reset the counter and lift the block. Saves ~50 seconds per rate-limit incident.

### Gemini 3.1 Flash Lite Promoted to Generation Tier
Flash Lite is now the preferred model for all generation tasks (trusted assets, metric views, benchmarks, example queries) in addition to classification and lightweight tiers. Llama Maverick is demoted to overflow/backup (priority 1). Based on testing, Flash Lite is both faster and higher quality.

### Trusted Asset Prompt Rework for 8K Models
Condensed the trusted assets system prompt by ~50%, reduced batch size from 3 to 2 use cases per LLM call, and lowered default maxTokens from 12,288 to 6,144. Each batch now produces 1-2 complete parameterized queries that fit comfortably within 8K model output limits, eliminating truncated JSON.

### Metric View YAML-Only Output
The LLM now returns only the YAML body for metric view proposals; the DDL wrapper (`CREATE OR REPLACE VIEW ... WITH METRICS LANGUAGE YAML AS $$ ... $$`) is built programmatically via the new `buildMetricViewDdl()` helper. This halves output token usage per proposal. The YAML spec reference embedded in the prompt was condensed from ~140 lines to ~30 lines. Max proposals reduced from 3 to 2 per subdomain.

### Lower Concurrency Caps for Rate-Limit-Prone Models
Reduced max concurrent requests: Llama Maverick 10→6, GPT-5.4 6→4, Gemini Flash 8→8 (unchanged). Prevents 429 storms on pay-per-token endpoints with tight per-second output token limits.

### Quality Preset Token Budget Reductions
All three quality presets now use token budgets that fit within the 8,192-token output ceiling of the majority of pool models:
- **Balanced**: trustedAssets 12,288→6,144, benchmarks 6,144→4,096
- **Speed**: trustedAssets 8,192→4,096, benchmarks 4,096→3,072
- **Premium**: trustedAssets 32,768→8,192, benchmarks 8,192→6,144

### Column Intelligence and Benchmark Default maxTokens Lowered
Hardcoded maxTokens in column intelligence (12,288→6,144) and benchmark generation (8,192→6,144) now leave headroom within 8K model limits. These defaults are used by the ad-hoc Genie Engine which bypasses quality preset budgets.

### 429 Diagnostics: Raw Retry-After Header Logging
Both regular and streaming LLM call paths now log the raw `Retry-After` header value (or `(none)`) on 429 responses, confirming whether Databricks sends one and enabling future tuning of backoff parameters.

---

## Commits (1)

| Hash | Summary |
|---|---|
| (pending) | fix: progressive 429 backoff, Flash Lite generation tier, prompt rework for 8K models |

**Uncommitted changes:** None.

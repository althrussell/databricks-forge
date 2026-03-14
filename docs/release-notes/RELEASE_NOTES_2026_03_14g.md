# Release Notes -- 2026-03-14

**Databricks Forge v0.34.3**

---

## Improvements

### Research Engine speed optimization for balanced preset

The balanced research preset now routes LLM calls through generation-tier
models (Claude Sonnet 4.6, Gemini Flash, Llama Maverick) instead of
hardcoding to Claude Opus 4.6. This reduces wall-clock time from ~8.5
minutes to ~2-3 minutes for a typical balanced run. The full preset retains
reasoning-tier (Opus) routing for maximum quality.

Key changes:

- Added per-preset `modelTier` to `ResearchBudget` (quick=classification,
  balanced=generation, full=reasoning).
- Refactored `resolveResearchEndpoint()` to accept an optional tier,
  delegating non-reasoning tiers to the queue-depth-aware task router.
- Lowered balanced `maxTokensPerPass` from 32,000 to 16,000 (outputs are
  structured JSON that rarely exceeds 8K tokens).
- Parallelized embedding with the industry classification and outcome map
  pipeline to eliminate serial wait.

---

## Bug Fixes

- **Enrichment-only generation used reasoning tier** -- `runEnrichmentOnlyGeneration` documented "uses the generation tier (faster)" but actually called the reasoning endpoint. Now correctly routes to generation tier.
- **Industry classification used reasoning tier** -- A 512-token classification task was being sent to Opus. Now always routes to classification tier regardless of budget.

---

## Commits (1)

| Hash | Summary |
|---|---|
| *(uncommitted)* | perf: research engine speed -- tiered model routing, lower token budgets, parallel embedding |

**Uncommitted changes:** `lib/demo/types.ts`, `lib/demo/research-engine/resolve-endpoint.ts`, `lib/demo/research-engine/engine.ts`, and 8 pass files updated with `modelTier` threading.

# Release Notes -- 2026-03-13

**Databricks Forge v0.31.0**

---

## New Features

### Quality Preset System
User-configurable Speed / Balanced / Premium presets that control the Genie Engine's speed-vs-richness trade-off. Each preset defines a `GenerationBudget` governing target counts for measures, filters, dimensions, trusted assets, and benchmarks, along with domain concurrency, review surface enablement, and maxTokens per LLM call. The default preset is **Balanced**. Accessible from the Settings page under the Genie Engine section.

### Performance Model Bundle
Three new high-throughput models added to the model registry: `databricks-gemini-3-1-flash-lite` (priority 0, classification + lightweight), `databricks-llama-4-maverick` (priority 0, generation + classification), and `databricks-gemini-3-flash` (priority 1, generation + classification + lightweight). A new `DATABRICKS_SERVING_ENDPOINT_LIGHTWEIGHT` env var and `--lightweight-endpoint` deploy flag bind the 7th model slot.

---

## Improvements

### Budget-Driven Generation
All Genie Engine passes (semantic expressions, trusted assets, benchmarks) now accept budget parameters instead of using hardcoded target counts and maxTokens. Worker A/B/C prompts, use case caps, and benchmarks-per-batch are all driven by the resolved budget.

### Right-Sized Output
Speed preset generates lean spaces (4 measures A / 2 measures B / 4 filters / 4 dimensions, 3 concurrent domains, metric views disabled). Premium produces maximum richness (15/10/12/12, 10 concurrent domains, all review surfaces enabled). Balanced sits in the middle as the recommended default.

### Cross-Surface Wiring
Quality preset flows through the pipeline Genie workbench, ad-hoc Genie engine (Scan Schema, Upload Requirements), and Ask Forge conversational builder. All surfaces respect the user's chosen preset.

---

## Bug Fixes
- **Metric view dry-run collision** -- Parallel dry-runs could create `TABLE_OR_VIEW_ALREADY_EXISTS` errors due to identical temp table names. Fixed by appending a UUID suffix to the temp table name.
- **SQL review maxTokens cap** -- Batch review calls were capped at 16,384 tokens, causing truncation on large batches. Increased to 32,768.

---

## Other Changes
- Deploy script updated with `--lightweight-endpoint` flag, resource binding, env var injection, and success banner.
- Model registry tests expanded with 5 new test cases for performance bundle models (15/15 passing).
- AGENTS.md updated to document quality presets, `GenerationBudget`, performance bundle, and the lightweight endpoint deploy flag.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `2cff418` | feat: quality preset system with performance model bundle |

**Uncommitted changes:** Version bump to 0.31.0, this release notes file.

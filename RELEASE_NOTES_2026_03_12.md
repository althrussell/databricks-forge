# Release Notes -- 2026-03-12

**Databricks Forge v0.26.0**

---

## New Features

### Three-Space Architecture for Auto-Improve
The auto-improve loop now creates production/dev-best/dev-working space clones for safe iteration. Improvements are promoted, regressions are automatically rolled back. The original production space is never modified during the improvement cycle.

### Sequential Fix Evaluation
New `applyFixesSequentially()` mode applies fixes one at a time with re-scoring after each. Improvements are kept, regressions are rolled back to the dev-best baseline, enabling granular control over which changes actually help.

### Category-Based Enhancement Analysis
New two-step LLM analysis (`category-analysis.ts`) reviews all benchmark results holistically before diagnosing failures per-category (instructions, measures, joins, examples, synonyms, benchmarks). Produces targeted fix recommendations with token-aware config slicing.

### Pre-Deploy Config Review Agent
`runPreDeployReview()` in `deploy-validation.ts` performs comprehensive quality analysis before space deployment: instruction quality, join completeness, example coverage, semantic richness, column descriptions, and benchmark presence. Returns severity-graded findings with deploy recommendations.

### Model Pool Rotation
Enhanced LLM retry logic in `llm-cache.ts` now rotates through all available fallback endpoints (including `DATABRICKS_FALLBACK_ENDPOINTS` env var) on 429 rate-limit exhaustion, instead of trying only one fallback.

---

## Improvements

### Delete-Before-Add Fix Ordering
Space fixer now applies delete strategies (remove bad synonyms, measures, joins, examples) before add strategies, preventing conflicting content from poisoning new additions. Five new delete strategies: `delete_bad_synonyms`, `delete_bad_measures`, `delete_bad_joins`, `delete_bad_examples`, `replace_instructions`.

### Concurrent Benchmark Execution
Benchmark runner now supports bounded-concurrency execution via `concurrency` option. Set >1 to run multiple Genie conversations in parallel for faster scoring cycles.

### Struct Field Awareness
Schema context blocks now expand STRUCT and MAP column types to show nested field paths (up to 2 levels deep), giving LLMs richer understanding of complex data structures.

### APPROX_COUNT_DISTINCT in Data Profiling
Schema scanner now uses `APPROX_COUNT_DISTINCT` instead of `COUNT(DISTINCT)` for data profiling, significantly faster on large tables with minimal accuracy impact.

### Dynamic Token Budget
`buildSchemaContextBlock()` now auto-scales the character budget based on schema size: small schemas (<=10 tables) get 80K chars, large schemas (100+ tables) get 20K chars, preventing context overflow.

### Phantom Table Filtering
Schema scanner cross-checks `information_schema` results against `SHOW TABLES` to filter out stale/phantom table entries that no longer exist.

### Sample Row Extraction
New `sampleTableRows()` and `buildSampleDataBlock()` utilities in schema scanner for fetching and formatting sample data, gated by the `sampleRowsPerTable` setting.

### Configurable Indexing Wait
Auto-improve loop now waits a configurable duration (`indexingWaitMs`, default 30s) after applying fixes before re-scoring, allowing Genie's internal indexes to update.

### Genie Best Practices Reference
New "Genie Space Best Practices" chunk added to the `genie-design` skill covering the priority-ordered rules for building production-quality spaces.

---

## Other Changes
- Instruction consolidation strategy merges multiple fragmented instruction blocks into one
- Fix strategy ordering follows canonical delete-before-add sequence
- Schema context block includes truncation indicator for large schemas
- Category analysis runs with bounded concurrency (3 parallel categories)
- Endpoint pool builder de-duplicates fallback targets

---

## Commits (1)

| Hash | Summary |
|---|---|
| `dcd3ebf` | feat: Genie Studio enhancement loop -- 16 competitive gaps bridged |

**Uncommitted changes:** Version bump to 0.26.0, updated release notes.

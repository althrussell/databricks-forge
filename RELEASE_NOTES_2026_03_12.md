# Release Notes -- 2026-03-12

**Databricks Forge v0.27.0**

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

### Scan Schema Build Progress Dashboard
After starting a Genie Space build from Scan Schema (or Upload Requirements), the Genie Studio dashboard now shows a live "Building" tile with a pulsing AI icon, progress percentage, table count, and a cancel button. Previously the toast disappeared and there was no visibility into running builds.

### Generate Job Cancellation
Full-mode Genie Space generation can now be cancelled via a dashboard button or `DELETE /api/genie-spaces/generate?jobId=X`. Uses `AbortController` signal propagation through the ad-hoc engine.

### Structured Configuration Preview
The Configuration Preview (used by Fix and Improve flows) now shows a human-readable section-by-section comparison instead of raw JSON. Sections include Tables, Sample Questions, Joins, Measures, Filters, Expressions, Example SQL Queries, and Benchmarks -- each with added/removed item counts. Raw JSON is available via a collapsible "Advanced" toggle for power users.

### Table Reference Classification in Ask Forge
The Referenced Tables panel in Ask Forge now classifies tables as **direct** (mentioned in enrichment data), **lineage** (upstream/downstream of a direct table), or **implied** (found via regex scan). Tables are sorted by type with colour-coded badges, and summary counts appear at the top.

### Format Assistance and Entity Matching for Genie Columns
The Genie assembler now automatically enables `enable_format_assistance` and `enable_entity_matching` on columns that are entity matching candidates (bounded-cardinality string columns). PII/sensitive columns and format-candidate columns (day_of_week, month_name, quarter, status, category, severity, etc.) also get `enable_format_assistance` turned on. This improves Genie's ability to understand user queries that reference display values.

---

## Bug Fixes

- **JSON Parse Error on Space Creation** -- Fixed "Unexpected token 'u', 'upstream r'..." crash caused by calling `res.json()` on proxy error responses (plain-text bodies like "upstream request timeout"). Added `parseErrorResponse()` and `safeJsonParse()` helpers to `lib/error-utils.ts` and replaced all unsafe patterns across 8 client-side files.

- **OBO Token Authentication for Genie API** -- Fixed 403 PERMISSION_DENIED errors when applying fixes or cloning Genie Spaces. Changed `getSpaceAuthMode()` default from `"sp"` (Service Principal) to `"obo"` (On Behalf Of user). Extended `createGenieSpace()`/`updateGenieSpace()` with optional `oboToken` parameter for background tasks. Auto-improve and clone routes now capture the user's OBO token at request time and forward it through background operations.

- **Collapsed Context Panel Regression** -- Fixed the Ask Forge context panel defaulting all sections (tables, lineage, sources) to expanded. Lineage and Sources sections now start collapsed; only Referenced Tables is open by default.

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

### Shared PII Pattern Utilities
New `lib/toolkit/pii-patterns.ts` module extracts PII column detection and format-assistance candidacy patterns for reuse across the assembler and example query generation.

---

## Other Changes
- Instruction consolidation strategy merges multiple fragmented instruction blocks into one
- Fix strategy ordering follows canonical delete-before-add sequence
- Schema context block includes truncation indicator for large schemas
- Category analysis runs with bounded concurrency (3 parallel categories)
- Endpoint pool builder de-duplicates fallback targets
- `example-query-generation.ts` PII pattern deprecated in favour of shared `lib/toolkit/pii-patterns.ts`
- Generate status API returns all active jobs when called without `jobId` parameter

---

## Commits (2)

| Hash | Summary |
|---|---|
| `dcd3ebf` | feat: Genie Studio enhancement loop -- 16 competitive gaps bridged |
| (pending) | feat: Genie Studio Builder enhancements -- 7 fixes and features |

**Uncommitted changes:** Version bump to 0.27.0, 20 files modified covering JSON parse safety, OBO token auth, entity matching, table reference classification, collapsed panels, build progress tiles, and structured config preview.

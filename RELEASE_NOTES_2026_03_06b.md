# Release Notes -- 2026-03-06

**Databricks Forge AI v0.11.0**

---

## New Features

### Dashboard Filter Widgets
Dashboards now support interactive filter widgets (`filter-multi-select`, `filter-single-select`, `filter-date-range-picker`). The assembler generates a dedicated `PAGE_TYPE_GLOBAL_FILTERS` page when the LLM proposes filter widgets. Counter widgets sharing a dataset with filters automatically switch to `disaggregated: false` mode with aggregation expressions so that filter selections slice the data correctly. Filter candidates are extracted from Genie dimensions and metadata column types.

### Metric View Dashboard Integration
The dashboard prompt now includes a "Metric Views (Governed KPIs)" section when metric view proposals are available from the Genie Engine. The LLM is instructed to prefer metric views for KPI and trend datasets, using `MEASURE()` syntax. Metric view data is parsed from `GenieEngineRecommendation.metricViewProposals` YAML and passed to both the main and ad-hoc dashboard engines.

### EXPLAIN-Based SQL Validation
A new `validateDatasetSql()` function in `lib/dashboard/validation.ts` runs `EXPLAIN` on each dataset SQL query before dashboard assembly, catching column-reference errors and syntax issues that schema-allowlist validation alone cannot detect. Datasets that fail EXPLAIN are dropped, along with any widgets that referenced them. Integrated into both `engine.ts` and `adhoc-engine.ts`.

---

## Improvements

### Recursive CTE Lineage Traversal
Replaced the multi-round-trip BFS loop in `lib/queries/lineage.ts` with a single `WITH RECURSIVE` SQL query. This reduces lineage walking from O(depth) SQL calls to exactly 2 calls (1 accessibility check + 1 recursive CTE) regardless of depth. Supports all three direction modes (upstream, downstream, both) with cycle prevention in the SQL. Falls back gracefully on workspaces without `WITH RECURSIVE` support (requires DBR 17.0+).

---

## Other Changes
- Applied Prettier formatting across the entire codebase for consistent style
- Added 24 new unit tests across 4 test files covering filter widget assembly, prompt output schema, EXPLAIN validation, and recursive lineage queries

---

## Commits (1)

| Hash | Summary |
|---|---|
| `cb39a1e` | Bridge dashboard skills gaps: add filter widgets, metric view integration, EXPLAIN validation, and recursive CTE lineage |

**Uncommitted changes:** Version bump to 0.11.0 in package.json, this release notes file.

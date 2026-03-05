# Release Notes -- 2026-03-05

**Databricks Forge AI v0.6.2**

---

## Improvements

### Metric View Snake_case Naming and Display Names
Metric view dimension and measure `name` fields are now generated as SQL-friendly snake_case identifiers (e.g. `total_revenue`, `order_month`) instead of display-style names with spaces. A new `display_name` field provides the human-readable label, and optional `comment` and `synonyms` fields improve Genie discoverability. The LLM prompt, seed YAML builder, repair prompt, and shadowed-measure validator have all been updated to enforce this convention. A new `autoRenameShadowedMeasures` function deterministically renames measures that shadow source column names by appending an aggregate-derived suffix (e.g. `_total`, `_avg`), eliminating the `NESTED_AGGREGATE_FUNCTION` error without an extra LLM round-trip.

### Fast Genie Engine: LLM-Generated Expressions
The fast (ad-hoc) Genie engine now generates measures, filters, and dimensions via a lightweight LLM call (`generateFastLLMExpressions`) instead of purely rule-based `SUM`/`AVG`-per-numeric-column heuristics. The LLM receives full schema context and domain hints, producing more business-relevant expressions. Each expression is validated against the schema allowlist before inclusion. Falls back to the original rule-based path if the LLM call fails.

### Expanded Key Synonym Dictionary
The canonical join-key synonym dictionary (`lib/genie/key-synonyms.ts`) has been expanded from 5 key groups to 25, covering `account_id`, `employee_id`, `transaction_id`, `invoice_id`, `payment_id`, `region_id`, `category_id`, `project_id`, `policy_id`, `claim_id`, and more. A generic fallback now also matches any shared column ending in `_id` or `_key` across tables, improving automatic join discovery for schemas not covered by the explicit dictionary.

### Time Period Date Column Prioritization
`generateTimePeriods` now prioritizes date columns by business relevance (e.g. `created_at`, `order_date`, `timestamp` rank highest) and caps the number of date columns processed per space (default 6). This prevents time-period explosion on tables with many date columns while ensuring the most useful time dimensions are always included.

### Schema Allowlist: SQL Comment Stripping
`findInvalidIdentifiers` now strips `--` line comments and `/* */` block comments from SQL before scanning for identifier references. Previously, prose in comments (e.g. `-- e.g. some example`) could produce false-positive column validation errors.

### Lineage Table Metadata Enrichment
New `fetchTableInfoBatch` function retrieves `tableType` and `dataSourceFormat` from `information_schema.tables` for lineage-discovered tables. Both the standalone scan and the pipeline enrichment pass now backfill this metadata, allowing the enrichment engine to skip unnecessary DESCRIBE operations on views and foreign tables.

### Smart Enrichment Skipping for Non-Physical Tables
`enrichTablesInBatches` now uses `tableType` from `information_schema.tables` to skip DESCRIBE DETAIL, DESCRIBE TABLE EXTENDED, and DESCRIBE HISTORY for non-physical table types (VIEW, FOREIGN, MATERIALIZED_VIEW). Only Delta-backed physical types (MANAGED, EXTERNAL, STREAMING_TABLE, and shallow clones) undergo full enrichment. Tables with unknown type (e.g. unresolved lineage entries) still attempt all operations as a safe default.

### Quality Gate: Deployment Warning UX
The Genie deployment API routes no longer hard-block requests based on quality gate decisions. Instead, the `GenieBuilderModal` presents a confirmation prompt when deploying a space with quality warnings, giving users the choice to proceed or review diagnostics first.

---

## Bug Fixes

- **Quality gate: missing joins now block deployment** -- `determineQualityGate` returns `"block"` instead of `"warn"` when `no_validated_joins` is present, correctly flagging multi-table spaces without validated joins as undeployable until joins are resolved.
- **column_tags / table_tags incorrect column names** -- `getTableTags` and `getColumnTags` in `lib/queries/metadata-detail.ts` now use the correct `catalog_name` and `schema_name` columns instead of `table_catalog` and `table_schema`, which do not exist on the `information_schema.column_tags` and `information_schema.table_tags` views.

---

## Commits (4)

| Hash | Summary |
|------|---------|
| `9984815` | Enhance metadata fetching and processing for lineage-discovered tables |
| `fe2ae22` | Refactor quality gate handling and enhance deployment logic |
| `1c1017c` | Update quality gate logic and enhance metric view definitions |
| `e7c315d` | Update timestamps for app.yaml and assembler.ts in sync-snapshots |

**Uncommitted changes:** None.

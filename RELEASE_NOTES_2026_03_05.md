# Release Notes -- 2026-03-05

**Databricks Forge AI v0.7.0**

---

## New Features

### Microsoft Fabric / Power BI Connector
A new end-to-end integration for scanning, understanding, and migrating Power BI estates to Databricks-native artifacts. Key capabilities:

- **Connections management** -- Add and test Microsoft Entra ID (Azure AD) service principal connections with AES-256-GCM encrypted secret storage. Supports both Admin Scanner API (tenant-wide) and Per-Workspace API (reduced scope) access levels.
- **Fabric scan engine** -- Orchestrated scanner pulls workspaces, datasets (tables, measures, relationships, expressions), reports (tiles, dataset bindings), and Fabric artifacts (Lakehouses, Warehouses, Dataflows Gen2, etc.) into Lakebase with real-time progress tracking.
- **Migration wizard** -- Sequential 4-step migration pipeline: (1) Gold schema proposal with LLM-enhanced DDL (partitioning, clustering, comments), (2) DAX-to-SQL measure translation with confidence scoring, (3) Lakeview dashboard generation via existing dashboard engine, (4) Genie Space generation via existing Genie engine.
- **Type mapping & name normalization** -- Power BI data types mapped to Databricks Spark SQL types. PBI identifiers (spaces, special chars) normalized to UC-safe snake_case with full name-mapping ledger.
- **DAX-to-SQL translator** -- Hybrid approach: deterministic templates for simple DAX patterns (`SUM`, `COUNT`, `AVERAGE`, `DISTINCTCOUNT`, `CALCULATE` with simple filters) and LLM-assisted translation with confidence scoring for complex expressions.
- **Ask Forge RAG integration** -- Scanned Fabric metadata (datasets, measures, reports, artifacts) are embedded into the vector store. Off-platform resources appear in Ask Forge with a distinct "PBI" badge and yellow provenance styling.
- **Mock fixtures** -- Hardcoded Admin Scanner API response fixture for local development and CI testing without a live Power BI tenant.

### Sidebar Navigation Sections
The left navigation is now organized into four labelled sections -- **Explore**, **Deploy**, **Migrate**, and **Admin** -- separated by subtle dividers. Section labels appear in expanded mode; only divider lines show when collapsed. Empty sections (e.g. disabled features) are hidden automatically.

---

## Improvements

### Ask Forge Multi-SQL Block Navigation
SQL blocks in assistant responses are now tracked as an array, allowing users to navigate between multiple SQL queries within a single answer. The SQL dialog supports indexed block selection.

### Run SQL from Answer Stream
Users can now execute SQL directly from rendered assistant answers via an inline "Run SQL" action, streamlining the explore-to-execute workflow without opening a separate dialog.

### Analyst Persona
The `AssistantPersona` type now includes `"analyst"` alongside `"business"` and `"tech"`. A `VALID_PERSONAS` set validates persona inputs across API routes and the Ask Forge UI. New business-focused suggested questions are included for the analyst role.

### Outcome Map Template Download
The Outcome Map ingest page now offers a downloadable structured markdown template, giving users a clear starting format for creating custom outcome maps.

### Metric View Snake_case Naming and Display Names
Metric view dimension and measure `name` fields are now generated as SQL-friendly snake_case identifiers (e.g. `total_revenue`, `order_month`) instead of display-style names with spaces. A new `display_name` field provides the human-readable label, and optional `comment` and `synonyms` fields improve Genie discoverability. A new `autoRenameShadowedMeasures` function deterministically renames measures that shadow source column names by appending an aggregate-derived suffix (e.g. `_total`, `_avg`), eliminating the `NESTED_AGGREGATE_FUNCTION` error without an extra LLM round-trip.

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

## Commits (6)

| Hash | Summary |
|------|---------|
| `5af5abe` | Enhance Ask Forge SQL handling and improve outcome map functionality |
| `0bf018c` | Refactor persona handling and enhance assistant functionality |
| `6d61a8a` | Increment version to 0.6.2 and update release notes |
| `e7c315d` | Update timestamps for app.yaml and assembler.ts in sync-snapshots |
| `1c1017c` | Update quality gate logic and enhance metric view definitions |
| `fe2ae22` | Refactor quality gate handling and enhance deployment logic |

**Uncommitted changes:** Fabric/PBI connector (connections, scanning, migration), sidebar nav sections, off-platform source badges in Ask Forge, Prisma schema additions, embedding pipeline extensions (`components/assistant/ask-forge-context-panel.tsx`, `components/assistant/source-card.tsx`, `components/pipeline/sidebar-nav.tsx`, `lib/assistant/engine.ts`, `lib/embeddings/compose.ts`, `lib/embeddings/embed-pipeline.ts`, `lib/embeddings/types.ts`, `prisma/schema.prisma`, plus new `app/api/connections/`, `app/api/fabric/`, `app/connections/`, `app/fabric/`, `lib/connections/`, `lib/fabric/`, `lib/lakebase/connections.ts`, `lib/lakebase/fabric-scans.ts`).

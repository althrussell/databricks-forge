# Genie Engine

> Technical guide for the multi-pass, LLM-powered Genie Space generator in
> Databricks Forge AI.

The Genie Engine analyses Unity Catalog metadata, pipeline use cases, and
optional sample data to produce production-grade Databricks Genie Spaces.
Each space includes a complete knowledge store with measures, filters,
dimensions, join relationships, text instructions, trusted assets,
benchmarks, and metric view proposals -- all grounded to the physical schema.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Pipeline Integration](#pipeline-integration)
3. [Engine Passes (0-6)](#engine-passes)
4. [Schema Grounding](#schema-grounding)
5. [Assembler & SerializedSpace v2](#assembler--serializedspace-v2)
6. [Configuration](#configuration)
7. [Global Settings vs Per-Run Config](#global-settings-vs-per-run-config)
8. [Adding Business Context](#adding-business-context)
9. [Entity Matching & Sample Data](#entity-matching--sample-data)
10. [Time Periods & Fiscal Year](#time-periods--fiscal-year)
11. [Trusted Assets](#trusted-assets)
12. [Metric Views](#metric-views)
13. [Benchmarks](#benchmarks)
14. [Conversation API & Testing](#conversation-api--testing)
15. [Deployment](#deployment)
16. [Inline Editing](#inline-editing)
17. [Legacy Fallback](#legacy-fallback)
18. [Best Practices](#best-practices)
19. [Troubleshooting](#troubleshooting)
20. [File Reference](#file-reference)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Genie Workbench UI                     │
│  ┌──────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ Overview  │  │ Engine Config │  │   Space Preview      │  │
│  │ (deploy)  │  │  (per-run)    │  │   (edit, inspect)    │  │
│  └──────────┘  └───────────────┘  └──────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ REST API
┌─────────────────────────▼───────────────────────────────────┐
│                     Genie Engine                            │
│  Pass 0  Table Selection & Domain Grouping                  │
│  Pass 1  Column Intelligence (LLM + entity extraction)      │
│  Pass 2  Semantic SQL Expressions (time periods + LLM)      │
│  Pass 3  Trusted Asset Authoring (queries + UDFs)           │
│  Pass 4  Instruction Generation (context, rules, guidance)  │
│  Pass 5  Benchmark Generation (test questions + SQL)        │
│  Pass 6  Metric View Proposals (YAML + DDL)                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                     Assembler                               │
│  SerializedSpace v2 payload construction                    │
│  Schema allowlist validation on every identifier            │
│  30-table limit enforcement                                 │
└─────────────────────────┬───────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
     Lakebase        Databricks       Space Preview
   (persistence)    Genie API          (UI)
                   (deploy)
```

The engine produces **one Genie Space per business domain**. Domains are
derived from the use cases generated in earlier pipeline steps. Each space
contains every knowledge store object the Databricks Genie API supports.

---

## Pipeline Integration

The Genie Engine runs as **Step 8** of the Forge AI discovery pipeline
(`lib/pipeline/steps/genie-recommendations.ts`). It is triggered automatically
after SQL generation completes.

**Inputs received from earlier steps:**

| Input | Source Step |
|---|---|
| `PipelineRun` (config, business context) | Step 1: Business Context |
| `MetadataSnapshot` (tables, columns, FKs, metric views) | Step 2: Metadata Extraction |
| `UseCase[]` (scored, domain-assigned, with SQL) | Steps 3-7 |
| `SampleDataCache` (optional row samples) | Step 2 (when data sampling enabled) |

**Outputs written to Lakebase:**

- `forge_genie_recommendations` -- one row per domain with the serialized
  space JSON, counts, and engine pass outputs (column enrichments, benchmarks,
  metric view proposals)
- `forge_genie_engine_configs` -- versioned engine config per run

The engine can also be **re-run on demand** from the Genie Workbench UI
via `POST /api/runs/{runId}/genie-engine/generate`. This allows customers to
edit the config and regenerate without re-running the full pipeline.

---

## Engine Passes

### Pass 0: Table Selection & Domain Grouping

**Module:** `lib/genie/passes/table-selection.ts`

Groups use cases by their assigned domain and selects the most relevant
tables for each domain. This pass is deterministic (no LLM calls).

**Logic:**

1. Group use cases by `domain` field
2. For each domain, collect all `tablesInvolved` across its use cases
3. Apply `tableGroupOverrides` from config (manually reassign tables)
4. Rank tables by use-case frequency (how many use cases reference them)
5. Enforce `maxTablesPerSpace` cap (default 25, Genie limit is 30)
6. Identify metric views in the same catalog.schema as domain tables
7. Extract subdomains from use case metadata

**Output:** `DomainGroup[]` -- each with domain name, subdomains, table list,
metric view list, and associated use cases.

### Pass 1: Column Intelligence

**Module:** `lib/genie/passes/column-intelligence.ts`

Analyses columns across all domain tables to produce enrichments (descriptions,
synonyms, hidden flags) and identify entity matching candidates.

**Two sub-phases:**

1. **Entity extraction** (`lib/genie/entity-extraction.ts`) -- identifies
   columns suitable for Genie's entity matching feature. Uses sample data
   when available; falls back to schema heuristics. Criteria: string type,
   bounded cardinality (<=100 distinct values), not PII, not UUID-like.

2. **LLM enrichment** (when `llmRefinement` is on) -- sends a batch of
   column names + types + sample values to the model and asks for business
   descriptions, synonyms, and hidden recommendations.

**Output:** `ColumnEnrichment[]` and `EntityMatchingCandidate[]`.

Column enrichments flow into the assembler where they become column-level
metadata on `data_sources.tables[].columns[]` in the serialized space.

### Pass 2: Semantic SQL Expressions

**Module:** `lib/genie/passes/semantic-expressions.ts`

Generates SQL snippets for the knowledge store: measures (aggregates),
filters (WHERE clauses), and dimensions (GROUP BY expressions).

**Three sources combined:**

1. **Auto time periods** (`lib/genie/time-periods.ts`) -- standard date
   filters (Last 7/30/90 Days, MTD, QTD, YTD, Last Fiscal Year) and
   dimensions (Month, Quarter, Year, Day of Week) for every date/timestamp
   column. Fiscal year start month is configurable.

2. **LLM-generated expressions** (when `llmRefinement` is on) -- the model
   analyses the schema and use cases to propose business-relevant measures
   (e.g. `SUM(revenue)`, `COUNT(DISTINCT customer_id)`), filters, and
   dimensions with synonyms and instructions.

3. **Custom expressions from config** -- customer-defined measures, filters,
   and dimensions are merged in directly.

Each expression includes `synonyms` (colloquial names users might type) and
`instructions` (guidance for Genie on when to use the expression).

**Output:** `EnrichedSqlSnippetMeasure[]`, `EnrichedSqlSnippetFilter[]`,
`EnrichedSqlSnippetDimension[]`.

### Pass 3: Trusted Asset Authoring

**Module:** `lib/genie/passes/trusted-assets.ts`

Converts use case SQL into parameterized trusted queries and proposes
UDF definitions. Runs in parallel with Pass 4.

**Trusted queries** are parameterized SQL with named parameters, types,
comments, and default values. They become `example_question_sqls` with
`usage_guidance` in the serialized space.

**Trusted functions** are UDF DDL definitions that become
`instructions.sql_functions` in the serialized space.

**Output:** `TrustedAssetQuery[]` and `TrustedAssetFunction[]`.

### Pass 4: Instruction Generation

**Module:** `lib/genie/passes/instruction-generation.ts`

Builds the `text_instructions` array for the space. Runs in parallel with
Pass 3.

**Instruction sources:**

- Business context (industry, goals, priorities, value chain)
- Domain and subdomain descriptions
- Entity matching guidance (e.g. "Florida" -> "FL")
- Time period guidance (fiscal year conventions)
- Clarification rules from config
- Summary instructions from config
- Business glossary terms
- Global instructions from config
- Optional LLM refinement to improve clarity

**Output:** `string[]` (text instruction content blocks).

### Pass 5: Benchmark Generation

**Module:** `lib/genie/passes/benchmark-generation.ts`

Generates test questions with expected SQL answers to evaluate Genie
accuracy. Runs in parallel with Pass 6.

**Features:**

- ~15 auto-generated benchmarks per domain
- Alternate phrasings per question (2-4 variants)
- Time-period variant questions
- Entity-matching test questions
- Customer-provided benchmarks from config are merged in

Each phrasing is emitted as its own entry in the serialized space with a
shared SQL answer, matching how Databricks evaluates per-phrasing accuracy.

**Output:** `BenchmarkInput[]`.

### Pass 6: Metric View Proposals

**Module:** `lib/genie/passes/metric-view-proposals.ts`

Proposes 1-3 metric views per domain with YAML definitions and DDL
conforming to the Databricks Unity Catalog YAML v1.1 specification.
Runs in parallel with Pass 5.

**Inputs from earlier passes:**

- Schema context from the metadata snapshot
- Measures and dimensions from Pass 2
- Join specs (FK-derived + overrides) for star/snowflake schema support
- Column enrichments from Pass 1 (used as YAML comments)
- Date/timestamp columns for window measure candidates

**Features:**

- Embedded YAML v1.1 spec reference in the LLM prompt
- Star/snowflake schema `joins:` blocks from FK metadata
- FILTER clause measures for conditional KPIs (e.g.
  `SUM(amount) FILTER (WHERE status = 'OPEN')`)
- Ratio measures that safely re-aggregate (e.g.
  `SUM(revenue) / COUNT(DISTINCT customer_id)`)
- Window measures (running totals, period-over-period, YTD) when date
  columns are present
- Seed YAML from Pass 2 measures/dimensions as a starting point for the LLM
- Column enrichment descriptions propagated as YAML `comment` fields
- Materialization recommendations for domains with >10 tables or >3 joins
- Post-generation YAML validation against the schema allowlist

**Output:** `MetricViewProposal[]` -- each with:

| Field | Type | Purpose |
|---|---|---|
| `name` | `string` | Metric view identifier |
| `description` | `string` | What the metric measures |
| `yaml` | `string` | YAML body (goes between `$$`) |
| `ddl` | `string` | Complete `CREATE OR REPLACE VIEW ... WITH METRICS` DDL |
| `sourceTables` | `string[]` | Tables referenced (source + joined) |
| `hasJoins` | `boolean` | Proposal uses `joins:` block |
| `hasFilteredMeasures` | `boolean` | Proposal uses `FILTER (WHERE ...)` |
| `hasWindowMeasures` | `boolean` | Proposal uses `window:` block |
| `hasMaterialization` | `boolean` | Proposal includes `materialization:` |
| `validationStatus` | `"valid" \| "warning" \| "error"` | YAML validation result |
| `validationIssues` | `string[]` | List of detected issues |

Proposals are displayed in the Space Preview UI with feature badges,
validation status, and a **Deploy Metric View** button.

---

## Schema Grounding

**Module:** `lib/genie/schema-allowlist.ts`

Every table name, column name, and SQL expression produced by the engine is
validated against the **Schema Allowlist** -- a set of identifiers built from
the `MetadataSnapshot` at engine start.

The allowlist contains:

- All table FQNs (catalog.schema.table)
- All column FQNs (catalog.schema.table.column)
- Column data types
- Metric view FQNs

**Validation functions:**

- `isValidTable(allowlist, fqn)` -- exact match
- `isValidColumn(allowlist, fqn)` -- exact match
- `validateSqlExpression(allowlist, sql, context)` -- checks that table/column
  references in SQL are in the allowlist
- `findInvalidIdentifiers(allowlist, identifiers)` -- batch check

**LLM prompt grounding:** `buildSchemaContextBlock(allowlist)` generates a
markdown block listing all tables and columns that is included in every LLM
prompt, ensuring the model can only reference physical schema objects.

This is the **Zero Hallucination Policy**: the LLM is never asked to invent
table or column names. It must only use what exists in the scraped metadata.

---

## Assembler & SerializedSpace v2

**Module:** `lib/genie/assembler.ts`

The assembler takes the aggregated `GenieEnginePassOutputs` for a domain and
builds a complete `SerializedSpace` v2 JSON payload ready for the Databricks
Genie API.

### Payload Structure

```json
{
  "version": 2,
  "config": {
    "sample_questions": [{ "id": "...", "question": ["..."] }]
  },
  "data_sources": {
    "tables": [{
      "identifier": "catalog.schema.table",
      "description": ["Table comment"],
      "columns": [{
        "name": "column_name",
        "description": "Business description",
        "synonyms": ["alias1", "alias2"],
        "hidden": false,
        "entity_matching": true
      }]
    }],
    "metric_views": [{
      "identifier": "catalog.schema.metric_view",
      "description": ["Metric view comment"]
    }]
  },
  "instructions": {
    "text_instructions": [{ "id": "...", "content": ["..."] }],
    "example_question_sqls": [{
      "id": "...",
      "question": ["..."],
      "sql": ["SELECT ..."],
      "usage_guidance": ["Parameter details..."]
    }],
    "sql_functions": [{ "id": "...", "identifier": "udf_name" }],
    "join_specs": [{
      "id": "...",
      "left": { "identifier": "catalog.schema.left_table" },
      "right": { "identifier": "catalog.schema.right_table" },
      "sql": ["left.id = right.id"],
      "relationship_type": "many_to_one"
    }],
    "sql_snippets": {
      "measures": [{
        "id": "...", "alias": "total_revenue",
        "sql": ["SUM(revenue)"],
        "synonyms": ["revenue", "sales total"],
        "instructions": ["Use for revenue aggregation"]
      }],
      "filters": [{
        "id": "...", "display_name": "last_30_days",
        "sql": ["order_date >= DATEADD(DAY, -30, CURRENT_DATE())"],
        "synonyms": ["last month", "recent"],
        "instructions": ["Standard 30-day lookback"]
      }],
      "expressions": [{
        "id": "...", "alias": "order_month",
        "sql": ["DATE_TRUNC('MONTH', order_date)"],
        "synonyms": ["monthly", "by month"],
        "instructions": ["Monthly time dimension"]
      }]
    }
  },
  "benchmarks": {
    "questions": [{
      "id": "...",
      "question": ["What was total revenue last month?"],
      "answer": [{ "format": "sql", "content": ["SELECT SUM(revenue) ..."] }]
    }]
  }
}
```

### Assembly Rules

- All arrays are sorted by `id` (Genie API requirement)
- Tables are sorted by `identifier`
- Every identifier is validated against the schema allowlist
- A warning is logged if `tables + metric_views > 30`
- Empty optional sections are omitted (no empty arrays in the payload)
- Deterministic IDs are generated via MD5 hash of `runId:domain:category:index`
- Table descriptions include relationship context from join specs
- `format_assistance: true` is set on monetary/percentage columns
- `text_instructions` are collapsed into a single entry (API limit)

### Payload Sanitization

**Module:** `lib/dbx/genie.ts` (`sanitizeSerializedSpace()`)

Before sending to the Databricks Genie API, the serialized space is
sanitized to fix known compatibility issues:

1. **Benchmark format casing** -- the `format` field in benchmark answers
   must be uppercase `"SQL"`, not lowercase `"sql"`. Older persisted
   payloads are auto-fixed.
2. **Text instructions collapse** -- the API allows at most one
   `text_instructions` entry. If multiple entries exist, they are
   merged into a single entry with all content concatenated.

---

## Configuration

The `GenieEngineConfig` controls every aspect of space generation. It is
stored per-run in Lakebase and editable via the Engine Config tab.

### Per-Run Configuration (Engine Config tab)

| Setting | Type | Purpose |
|---|---|---|
| `entityMatchingMode` | `"auto" \| "manual" \| "off"` | How entity matching candidates are identified |
| `fiscalYearStartMonth` | `number` (1-12) | First month of the fiscal year |
| `generateTrustedAssets` | `boolean` | Generate parameterized queries and UDFs |
| `glossary` | `GlossaryEntry[]` | Business terms with definitions and synonyms |
| `customMeasures` | `CustomSqlExpression[]` | Hand-crafted measure SQL |
| `customFilters` | `CustomSqlExpression[]` | Hand-crafted filter SQL |
| `customDimensions` | `CustomSqlExpression[]` | Hand-crafted dimension SQL |
| `tableGroupOverrides` | `TableGroupOverride[]` | Force a table into a specific domain |
| `joinOverrides` | `JoinOverride[]` | Override or add join relationships |
| `entityMatchingOverrides` | `EntityMatchingOverride[]` | Force entity matching on/off per column |
| `clarificationRules` | `ClarificationRule[]` | Rules for Genie to ask follow-up questions |
| `columnOverrides` | `ColumnOverride[]` | Rename, hide, or add synonyms to columns |
| `benchmarkQuestions` | `BenchmarkInput[]` | Customer-defined test questions |
| `globalInstructions` | `string` | Free-text instructions added to every space |
| `summaryInstructions` | `string` | Instructions for how Genie formats summaries |
| `timePeriodDateColumns` | `string[]` | Specific date columns for time period generation |

### Global Settings (Settings page)

These 5 settings are configured once in the Settings page and apply to all
runs. They are merged into the engine config at runtime.

| Setting | Default | Purpose |
|---|---|---|
| `maxTablesPerSpace` | 25 | Maximum tables per Genie space (API limit: 30) |
| `llmRefinement` | On | Enable LLM passes for expressions, instructions, etc. |
| `generateBenchmarks` | On | Auto-generate benchmark questions |
| `generateMetricViews` | On | Propose metric view definitions |
| `autoTimePeriods` | On | Generate standard date filters and dimensions |

---

## Global Settings vs Per-Run Config

The configuration is split into two tiers:

**Global settings** (Settings page, localStorage) control high-level engine
behaviour that rarely changes between runs. These are applied to every run
automatically.

**Per-run config** (Engine Config tab, Lakebase) contains domain-specific
customizations: glossary, SQL expressions, column overrides, join overrides,
clarification rules, and benchmark questions. These are scoped to a single
pipeline run and can be iterated without affecting other runs.

When the Genie Workbench loads, it merges global settings into the run config.
When regenerating, the engine always uses the current global values.

---

## Adding Business Context

Business context is the single most important factor in Genie space quality.
It flows into the engine through multiple channels:

### 1. Pipeline Business Context (automatic)

Generated in Step 1 of the pipeline from the business name and metadata.
Contains:

- **Industries** -- e.g. "Retail, E-commerce"
- **Strategic goals** -- e.g. "Increase customer retention by 15%"
- **Business priorities** -- e.g. "Revenue optimization, cost reduction"
- **Value chain** -- e.g. "Procurement -> Manufacturing -> Sales -> Service"

This is automatically included in text instructions for every space.

### 2. Business Glossary (per-run config)

Define business-specific terms so Genie understands your language:

```
Term: AOV
Definition: Average Order Value -- total revenue divided by order count
Synonyms: average order value, basket size
```

Glossary entries are injected into text instructions and inform the LLM
during expression generation.

### 3. Global Instructions (per-run config)

Free-text instructions appended to every space. Use for:

- Company-specific conventions ("Always use fiscal quarters, not calendar")
- Data quality notes ("The `legacy_orders` table has nulls in `ship_date`
  before 2023")
- Terminology rules ("When users say 'revenue', they mean `net_revenue`,
  not `gross_revenue`")

### 4. Clarification Rules (per-run config)

Teach Genie when to ask follow-up questions:

```
Topic: sales performance
Missing details: time period, region
Question: "Which time period and region would you like to analyse?"
```

### 5. Custom SQL Expressions (per-run config)

When the LLM-generated expressions aren't right, override them:

```
Name: active_customers
SQL: COUNT(DISTINCT CASE WHEN last_order_date >= DATEADD(MONTH, -3, CURRENT_DATE()) THEN customer_id END)
Synonyms: active users, engaged customers
Instructions: Use this for active customer counts, not raw COUNT(*)
```

---

## Entity Matching & Sample Data

Databricks Genie's **entity matching** feature maps conversational language
to data values. For example, "Florida" -> "FL" in a `state_code` column.

### How It Works

1. **Sample data** -- if data sampling is enabled in Settings, the pipeline
   reads a small number of rows per table. These are cached and passed to the
   engine.

2. **Entity extraction** (`lib/genie/entity-extraction.ts`) -- identifies
   columns with bounded cardinality (<=100 distinct values) and string type.
   Excludes PII columns and UUID-like values.

3. **Column enrichment** -- Pass 1 flags columns as `entityMatchingCandidate`.

4. **Assembler** -- sets `entity_matching: true` on the column in the
   serialized space payload.

5. **Instructions** -- Pass 4 generates entity matching guidance text,
   e.g. "The column `state_code` uses 2-letter abbreviations. Users may
   say 'Florida' meaning 'FL'."

### Entity Matching Modes

- **Auto** (default): uses sample data and schema heuristics
- **Manual**: only columns explicitly listed in `entityMatchingOverrides`
- **Off**: no entity matching at all

### Maximizing Entity Matching Quality

- Enable data sampling (Settings > Data Sampling > 10+ rows)
- The more sample rows, the better the entity extraction
- Use `entityMatchingOverrides` to force specific columns on/off
- Review entity candidates in the Column Intelligence section of Space Preview

---

## Time Periods & Fiscal Year

**Module:** `lib/genie/time-periods.ts`

When `autoTimePeriods` is enabled, the engine automatically generates
standard date filters and dimensions for every date/timestamp column.

### Generated Filters

| Filter | SQL Pattern |
|---|---|
| Last 7 Days | `col >= DATEADD(DAY, -7, CURRENT_DATE())` |
| Last 30 Days | `col >= DATEADD(DAY, -30, CURRENT_DATE())` |
| Last 90 Days | `col >= DATEADD(DAY, -90, CURRENT_DATE())` |
| Month to Date | `col >= DATE_TRUNC('MONTH', CURRENT_DATE())` |
| Quarter to Date | `col >= DATE_TRUNC('QUARTER', CURRENT_DATE())` |
| Year to Date | `col >= DATE_TRUNC('YEAR', CURRENT_DATE())` |
| Last Fiscal Year | Adjusted for configured fiscal year start month |

### Generated Dimensions

| Dimension | SQL Pattern |
|---|---|
| Month | `DATE_TRUNC('MONTH', col)` |
| Quarter | `DATE_TRUNC('QUARTER', col)` |
| Year | `YEAR(col)` |
| Day of Week | `DAYOFWEEK(col)` |

### Fiscal Year

Set `fiscalYearStartMonth` (1-12) to align time periods with your reporting
calendar. When set to a non-January month, the fiscal year filter adjusts
accordingly.

---

## Trusted Assets

Trusted assets provide verified, parameterized SQL that Genie can use to
answer questions with guaranteed accuracy.

### Trusted Queries

Generated from use case SQL in Pass 3. Each query has:

- **Question**: the natural language prompt
- **SQL**: parameterized query with named parameters
- **Parameters**: name, type (String/Date/Numeric), comment, default value
- **Usage guidance**: when and how to use the query

Example:

```sql
-- Question: What were sales for a given product category last month?
SELECT category, SUM(amount) as total_sales
FROM catalog.schema.orders o
JOIN catalog.schema.products p ON o.product_id = p.id
WHERE p.category = :category
  AND o.order_date >= DATEADD(MONTH, -1, DATE_TRUNC('MONTH', CURRENT_DATE()))
GROUP BY category
-- Parameter: category (String) - Product category name [default: 'Electronics']
```

### Trusted Functions (UDFs)

SQL function definitions that Genie can reference. These appear in
`instructions.sql_functions` in the serialized space.

**Important:** UDF DDL is generated by Pass 3 but not automatically
executed. For Genie to reference a function, it must exist in Unity
Catalog. The Space Preview UI provides a **Deploy Functions** button
that executes UDF DDL via the SQL Statement Execution API.

API endpoint:

```
POST /api/runs/{runId}/genie-engine/{domain}/functions
Body: { "ddl": "CREATE OR REPLACE FUNCTION ...", "name": "..." }
```

---

## Metric Views

When `generateMetricViews` is enabled, Pass 6 proposes metric view
definitions for each domain using the Databricks YAML v1.1 specification.

### Discovery

Existing metric views are discovered during metadata extraction via
`listMetricViews()` in `lib/queries/metadata.ts`. This queries
`information_schema.tables WHERE table_type = 'METRIC_VIEW'` and returns
`MetricViewInfo[]`. Discovered metric views are automatically included in
the space's `data_sources.metric_views` section.

### Proposals

Each proposal conforms to the YAML v1.1 spec and may include:

- **Star schema joins** using the `joins:` block (from FK metadata)
- **FILTER clause measures** for conditional aggregation
- **Ratio measures** that safely re-aggregate at any granularity
- **Window measures** (running totals, period-over-period, YTD)
- **Materialization** recommendations for complex domains
- **Column enrichment comments** as YAML `comment` fields

### YAML Validation

Every proposal is validated against the schema allowlist:

- Required YAML fields: `version`, `source`, `dimensions`, `measures`
- Source table must exist in the metadata
- Join table references must exist in the metadata
- DDL must contain `WITH METRICS`, `LANGUAGE YAML`, and `$$` delimiters

Validation results are surfaced in the UI as badges (`valid`, `warning`,
`error`) with expandable issue lists.

### Deploying Metric Views

Proposed metric views can be deployed directly from the Space Preview UI:

1. Click **Deploy Metric View** on a proposal card
2. The DDL is executed via the SQL Statement Execution API
3. The new metric view is added to the domain's `data_sources.metric_views`
4. The `metricViewCount` and FQN list are updated in Lakebase

API endpoint:

```
POST /api/runs/{runId}/genie-engine/{domain}/metric-views
Body: { "ddl": "CREATE ...", "name": "...", "description": "..." }
```

Proposals with `validationStatus: "error"` have the deploy button disabled.

---

## Benchmarks

Benchmarks are test questions with expected SQL answers used to evaluate
Genie space accuracy.

### Auto-Generated Benchmarks

When `generateBenchmarks` is enabled, Pass 5 generates ~15 benchmarks per
domain covering:

- Core business questions
- Time-period variant questions
- Entity-matching test questions
- Edge cases and ambiguous phrasings
- 2-4 alternate phrasings per question

### Customer-Defined Benchmarks

Add your own benchmarks in the Engine Config tab:

```
Question: What was total revenue last quarter?
Expected SQL: SELECT SUM(amount) FROM orders WHERE order_date >= ...
Alternate phrasings: Q4 revenue, last quarter sales total
```

Customer benchmarks are merged with auto-generated ones. Each alternate
phrasing is emitted as its own entry sharing the same SQL answer.

---

## Conversation API & Testing

**Module:** `lib/dbx/genie.ts`

After deploying a space, you can test it programmatically using the
Genie Conversation API. The client provides:

- `startConversation(spaceId, question)` -- send a question, start a new
  conversation, and poll for a completed response
- `sendFollowUp(spaceId, conversationId, question)` -- send a follow-up
  question in an existing conversation

The **Test Space** button in the Genie Spaces tab runs 3-5 sample questions
from the space against the deployed Genie space and reports results.

The **Run Benchmarks** feature executes benchmark questions against the
deployed space via the Conversation API and shows pass/fail per question
with the SQL that Genie generated vs the expected SQL.

API endpoint:

```
POST /api/runs/{runId}/genie-engine/{domain}/test
Body: { "spaceId": "...", "questions": ["..."] }
```

---

## Deployment

### From the Overview Tab

1. Select one or more domains using the checkboxes
2. Click "Deploy Selected"
3. Spaces are created via the Databricks Genie REST API
4. Each deployed space is tracked in Lakebase

### From the Domain Detail Sheet

1. Click a domain row to open the detail sheet
2. Click "Select for Deploy" to add to the selection

### Per-Domain Deploy

The engine also supports per-domain deployment via:

```
POST /api/runs/{runId}/genie-engine/{domain}/deploy
```

This creates or updates the space and tracks it in Lakebase.

### Update vs Create

If a space has been previously deployed for a domain, the engine will
**update** the existing space (PATCH) rather than creating a new one.
This preserves the Genie space ID and any user conversations.

### Trash

Deployed spaces can be trashed (soft delete) from the UI. This calls the
Databricks API to move the space to trash and updates the Lakebase tracking
record.

---

## Inline Editing

The Space Preview tab allows inline editing of the serialized space before
deployment.

### Editable Objects

| Object | Edit | Remove |
|---|---|---|
| Measures | Rename, change SQL | Yes |
| Filters | Rename, change SQL | Yes |
| Dimensions | Rename, change SQL | Yes |
| Sample Questions | Edit text | Yes |
| Text Instructions | Edit content | Yes |

Edits are persisted via:

```
PATCH /api/runs/{runId}/genie-engine/{domain}/space
```

The API parses the stored `serializedSpace` JSON, applies the edit, and saves
the updated JSON back to Lakebase. The space can then be deployed with the
modifications included.

---

## Legacy Fallback

**Module:** `lib/genie/recommend.ts`

The legacy generator is a deterministic, regex-based engine that runs without
LLM calls. It is used as a fallback when:

- The Genie Engine fails
- The AI model endpoint is unavailable
- Older runs pre-date the engine

It produces basic spaces with:

- Tables grouped by domain
- SQL snippets extracted via regex (aggregates, WHERE clauses, GROUP BY)
- Join specs from foreign keys
- Text instructions from business context
- No benchmarks, no metric views, no trusted assets, no column enrichments

New code should always use `runGenieEngine()`.

---

## Best Practices

### 1. Enable Data Sampling

Data sampling dramatically improves entity matching and expression quality.
Set it to at least 10 rows per table in Settings > Data Sampling.

### 2. Curate Your Glossary

A well-defined glossary is the highest-ROI configuration. Define every
business term, acronym, and domain-specific phrase. Include synonyms for
how users actually speak.

### 3. Keep Tables Under 25

The Databricks Genie API supports up to 30 tables per space, but accuracy
degrades beyond ~20. The default of 25 provides headroom while keeping
quality high. Use `tableGroupOverrides` to split large domains.

### 4. Add Clarification Rules

Teach Genie to ask follow-up questions for ambiguous queries. This prevents
incorrect assumptions and produces better answers.

### 5. Define Custom SQL for Critical Metrics

Don't rely solely on LLM-generated expressions for your most important
KPIs. Define custom measures, filters, and dimensions with precise SQL.

### 6. Write Global Instructions

Add company-specific conventions, data quality notes, and terminology rules
as global instructions. These are injected into every space.

### 7. Review and Edit Before Deploying

Use the Space Preview tab to inspect every object. Rename unclear aliases,
remove irrelevant measures, and edit instructions. The inline editor
modifies the serialized space directly.

### 8. Add Benchmark Questions

Customer-defined benchmarks with known-correct SQL provide a quality
baseline. Start with 5-10 critical questions per domain and expand over time.

### 9. Configure Fiscal Year

If your organisation uses a non-January fiscal year, set
`fiscalYearStartMonth` in the Engine Config tab. All auto-generated time
periods will align with your reporting calendar.

### 10. Test After Deploying

After deploying a space, use the **Test Space** button to run sample
questions against the live space. Use the **Run Benchmarks** button to
execute benchmark questions and check pass/fail rates. Fix underperforming
areas by editing instructions, measures, or adding more trusted queries.

### 11. Deploy Functions Before Deploying Spaces

If the engine generates trusted UDFs, deploy them from the Space Preview
before deploying the space. Genie cannot reference functions that don't
exist in Unity Catalog.

### 12. Iterate

The Genie Engine is designed for iteration. Edit the config, regenerate,
review, edit inline, and deploy. Each cycle improves the space.

---

## Troubleshooting

### LLM JSON Parsing Failures

**Symptom:** `parseLLMJson: unable to extract valid JSON` in logs.

The engine includes a robust multi-strategy JSON parser
(`lib/genie/passes/parse-llm-json.ts`) that handles markdown fences,
preamble text, and malformed output. If parsing still fails, the engine
logs a warning and continues with degraded output for that pass.

### No Domains Generated

**Symptom:** "No domain groups produced" in logs.

This means no use cases have domain assignments. Ensure the pipeline ran
through Step 5 (Domain Clustering) successfully.

### Tables Rejected by Allowlist

**Symptom:** "Assembler rejected unknown table" in logs.

The LLM referenced a table that doesn't exist in the metadata. This is
expected and harmless -- the assembler simply skips it.

### 30-Table Limit Warning

**Symptom:** "Genie space exceeds 30 table/view limit" in logs.

Reduce `maxTablesPerSpace` or use `tableGroupOverrides` to split the domain.

### Empty Measures or Filters

If LLM refinement is off and no custom expressions are defined, the only
source of measures/filters is auto time periods (for date columns). Enable
LLM refinement or add custom SQL expressions.

---

## File Reference

### Core Engine

| File | Purpose |
|---|---|
| `lib/genie/engine.ts` | Main orchestrator -- runs all 7 passes |
| `lib/genie/assembler.ts` | Builds SerializedSpace v2 payload |
| `lib/genie/types.ts` | All TypeScript types and interfaces |
| `lib/genie/schema-allowlist.ts` | Schema grounding and validation |
| `lib/genie/time-periods.ts` | Auto date filter/dimension generation |
| `lib/genie/entity-extraction.ts` | Entity matching candidate identification |
| `lib/genie/engine-status.ts` | In-memory async job status tracker |
| `lib/genie/recommend.ts` | Legacy deterministic fallback generator |
| `lib/genie/benchmark-runner.ts` | Benchmark execution via Conversation API |

### Engine Passes

| File | Pass | Purpose |
|---|---|---|
| `lib/genie/passes/table-selection.ts` | 0 | Domain grouping and table ranking |
| `lib/genie/passes/column-intelligence.ts` | 1 | Column enrichment and entity extraction |
| `lib/genie/passes/semantic-expressions.ts` | 2 | Measures, filters, dimensions |
| `lib/genie/passes/trusted-assets.ts` | 3 | Parameterized queries and UDFs |
| `lib/genie/passes/instruction-generation.ts` | 4 | Text instructions |
| `lib/genie/passes/benchmark-generation.ts` | 5 | Test questions with expected SQL |
| `lib/genie/passes/metric-view-proposals.ts` | 6 | Metric view YAML and DDL |
| `lib/genie/passes/parse-llm-json.ts` | -- | Robust LLM JSON extraction |

### Databricks API

| File | Purpose |
|---|---|
| `lib/dbx/genie.ts` | Genie Spaces REST API + Conversation API client |

### Persistence

| File | Purpose |
|---|---|
| `lib/lakebase/genie-recommendations.ts` | CRUD for recommendations |
| `lib/lakebase/genie-engine-config.ts` | CRUD for engine config (versioned) |
| `lib/lakebase/genie-spaces.ts` | Tracking deployed spaces |
| `lib/settings.ts` | Global Genie Engine defaults (localStorage) |

### UI Components

| File | Purpose |
|---|---|
| `components/pipeline/genie-workbench.tsx` | Main workbench with tabs |
| `components/pipeline/genie-config-editor.tsx` | Per-run config editor |
| `components/pipeline/genie-spaces-tab.tsx` | Overview table and deploy |
| `components/pipeline/genie-space-preview.tsx` | Deep preview with inline edit |

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/runs/{runId}/genie-engine/config` | GET, PUT | Load/save engine config |
| `/api/runs/{runId}/genie-engine/generate` | POST | Start async generation |
| `/api/runs/{runId}/genie-engine/generate/status` | GET | Poll generation progress |
| `/api/runs/{runId}/genie-engine/{domain}/preview` | GET | Rich domain preview |
| `/api/runs/{runId}/genie-engine/{domain}/space` | PATCH | Inline space edits |
| `/api/runs/{runId}/genie-engine/{domain}/deploy` | POST | Deploy to Databricks |
| `/api/runs/{runId}/genie-engine/{domain}/metric-views` | POST | Execute metric view DDL + update space |
| `/api/runs/{runId}/genie-engine/{domain}/functions` | POST | Execute UDF DDL |
| `/api/runs/{runId}/genie-engine/{domain}/test` | POST | Test deployed space via Conversation API |
| `/api/runs/{runId}/genie-recommendations` | GET | List all recommendations |
| `/api/genie-spaces` | GET, POST | List/create Genie spaces |
| `/api/genie-spaces/{spaceId}` | PATCH, DELETE | Update/trash a space |

### Pipeline Integration

| File | Purpose |
|---|---|
| `lib/pipeline/steps/genie-recommendations.ts` | Step 8: runs engine and saves results |

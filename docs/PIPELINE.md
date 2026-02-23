# Pipeline Reference

> Detailed reference for each pipeline step in the "Discover Usecases" flow.

## Pipeline Overview

The pipeline runs 7 core steps sequentially (plus an optional 8th Genie Engine step). Each step:

- Receives the current pipeline state (run config + accumulated results)
- Executes SQL queries (metadata) and/or Model Serving calls (LLM via chat completions API)
- Writes results back to Lakebase
- Updates `progress_pct` and `current_step` on the run record

```
[1] Business Context      (10%)
        │
[2] Metadata Extraction   (25%)
        │
[3] Table Filtering       (35%)
        │
[4] Use Case Generation   (55%)
        │
[5] Domain Clustering     (70%)
        │
[6] Scoring & Dedup       (85%)
        │
[7] SQL Generation        (100%)
        │
[8] Genie Engine          (optional, post-pipeline)
```

---

## Model Routing

The discovery pipeline uses a **dual-endpoint strategy** to balance quality and
speed. Steps that involve creative generation or nuanced judgment run on the
premium model (via `run.config.aiModel`), while classification and enrichment
steps run on the fast model (via `getFastServingEndpoint()`).

If the `serving-endpoint-fast` app resource is **not configured**, the fast
endpoint falls back to the premium endpoint -- all behaviour is unchanged.

| Step | Model | Rationale |
|---|---|---|
| 1. Business Context | **Fast** | Structured JSON output (industries, goals, priorities) |
| 2. Metadata Extraction | None (SQL) | Pure SQL queries against `information_schema` |
| 3. Table Filtering | **Fast** | Binary classification (business vs technical) |
| 4. Use Case Generation | **Premium** | Creative generation with schema grounding -- quality-critical |
| 5. Domain Clustering | **Fast** | Taxonomy assignment (3 sub-passes: domain, subdomain, merge) |
| 6a. Scoring | **Premium** | Nuanced judgment on multiple scoring dimensions |
| 6b. Dedup (per-domain) | **Fast** | Binary classification (keep vs remove) |
| 6c. Dedup (cross-domain) | **Fast** | Binary classification (keep vs remove) |
| 6d. Calibration | **Premium** | Global score adjustment requires contextual reasoning |
| 7. SQL Generation | **Premium** | SQL correctness is critical |
| 8. Genie Engine | Mixed | See [GENIE_ENGINE.md](GENIE_ENGINE.md#model-routing) |

---

## Step 1: Business Context

**File:** `lib/pipeline/steps/business-context.ts`

**Purpose:** Generate a structured business context from the organisation name
and any user-supplied domains, priorities, or goals.

**Prompt:** `BUSINESS_CONTEXT_WORKER_PROMPT`

**Inputs:**
- `business_name` (from config)
- `business_domains` (optional, from config)
- `business_priorities` (from config)
- `strategic_goals` (optional, from config)

**Process:**
1. Call Model Serving with the business name to generate industry context
2. Parse the JSON response (wrapped in honesty scoring)
3. Merge LLM-generated context with user-supplied overrides
4. Store merged context on the run record (`business_context` column)

**Output:** `BusinessContext` object with fields:
- `industries` -- detected industries
- `strategic_goals` -- strategic goals
- `business_priorities` -- priorities
- `strategic_initiative` -- key initiative
- `value_chain` -- value chain description
- `revenue_model` -- revenue model
- `additional_context` -- any extra context

**Error handling:** If the Model Serving call fails, use a minimal default context built from
the business name and user-supplied priorities.

---

## Step 2: Metadata Extraction

**File:** `lib/pipeline/steps/metadata-extraction.ts`

**Purpose:** Query Unity Catalog `information_schema` to extract all catalogs,
schemas, tables, and columns for the specified UC metadata path.

**Prompts:** None (pure SQL queries)

**Inputs:**
- `uc_metadata` (from config) -- e.g. `main.finance` or `catalog1,catalog2`

**Process:**
1. Parse the UC metadata input to determine scope (catalogs, schemas, or tables)
2. Query `information_schema.schemata` for schemas
3. Query `information_schema.tables` for table list
4. Query `information_schema.columns` for column details
5. Optionally query foreign key relationships
6. Build schema markdown (table + column descriptions for prompts)
7. Cache results in `forge_metadata_cache`

**Output:** `MetadataSnapshot` with:
- `tables` -- list of table FQNs
- `columns` -- column details per table
- `foreign_keys` -- FK relationships
- `schema_markdown` -- formatted markdown for prompt injection
- `table_count`, `column_count` -- counts

**Error handling:** If a catalog/schema is inaccessible, log a warning and
continue with accessible metadata. Fail the step only if zero tables are found.

---

## Step 3: Table Filtering

**File:** `lib/pipeline/steps/table-filtering.ts`

**Purpose:** Classify tables as "business" (relevant for use cases) vs
"technical" (system/audit tables to exclude).

**Prompt:** `FILTER_BUSINESS_TABLES_PROMPT`

**Inputs:**
- `business_name`, `industries`, `business_context` (from Step 1)
- Table list with column summaries (from Step 2)

**Process:**
1. Batch tables into groups (by schema or by count)
2. For each batch, call Model Serving with table names + column summaries
3. Parse CSV response: each row is `table_fqn, classification, reason`
4. Filter to keep only "business" tables
5. Update the metadata snapshot with the filtered table list

**Output:** Filtered list of business-relevant tables.

**Error handling:** If classification fails for a batch, include all tables from
that batch (fail-open to avoid missing use cases).

---

## Step 4: Use Case Generation

**File:** `lib/pipeline/steps/usecase-generation.ts`

**Purpose:** Generate AI and statistical use cases from the filtered metadata.

**Prompts:**
- `AI_USE_CASE_GEN_PROMPT` -- for AI-focused use cases (ai_forecast, ai_classify, etc.)
- `STATS_USE_CASE_GEN_PROMPT` -- for statistical use cases (anomaly detection, etc.)

**Inputs:**
- `business_context` (from Step 1)
- `schema_markdown` with only business tables (from Step 3)
- `foreign_key_relationships` (from Step 2)
- `ai_functions_summary` (from AI_FUNCTIONS registry)
- `statistical_functions_detailed` (from STATISTICAL_FUNCTIONS registry)

**Process:**
1. Batch tables using `BatchOptimizer` logic (group by schema, respect token limits)
2. For each batch, run AI and Stats prompts in parallel via `Promise.all`
3. Parse CSV responses into use case objects
4. Optionally run a second pass for transactional tables with feedback
5. Deduplicate within batches
6. Retry for missing table coverage (up to 3 rounds)

**Output:** Array of raw `UseCase` objects (unscored, uncategorised).

**Error handling:** Retry failed batches up to 2 times. Log and skip batches
that fail after retries.

---

## Step 5: Domain Clustering

**File:** `lib/pipeline/steps/domain-clustering.ts`

**Purpose:** Assign each use case to a business domain and subdomain.

**Prompts:**
- `DOMAIN_FINDER_PROMPT` -- assigns domains (3-25 one-word names)
- `SUBDOMAIN_DETECTOR_PROMPT` -- assigns subdomains within each domain
- `DOMAINS_MERGER_PROMPT` -- merges small domains (< threshold) into larger ones

**Inputs:**
- `business_name`, `industries`, `business_context`
- Use cases from Step 4 (as CSV)

**Process:**
1. Call Model Serving with all use cases to assign domains
2. For each domain, call Model Serving to assign subdomains
3. If any domain has fewer than the minimum cases, merge into related domains
4. Update use case objects with domain/subdomain assignments

**Output:** Use cases with `domain` and `subdomain` fields populated.

**Error handling:** If domain assignment fails, assign all use cases to a
"General" domain.

---

## Step 6: Scoring & Deduplication

**File:** `lib/pipeline/steps/scoring.ts`

**Purpose:** Score each use case on ROI, strategic alignment, and priority, then
remove duplicates.

**Prompts:**
- `SCORE_USE_CASES_PROMPT` -- scores on multiple dimensions
- `REVIEW_USE_CASES_PROMPT` -- detects and removes duplicates

**Inputs:**
- `business_context`, `strategic_goals`, `business_priorities`
- Domain-clustered use cases from Step 5

**Process:**
1. For each domain, call Model Serving with use cases to score them
2. Parse CSV response: `use_case_no, priority_score, feasibility_score, impact_score, overall_score`
3. For each domain, call Model Serving to review and remove duplicates
4. Re-number use case IDs with domain prefix
5. Sort by overall_score descending
6. Apply volume filter if total exceeds threshold (50/100/200)
7. Persist final use cases to `forge_use_cases` table

**Output:** Scored, deduplicated, ranked use cases persisted in Lakebase.

**Error handling:** If scoring fails for a domain, assign default scores (0.5).
If dedup fails, keep all use cases.

---

## Step 7: SQL Generation

**File:** `lib/pipeline/steps/sql-generation.ts`

**Purpose:** Generate bespoke SQL code for each use case, producing runnable
Databricks SQL that demonstrates the analytical technique.

**Prompts:** `SQL_GENERATION_PROMPT`

**Inputs:**
- `business_context` (from Step 1)
- `schema_markdown` with business tables (from Step 3)
- Use cases with domains and scores (from Step 6)
- Optional sample data (if data sampling is enabled)

**Process:**
1. For each use case, call Model Serving with the use case details + schema context
2. Stream the SQL response to reduce latency
3. Parse and validate the generated SQL
4. Persist `sql_code` and `sql_status` on each use case record

**Output:** Use cases with `sql_code` populated and `sql_status` set to `generated`.

**Error handling:** If SQL generation fails for a use case, set `sql_status` to `failed`
and continue with the next use case.

---

## Step 8: Genie Engine (Optional)

**File:** `lib/genie/engine.ts`

**Purpose:** Generate Databricks Genie Space recommendations from the pipeline
results. This is a post-pipeline step triggered from the Genie Workbench UI.

See [docs/GENIE_ENGINE.md](GENIE_ENGINE.md) for full documentation of the
Genie Engine, its configuration, LLM passes, assembler, and deployment.

**Process:**
1. Select tables per domain using LLM-based table scoring
2. Run up to 8 LLM passes: column intelligence, entity matching, semantic
   expressions, trusted assets, benchmarks, metric views, sample questions,
   text instructions
3. Generate time-period filters and dimensions for date columns
4. Assemble all outputs into a `SerializedSpace` v2 JSON payload
5. Persist recommendations in `forge_genie_recommendations`
6. User can review, edit, and deploy spaces from the Genie Workbench

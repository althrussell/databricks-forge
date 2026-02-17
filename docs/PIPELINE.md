# Pipeline Reference

> Detailed reference for each pipeline step in the "Discover Usecases" flow.
> Extracted from `docs/references/databricks_inspire_v34.ipynb`.

## Pipeline Overview

The pipeline runs 6 core steps sequentially. Each step:

- Receives the current pipeline state (run config + accumulated results)
- Executes SQL queries (metadata) and/or Model Serving calls (LLM via chat completions API)
- Writes results back to Lakebase
- Updates `progress_pct` and `current_step` on the run record

```
[1] Business Context  (15%)
        │
[2] Metadata Extraction  (30%)
        │
[3] Table Filtering  (45%)
        │
[4] Use Case Generation  (65%)
        │
[5] Domain Clustering  (80%)
        │
[6] Scoring & Dedup  (100%)
```

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
7. Cache results in `inspire_metadata_cache`

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
7. Persist final use cases to `inspire_use_cases` table

**Output:** Scored, deduplicated, ranked use cases persisted in Lakebase.

**Error handling:** If scoring fails for a domain, assign default scores (0.5).
If dedup fails, keep all use cases.

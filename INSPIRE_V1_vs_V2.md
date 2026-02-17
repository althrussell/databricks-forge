# Databricks Inspire AI: V1 (Notebook) vs V2 (Web Application)

> A comprehensive comparison between the original `databricks_inspire_v34.ipynb` notebook (V1) and the current Next.js web application (V2). This document highlights every net-new feature, prompt improvement, analysis enhancement, SQL upgrade, and architectural advancement.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture & Platform](#architecture--platform)
3. [Pipeline Engine](#pipeline-engine)
4. [Prompt Engineering Improvements](#prompt-engineering-improvements)
5. [Scoring & Analysis Framework](#scoring--analysis-framework)
6. [SQL Generation & Validation](#sql-generation--validation)
7. [Industry Knowledge Base](#industry-knowledge-base)
8. [Security & Validation](#security--validation)
9. [Persistence & State Management](#persistence--state-management)
10. [Export & Output](#export--output)
11. [User Interface & Experience](#user-interface--experience)
12. [Observability & Debugging](#observability--debugging)
13. [Net-New Features](#net-new-features)
14. [Removed / Deprecated](#removed--deprecated)
15. [Summary Matrix](#summary-matrix)

---

## Executive Summary

The V1 notebook was a monolithic ~30,000-line Python notebook running directly in Databricks. It required manual widget configuration, ran sequentially via "Run All", and stored outputs as files on disk.

V2 is a full-stack web application built with Next.js 16, React 19, TypeScript, and shadcn/ui. It runs as a Databricks App with automatic authentication, persistent state in Lakebase, real-time pipeline progress, multi-format exports, and a complete UI for configuration, monitoring, comparison, and analysis.

**The transformation is not a simple port -- it is a ground-up redesign of every layer: prompts, pipeline, scoring, SQL generation, security, observability, and user experience.**

---

## Architecture & Platform

### V1 (Notebook)

- Single monolithic Python notebook (~30,000 lines in one file)
- Runs on a Databricks cluster via "Run All"
- Configuration via Databricks widgets (text boxes, dropdowns)
- State held in Python variables (lost on restart)
- Output written to local workspace files (`./inspire_gen/`)
- PySpark for SQL execution, ThreadPoolExecutor for parallelism
- Manual installation of dependencies (pptxgenjs, pdfkit, etc.)
- No authentication layer -- inherits notebook user permissions

### V2 (Web Application)

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 App Router, React 19, shadcn/ui, Tailwind CSS 4 |
| Language | TypeScript (strict mode) |
| SQL Execution | Databricks SQL Statement Execution REST API |
| LLM Calls | Databricks Model Serving REST API (chat completions) |
| Persistence | Lakebase (Unity Catalog managed tables) via Prisma 7 |
| Deployment | Databricks Apps (auto-auth, injected env vars) |
| Export | exceljs, pdfkit, pptxgenjs, Workspace REST API |

**Key improvements:**
- **Modular architecture** -- separated into `/lib/dbx`, `/lib/queries`, `/lib/domain`, `/lib/ai`, `/lib/pipeline`, `/lib/lakebase`, `/lib/export`
- **Typed throughout** -- every data structure, API response, and LLM output has TypeScript types and Zod validation
- **No Spark dependency** -- uses Databricks SQL Statement Execution API for metadata and Model Serving REST API for LLM calls, enabling deployment as a lightweight web app
- **Automatic deployment** -- runs as a Databricks App with zero manual cluster setup

---

## Pipeline Engine

### V1 (Notebook)

- Sequential execution through notebook cells
- No progress tracking (just print statements)
- No ability to resume or inspect intermediate state
- Error handling via try/except blocks printing to stdout
- Parallelism via `ThreadPoolExecutor` with adaptive sizing
- All pipeline logic interleaved with UI code, widget reading, and file I/O

### V2 (Web Application)

- **Dedicated pipeline engine** (`lib/pipeline/engine.ts`) orchestrates 7 steps sequentially
- **Modular step architecture** -- each step is an isolated module:
  - `steps/business-context.ts`
  - `steps/metadata-extraction.ts`
  - `steps/table-filtering.ts`
  - `steps/usecase-generation.ts`
  - `steps/domain-clustering.ts`
  - `steps/scoring.ts`
  - `steps/sql-generation.ts`
- **Shared PipelineContext** -- typed context object passed between steps holding run config, metadata, filtered tables, and use cases
- **Real-time progress tracking** -- `updateRunStatus()` and `updateRunMessage()` write to Lakebase; frontend polls every 3 seconds
- **Step timing** -- `logStep()` records duration of every step in a `stepLog` array stored with the run
- **Fire-and-forget execution** -- pipeline starts via `POST /api/runs/[runId]/execute` and runs asynchronously; UI shows live progress
- **Error recovery** -- each step has fallback logic (e.g., default business context, default scores, skip failed SQL)
- **Industry auto-detection** -- after Step 1, `detectIndustryFromContext()` matches the business context against the outcome map registry

---

## Prompt Engineering Improvements

### Business Context (Step 1)

| Aspect | V1 | V2 |
|--------|----|----|
| Output fields | 6 fields (business_context, strategic_goals, business_priorities, strategic_initiative, value_chain, revenue_model) | **7 fields** (added `additional_context` + `industries` field) |
| Strategic goals | Free text | **Constrained taxonomy** -- 8 standard goals (Reduce Cost, Boost Productivity, Increase Revenue, Mitigate Risk, Protect Revenue, Align to Regulations, Improve Customer Experience, Enable Data-Driven Decisions) with elaboration |
| Quality requirements | Basic "descriptive strings" note | **Explicit quality bar** -- "2-5 sentences of substantive content", "Be SPECIFIC to this business and industry -- generic answers are unacceptable" |
| Workflow | 3 steps: Research, Information Gathering, JSON Construction | **Refined 3-step chain-of-thought**: Research → Gather Details → Construct JSON, with per-step guidance |
| Industry context injection | None | **`{industry_context}` placeholder** -- industry outcome map data injected when available |

### Table Filtering (Step 3)

| Aspect | V1 | V2 |
|--------|----|----|
| Prompt structure | Embedded in notebook, basic instructions | **Structured prompt** with data category definitions, universal technical patterns, industry-specific examples |
| Data categories | Not defined | **Three explicit categories**: Transactional (business events/verbs), Master (core entities/nouns), Reference (lookups/adjectives) |
| Technical patterns | Ad-hoc | **Comprehensive universal patterns list**: `*_logs`, `*_audit_trail`, `*_changelog`, `*_snapshot`, `*_backup`, `*_metadata`, `*_metrics`, `*_health`, `*_error`, `*_config`, `*_test`, `*_staging`, `*_temp` |
| Industry examples | None | **3 industry-specific few-shot examples**: Data Platform, Healthcare/Medical Devices, Logistics/Transportation |
| Classification rules | Basic | **Priority-ordered rules**: semantic analysis first, then timestamp patterns, then lookup patterns, then entity lifecycle, with a "Would a business analyst query this?" tiebreaker |

### Use Case Generation (Step 4)

| Aspect | V1 | V2 |
|--------|----|----|
| Prompt length | ~300+ lines per prompt with heavy emoji use and redundant warnings | **Concise, structured prompts** -- same information density in ~100 lines per prompt with clear markdown sections |
| Type taxonomy | 4 types: Problem, Risk, Opportunity, Improvement | **2 types**: AI, Statistical -- cleaner separation by analytical technique rather than vague business categorisation |
| Anti-hallucination | Multiple emoji-heavy warning blocks scattered throughout | **Single authoritative block** at the top with clear rule + consequence statement |
| Realism test | 5-point test buried in prompt noise | **Same 5-point test** (Logical Causation, Industry Recognition, Executive Credibility, Domain Expert Validation, Boardroom Test) but **prominently positioned** with clear "If ANY answer is No, DO NOT generate" |
| Self-check | Scattered checkboxes | **Consolidated self-check** section before output format |
| External data enrichment | Heavy emphasis on `external_api_for_*` CTEs with persona-based prompts | **Removed** -- eliminated the external data hallucination pattern entirely; V2 focuses on real table data only |
| Honesty check | CSV columns appended to every row (added noise to parsing) | **JSON-only honesty check** on prompts that need it; removed from CSV output to avoid parsing issues |
| Previous use cases feedback | Basic dedup list | **`{previous_use_cases_feedback}`** placeholder for cross-batch deduplication |
| Target count | Implicit "generate as many as possible" | **Explicit `{target_use_case_count}`** parameter for controlled generation |
| Output format | CSV with double-quoted fields + header row + honesty columns | **CSV without header row, without honesty columns** -- cleaner parsing |
| AI function pairing | Not present in AI prompt | **AI function pairing guidance** -- explicit combinations like ai_forecast + ai_query, ai_classify + ai_analyze_sentiment, ai_extract + ai_summarize |
| Statistical depth | "Use ALL applicable functions" | **"Each use case MUST leverage 3-5 statistical functions"** with explicit combination recipes (Anomaly Detection, Trend Analysis, Risk Assessment, Segmentation) |
| Industry reference use cases | None | **`{industry_reference_use_cases}`** placeholder -- injects curated use cases from industry outcome maps |
| Focus areas | Generic instruction | **`{focus_areas_instruction}`** placeholder -- allows user-directed focus on specific business areas |

### Domain Clustering (Step 5)

| Aspect | V1 | V2 |
|--------|----|----|
| Output format | CSV (use_case_id, domain) with honesty columns | **JSON array** `[{"no": 1, "domain": "Finance"}]` -- cleaner, type-safe parsing |
| Domain naming | Extremely verbose rules about CamelCase detection, anti-trick rules, split strategies (~200 lines of rules) | **Concise naming rules** -- "Each domain MUST be a SINGLE WORD", with industry examples, in ~20 lines |
| Constraint validation | Inline rules with emoji warnings | **Retry with previous violations** -- `{previous_violations}` placeholder allows the engine to feed back constraint errors for self-correction |
| Subdomain detection | CSV output with extensive formatting rules | **JSON array output** -- `[{"no": 1, "subdomain": "Revenue Optimization"}]` |
| Domain merger | Not a separate prompt | **Dedicated DOMAINS_MERGER_PROMPT** -- merges small domains into semantically related larger ones |

### Scoring (Step 6)

| Aspect | V1 | V2 |
|--------|----|----|
| Scoring scale | 1.0-5.0 scale (Value) + 1.0-5.0 (Feasibility) → Priority = (Value * 1.5) + (Feasibility * 0.5) → 2.0-10.0 scale | **0.0-1.0 normalised scale** for all scores; overall_score = (Value * 0.75) + (Feasibility * 0.25) |
| Output format | CSV with 21 columns including all sub-scores, alignment text, justification, AI_Confidence, AI_Feedback | **JSON array** with 5 fields: no, priority_score, feasibility_score, impact_score, overall_score -- dramatically simpler |
| Scoring formula | Priority = (Value × 1.5) + (Feasibility × 0.5) | **Value-First Formula**: overall_score = (Business Value × 0.75) + (Feasibility × 0.25) -- even more value-weighted |
| Sub-scores | All 12 sub-factors output as CSV columns | **Chain-of-thought**: LLM computes sub-factors internally, outputs only 4 final scores -- reduces output size and parsing complexity |
| Industry KPIs | None | **`{industry_kpis}` placeholder** -- injects industry-specific KPIs from outcome maps to guide scoring |
| Justification | Required as CSV column (long text in CSV = parsing nightmare) | **Removed from output** -- justification computed internally by LLM but not transmitted, eliminating CSV escaping issues |
| Business Priority Alignment | Required as CSV column | **Removed** -- alignment is now inferred from the score itself |

### Deduplication (Step 6b)

| Aspect | V1 | V2 |
|--------|----|----|
| Output format | CSV with single `use_case_id` column (IDs to KEEP) | **JSON array** `[{"no": 1, "action": "keep/remove", "reason": "..."}]` -- explicit keep/remove with reason |
| Approach | Keep-list (output only IDs to keep) | **Explicit action per use case** -- every use case gets a keep/remove decision with justification |
| Cross-domain dedup | Not present | **NET NEW: CROSS_DOMAIN_DEDUP_PROMPT** -- dedicated prompt to find duplicates across different domains with examples of what is/isn't a duplicate |
| Global calibration | Not present | **NET NEW: GLOBAL_SCORE_CALIBRATION_PROMPT** -- recalibrates scores across all domains for consistency on a single global scale |

---

## Scoring & Analysis Framework

### V1 Scoring Pipeline

1. Score all use cases (single pass, all domains mixed)
2. Deduplicate within the same pass
3. Apply adaptive parallelism

### V2 Scoring Pipeline (6 sub-steps)

1. **6a -- Per-domain scoring**: LLM scores priority, feasibility, impact, overall per domain separately
2. **6b -- Per-domain dedup**: LLM flags near-duplicates within each domain
3. **6c -- Cross-domain dedup**: LLM finds duplicates across different domains (NET NEW)
4. **6d -- Global calibration**: Top candidates from each domain re-scored for cross-domain consistency (NET NEW)
5. **6e -- Re-numbering**: Domain-prefixed IDs (e.g., `FIN-001-abc12345`) for clear identification
6. **6f -- Volume cap**: Maximum 200 use cases to ensure quality over quantity

### Net-New Scoring Features

- **Cross-domain deduplication** -- prevents the same concept from appearing in multiple domains under different names
- **Global score calibration** -- ensures a 0.8 in "Finance" means the same as a 0.8 in "Marketing"
- **Safety rules** -- never removes both items in a duplicate pair; always keeps the higher-scored one
- **Zod validation on LLM output** -- `ScoreItemSchema`, `DedupItemSchema`, `CalibrationItemSchema`, `CrossDomainDedupItemSchema` validate every LLM response
- **Score clamping** -- all scores clamped to [0, 1] range
- **Pure scoring functions** (`lib/domain/scoring.ts`) -- `computeOverallScore`, `rankUseCases`, `groupByDomain`, `computeDomainStats`, `getScoreTier` -- all unit-testable

---

## SQL Generation & Validation

### V1

- SQL generation prompt embedded in notebook
- SQL fix prompt with extensive error pattern matching
- SQL validated by executing and catching errors
- Fix attempts: 3 retries
- `LIMIT 10` in first CTE for sampling
- `external_api_for_*` CTEs encouraged (LLM-generated fake data)
- HONESTY_CHECK_SQL appended as SQL comments

### V2 Improvements

| Aspect | V1 | V2 |
|--------|----|----|
| Schema enforcement | Mentioned but not strict | **"ZERO TOLERANCE"** -- explicit rule that ONLY columns in the schema can be referenced, with verification step |
| CTE naming | Not specified | **Business-friendly CTE names required** -- `customer_lifetime_value`, `revenue_trend_analysis`, not `cte1`, `temp`, `base` |
| Query length | No limit (frequently generated 200+ line queries that got truncated) | **120-line hard limit** -- "Be concise -- depth of analysis is important but do NOT pad the query" |
| ai_query persona | Generic | **Mandatory persona enrichment** -- every ai_query persona MUST include `{business_name}`, relevant context, and strategic goals |
| ai_sys_prompt column | Not present | **Mandatory `ai_sys_prompt` column** -- last column in output captures the exact prompt sent to ai_query for auditability |
| End marker | Not present | **`--END OF GENERATED SQL`** end marker for reliable parsing |
| Sample data | Not present | **`{sample_data_section}` placeholder** -- optional sample rows injected for schema understanding |
| External data enrichment | Heavily encouraged (external_api_for_* CTEs with fake data) | **Completely removed** -- V2 focuses on real table data, eliminating hallucinated external data |
| LIMIT 10 | Required in first CTE | **LIMIT 10 only on final SELECT** -- allows full data flow through CTEs |
| SQL fix prompt | Extensive error patterns in notebook | **Streamlined SQL fix prompt** -- same common fixes but cleaner structure with explicit "FIX ONLY" philosophy and instruction to preserve ai_sys_prompt and end marker |
| Truncation handling | Not addressed | **Explicit truncation fix** -- "Truncated SQL / syntax error at end of input: SIMPLIFY the query: reduce to 3-5 CTEs, keep under 120 lines" |

---

## Industry Knowledge Base

### V1

- No industry-specific knowledge
- All context derived solely from the LLM's training data
- No reference use cases, KPIs, or personas

### V2 (NET NEW)

**Complete industry outcome map system** (`lib/domain/industry-outcomes.ts`) covering 10+ industries:

| Industry | Sub-Verticals |
|----------|--------------|
| Banking & Payments | Retail Banking, Commercial Banking, Wealth Management, Payments, Capital Markets |
| Insurance | Property & Casualty, Life & Health, Reinsurance |
| Healthcare & Life Sciences | Hospitals, Pharmaceuticals, Medical Devices, Clinical Research |
| Retail & Consumer Goods | E-commerce, Brick & Mortar, CPG, Grocery |
| Manufacturing | Discrete, Process, Automotive, Aerospace |
| Energy & Utilities | Oil & Gas, Electric Utilities, Renewables, Water |
| Telecom & Media | Mobile, Broadband, Media Streaming, Advertising |
| Transportation & Logistics | Airlines, Freight, Shipping, Warehousing |
| Public Sector | Government, Education, Defence |
| Digital Natives | SaaS, Marketplace, Fintech |

**Each industry includes:**
- Strategic objectives (e.g., "Drive Growth", "Protect the Firm", "Operate Efficiently")
- "Why Change" narratives per objective
- Strategic priorities with curated reference use cases (name + description + business value)
- KPIs per priority
- Personas per priority (job titles like "Head of Consumer Banking", "Chief Risk Officer")
- Suggested business domains
- Suggested business priorities

**How industry data enriches the pipeline:**

1. **Step 1 (Business Context)**: `{industry_context}` injects relevant industry background
2. **Step 4 (Use Case Generation)**: `{industry_reference_use_cases}` provides curated examples to inspire higher-quality generation
3. **Step 6 (Scoring)**: `{industry_kpis}` provides industry-specific KPIs to calibrate scoring
4. **Auto-detection**: `detectIndustryFromContext()` matches business context text against industry keywords

**Custom outcome maps**: Users can upload custom industry outcome maps via the `/outcomes/ingest` page using a multi-step flow (upload markdown → LLM parsing → review → save to Lakebase).

---

## Security & Validation

### V1

- No input validation (widget values used directly in SQL and prompts)
- No SQL injection prevention
- No prompt injection prevention
- Credentials managed per-notebook
- No security headers

### V2 (NET NEW)

**Input Validation (`lib/validation.ts`)**:
- **SQL identifier validation** -- strict regex `/^[a-zA-Z0-9_\-]+$/` for all catalog/schema/table names
- **Zod schemas** for every API route (`CreateRunSchema`, `MetadataQuerySchema`)
- **UUID validation** for all run IDs
- **LLM output validation** -- `validateLLMArray()` validates every LLM response against Zod schemas, skipping invalid items with warnings
- **Request body parsing** -- `safeParseBody()` safely parses and validates JSON request bodies

**Prompt Injection Protection**:
- **User input sandboxing** -- all user-supplied variables wrapped with `---BEGIN USER DATA---` / `---END USER DATA---` delimiters
- **Delimiter stripping** -- any attempt to close delimiters in user input is stripped before wrapping
- **USER_INPUT_VARIABLES set** -- explicit list of which variables come from user input

**Prompt Versioning**:
- **Content-addressable hashes** -- SHA-256 truncated to 8 chars, auto-computed at startup
- **Stored per-run** -- `generationOptions.promptVersions` records exact prompt versions used
- **Full reproducibility** -- any prompt change produces a new version hash

**Infrastructure Security**:
- **Security headers** via `next.config.ts`: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- **No `poweredByHeader`** -- disabled to reduce fingerprinting
- **Fetch timeouts** -- `AbortController` wrappers with granular timeouts (AUTH 15s, SQL_SUBMIT 60s, SQL_POLL 15s, SQL_CHUNK 30s, WORKSPACE 30s)
- **Non-retryable error detection** -- 4xx errors and permission errors don't waste retry attempts
- **Documented threat model** in `SECURITY_ARCHITECTURE.md`

---

## Persistence & State Management

### V1

- All state in Python variables (lost on restart)
- Outputs written to workspace files
- No run history, no comparison capability
- No audit trail

### V2 (NET NEW)

**Lakebase Schema (7 tables via Prisma)**:

| Table | Purpose |
|-------|---------|
| `inspire_runs` | Run config, status, progress %, business context, stepLog, generationOptions (JSON) |
| `inspire_use_cases` | Use cases with scores, SQL, domain, subdomain -- linked to runs |
| `inspire_exports` | Export records (format, path, timestamp) |
| `inspire_prompt_logs` | Every LLM call logged: promptKey, version, model, temperature, rendered prompt, raw response, honesty score, duration, success/error |
| `inspire_metadata_cache` | Metadata snapshots for reuse across runs |
| `inspire_outcome_maps` | Custom industry outcome maps |
| `inspire_genie_spaces` | Genie space tracking |
| `inspire_activity_log` | Activity events (user actions, exports, run starts) |

**Key patterns**:
- **Row mappers** -- `dbRowToRun()`, `dbRowToUseCase()` convert DB rows to typed domain objects
- **Cascade deletes** -- deleting a run cascades to use cases, exports, prompt logs, genie spaces
- **JSON packing** -- `generationOptions` stores options, sampleRowsPerTable, industry, appVersion, promptVersions, stepLog
- **Fire-and-forget logging** -- `insertPromptLog()` and `logActivity()` don't block the pipeline

---

## Export & Output

### V1

- Excel, PDF, PowerPoint generated via Python libraries
- Written to local workspace directory
- SQL notebooks written as .py files via Workspace API
- Single language per run

### V2 Improvements

| Aspect | V1 | V2 |
|--------|----|----|
| Generation | File-based (written to disk) | **In-memory generation** -- Excel/PDF/PPTX created as buffers, streamed to browser |
| Access | Navigate to workspace folder | **One-click download** via API route `GET /api/export/[runId]?format=excel|pdf|pptx|notebooks` |
| Branding | Basic | **Consistent Databricks branding** -- DB_DARK, DB_RED colours, logos, footers across all formats |
| Score formatting | Basic | **Conditional formatting** -- green/amber/red for score tiers in Excel |
| Structure | Flat list | **Domain-organised sections** -- cover page, executive summary, table of contents, per-domain dividers and summaries |
| Notebooks | Python .py files | **Jupyter .ipynb format** -- markdown + SQL cells, deployed via Workspace REST API |
| Export tracking | None | **Export records in Lakebase** -- every export logged with format, path, timestamp |
| Notebook deployment | Direct file write | **User-scoped deployment** -- notebooks go to `/Users/<email>/inspire_gen/<run>/` using app-level auth |

---

## User Interface & Experience

### V1

- Databricks notebook widgets (10 text/dropdown/multiselect widgets)
- "Run All" execution
- Console output for progress
- No visualisation of results

### V2 (NET NEW -- complete web application)

**Pages:**

| Page | Features |
|------|----------|
| **Dashboard** (`/`) | KPI cards (total runs, use cases, avg score, domains), ScoreDistribution chart, DomainBreakdown chart, TypeSplit chart, recent runs list, ActivityFeed, empty state |
| **New Discovery** (`/configure`) | ConfigForm with CatalogBrowser (live UC catalog/schema selection), industry selector with auto-suggestions, business priority multi-select, domain hints, sampling configuration |
| **Run Detail** (`/runs/[runId]`) | Real-time progress bar, tabbed interface (Overview, Use Cases, Genie Spaces, AI Observability), score charts (ScoreRadarChart, StepDurationChart), one-click export toolbar |
| **Run Comparison** (`/runs/compare`) | Side-by-side run comparison with overlap analysis and config diff |
| **Industry Outcomes** (`/outcomes`) | Browse 10+ industry outcome maps with search, accordion drill-down, strategic objectives, use cases, KPIs, personas |
| **Outcome Map Ingest** (`/outcomes/ingest`) | Multi-step upload flow: upload markdown → LLM parsing → review → save |
| **Settings** (`/settings`) | Profile, data sampling config, export defaults, local settings |

**UI Components:**
- Sidebar navigation with active route highlighting
- Dark/light theme toggle
- Mobile-responsive with Sheet-based mobile nav
- Toast notifications (Sonner)
- Skeleton loaders for async data
- Error cards with retry capability
- Version badge in sidebar

**Charts (Recharts):**
- ScoreDistributionChart -- histogram of score distribution
- DomainBreakdownChart -- use case count by domain
- TypeSplitChart -- AI vs Statistical ratio
- StepDurationChart -- pipeline step timing
- ScoreRadarChart -- multi-dimensional score radar

---

## Observability & Debugging

### V1

- `log_print()` to console with timestamps
- No persistent logs
- No prompt auditing
- No timing information beyond elapsed wall time

### V2 (NET NEW)

**Prompt Logging (`inspire_prompt_logs` table)**:
Every LLM call is logged with:
- `promptKey` -- which template was used
- `promptVersion` -- content hash of the template
- `model` -- which model endpoint was called
- `temperature` -- what temperature was used
- `renderedPrompt` -- the fully rendered prompt text (for debugging)
- `rawResponse` -- the complete LLM response
- `honestyScore` -- extracted self-assessment score
- `durationMs` -- how long the call took
- `success` / `errorMessage` -- whether it succeeded and any error

**AI Observability Tab**:
The run detail page has a dedicated "AI Observability" tab showing:
- Every prompt log for the run
- Honesty scores with warning thresholds
- Duration breakdown per step
- Model used per call
- Success/failure rates

**Step Log**:
- `stepLog` array in run's `generationOptions` records:
  - Step name
  - Start/end timestamps
  - Duration
  - Status (success/failure)
  - Message

**Structured Logging (`lib/logger.ts`)**:
- JSON structured logs in production
- Formatted logs in development
- Log levels with context objects

**Low Honesty Score Alerts**:
- `LOW_HONESTY_THRESHOLD = 0.3` -- any LLM response scoring below this triggers a warning log

---

## Net-New Features

These capabilities exist in V2 with no equivalent in V1:

| Feature | Description |
|---------|-------------|
| **Industry Outcome Maps** | 10+ curated industry knowledge bases with strategic objectives, use cases, KPIs, and personas |
| **Custom Outcome Map Ingest** | Upload + LLM-parse custom industry documents |
| **Cross-Domain Deduplication** | Dedicated prompt to find duplicates across different business domains |
| **Global Score Calibration** | Recalibrate scores across all domains for consistency |
| **AI Observability** | Full audit trail of every LLM call with prompt, response, honesty score, and timing |
| **Prompt Versioning** | SHA-256 content-addressable hashes auto-tracked per run |
| **Prompt Injection Protection** | User input sandboxing with delimiter wrapping |
| **Run Comparison** | Side-by-side comparison of two runs with overlap analysis |
| **Dashboard Analytics** | KPIs, charts, activity feed, score distributions |
| **CatalogBrowser** | Live Unity Catalog browsing for catalog/schema selection |
| **Genie Space Integration** | Create and track Genie AI Spaces from generated use cases |
| **Activity Log** | Audit trail of all user actions |
| **Metadata Caching** | Cached metadata snapshots for reuse across runs |
| **Data Sampling** | Optional sample rows per table injected into SQL generation prompts |
| **LLM Output Validation** | Zod schemas validate every LLM response with graceful degradation |
| **Non-Retryable Error Detection** | 4xx errors skip retry logic |
| **Fetch Timeouts** | Granular AbortController timeouts per operation type |
| **Domain-Prefixed IDs** | Use cases get IDs like `FIN-001-abc12345` for clear identification |
| **Volume Cap** | Maximum 200 use cases per run to ensure quality |
| **Health Check API** | `GET /api/health` -- DB + warehouse connectivity + version |
| **PARSE_OUTCOME_MAP Prompt** | Dedicated prompt to parse unstructured outcome map documents into structured JSON |
| **Outcome Map Registry API** | API to browse, search, create, and delete industry outcome maps |

---

## Removed / Deprecated

These V1 features were intentionally removed or replaced:

| V1 Feature | Reason for Removal |
|------------|-------------------|
| **External API enrichment** (`external_api_for_*` CTEs) | Encouraged LLM hallucination of fake external data; V2 focuses on real table data only |
| **HONESTY_CHECK_CSV** | Added noise to CSV parsing (extra columns confused the ±2 tolerance); quality validated via output structure checks instead |
| **HONESTY_CHECK_SQL** | Cluttered SQL output; removed in favour of structured prompt logging |
| **HONESTY_CHECK_TABLE** | Same parsing issues as CSV honesty; replaced by JSON honesty checks where needed |
| **Unstructured Data Documents** (`UNSTRUCTURED_DATA_DOCUMENTS_PROMPT`) | Volume-based document processing was rarely used; focus shifted to structured data |
| **Unstructured Data Use Cases** (`UNSTRUCTURED_DATA_USE_CASE_GEN_PROMPT`) | Same as above |
| **Dashboard Generation** (`DASHBOARDS_GEN_PROMPT`) | Replaced by built-in dashboard analytics in the web UI |
| **Adaptive Parallelism Calculator** | Complex parallelism tuning with 5+ factors replaced by simpler async patterns in the web app |
| **`LIMIT 10` in first CTE** | Replaced by `LIMIT 10` only on final SELECT for better data flow |
| **Use case type taxonomy** (Problem, Risk, Opportunity, Improvement) | Replaced with cleaner AI/Statistical classification |
| **Solution Accelerators** (`dbx-acc-*`) | Removed; system focuses 100% on AI Functions and Statistical Functions |
| **`INTERPRET_USER_SQL_REGENERATION_PROMPT`** | Specialized SQL re-generation mode replaced by simpler re-run capability |
| **Sample Result Generation** operation | Removed as a separate operation; SQL execution built into the pipeline |
| **Re-generate SQL** operation | Replaced by ability to re-run individual pipeline steps |

---

## Summary Matrix

| Dimension | V1 (Notebook) | V2 (Web App) | Improvement |
|-----------|---------------|--------------|-------------|
| **Architecture** | Monolithic 30K-line notebook | Modular TypeScript app with 7 layers | Ground-up redesign |
| **Deployment** | Manual cluster + notebook | Databricks App (auto-deploy) | Zero-config deployment |
| **Authentication** | Inherits notebook user | Auto-auth via platform env vars | Multi-auth (user/PAT/OAuth) |
| **State** | In-memory (lost on restart) | Lakebase (7 Prisma tables) | Full persistence + history |
| **Pipeline** | Sequential cells | Async engine with 7 modular steps | Progress tracking, error recovery |
| **Prompt Quality** | Verbose, emoji-heavy, redundant | Concise, structured, evidence-based | Cleaner, more effective prompts |
| **Scoring** | 1-10 scale, single pass | 0-1 normalised, 6 sub-steps | Cross-domain calibration, dedup |
| **SQL Generation** | No length limit, external data encouraged | 120-line limit, real data only | Higher quality, no hallucination |
| **Industry Knowledge** | None | 10+ curated industry outcome maps | Domain expertise built-in |
| **Security** | None | Input validation, prompt sandboxing, SQL injection prevention | Defense in depth |
| **Validation** | Ad-hoc Python checks | Zod schemas for all I/O | Type-safe throughout |
| **Observability** | Print statements | Full prompt audit trail + AI observability tab | Every LLM call logged |
| **Exports** | File-based | In-memory + one-click download | Streamlined UX |
| **UI** | 10 widgets + console | Full web app with dashboard, charts, comparison | Complete transformation |
| **Testing** | None | Vitest + CI (lint + typecheck + tests) | Quality assurance |
| **Documentation** | Notebook markdown cells | AGENTS.md, ARCHITECTURE.md, DEPLOYMENT.md, PIPELINE.md, PROMPTS.md, SECURITY_ARCHITECTURE.md | Comprehensive docs |

---

*This document reflects the state of the codebase as of February 2026.*

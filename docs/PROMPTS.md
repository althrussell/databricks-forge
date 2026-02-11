# Prompt Template Catalog

> All prompt templates used by the pipeline, extracted from
> `docs/references/databricks_inspire_v34.ipynb`.

## Template Index

| # | Template Key | Pipeline Step | Output Format |
|---|-------------|---------------|---------------|
| 1 | BUSINESS_CONTEXT_WORKER_PROMPT | business-context | JSON (honesty-wrapped) |
| 2 | FILTER_BUSINESS_TABLES_PROMPT | table-filtering | CSV |
| 3 | AI_USE_CASE_GEN_PROMPT | usecase-generation | CSV |
| 4 | STATS_USE_CASE_GEN_PROMPT | usecase-generation | CSV |
| 5 | BASE_USE_CASE_GEN_PROMPT | (base for 3 & 4) | CSV |
| 6 | UNSTRUCTURED_DATA_USE_CASE_GEN_PROMPT | usecase-generation (optional) | CSV |
| 7 | UNSTRUCTURED_DATA_DOCUMENTS_PROMPT | usecase-generation (optional) | Markdown table |
| 8 | DOMAIN_FINDER_PROMPT | domain-clustering | CSV |
| 9 | SUBDOMAIN_DETECTOR_PROMPT | domain-clustering | CSV |
| 10 | DOMAINS_MERGER_PROMPT | domain-clustering | JSON (honesty-wrapped) |
| 11 | SCORE_USE_CASES_PROMPT | scoring | CSV |
| 12 | REVIEW_USE_CASES_PROMPT | scoring | CSV |
| 13 | USE_CASE_SQL_GEN_PROMPT | (future: SQL gen) | SQL |
| 14 | USE_CASE_SQL_FIX_PROMPT | (future: SQL gen) | SQL |
| 15 | INTERPRET_USER_SQL_REGENERATION_PROMPT | (future: SQL regen) | JSON |
| 16 | SUMMARY_GEN_PROMPT | export (PDF/PPTX) | CSV |
| 17 | DASHBOARDS_GEN_PROMPT | (out of scope) | CSV |
| 18 | KEYWORDS_TRANSLATE_PROMPT | export (multi-lang) | JSON |
| 19 | USE_CASE_TRANSLATE_PROMPT | export (multi-lang) | JSON |

---

## Template Details

### 1. BUSINESS_CONTEXT_WORKER_PROMPT

**Step:** business-context

**Purpose:** Extracts business context, strategic goals, priorities, value chain,
and revenue model from an industry/business name.

**Input variables:**
- `{industry}` -- detected or user-supplied industry
- `{name}` -- business/organisation name
- `{type_description}` -- description of the analysis type
- `{type_label}` -- label for the output type

**Expected output:** JSON object wrapped in honesty scoring:
```json
{
  "honesty_score": 0.85,
  "industries": "...",
  "strategic_goals": "...",
  "business_priorities": "...",
  "strategic_initiative": "...",
  "value_chain": "...",
  "revenue_model": "...",
  "additional_context": "..."
}
```

---

### 2. FILTER_BUSINESS_TABLES_PROMPT

**Step:** table-filtering

**Purpose:** Classifies tables as business-relevant vs technical/system tables.

**Input variables:**
- `{business_name}` -- organisation name
- `{industry}` -- detected industry
- `{business_context}` -- from Step 1
- `{exclusion_strategy}` -- rules for excluding tables
- `{additional_context_section}` -- extra context
- `{strategy_rules}` -- filtering strategy rules

**Expected output:** CSV with columns:
`table_fqn, classification, reason`

---

### 3. AI_USE_CASE_GEN_PROMPT

**Step:** usecase-generation

**Purpose:** Generates AI-focused use cases leveraging ai_forecast, ai_classify,
ai_query, ai_summarize, ai_extract, etc.

**Input variables:** (inherits from BASE_USE_CASE_GEN_PROMPT)
- `{business_context}`, `{strategic_goals}`, `{business_priorities}`
- `{strategic_initiative}`, `{value_chain}`, `{revenue_model}`
- `{additional_context_section}`, `{focus_areas_instruction}`
- `{ai_functions_summary}` -- summary of available AI functions
- `{statistical_functions_detailed}` -- (empty for this prompt)
- `{schema_markdown}` -- table/column definitions
- `{foreign_key_relationships}` -- FK relationships
- `{previous_use_cases_feedback}` -- feedback from prior passes

**Expected output:** CSV with columns:
`No, Name, type, Analytics Technique, Statement, Solution, Business Value, Beneficiary, Sponsor, Tables Involved, Technical Design`

---

### 4. STATS_USE_CASE_GEN_PROMPT

**Step:** usecase-generation

**Purpose:** Generates statistics-focused use cases (anomaly detection,
simulation, geospatial, trend analysis, etc.)

**Input variables:** Same as AI_USE_CASE_GEN_PROMPT but with:
- `{statistical_functions_detailed}` -- detailed statistical functions reference
- `{ai_functions_summary}` -- (empty for this prompt)

**Expected output:** Same CSV format as AI_USE_CASE_GEN_PROMPT.

---

### 5. DOMAIN_FINDER_PROMPT

**Step:** domain-clustering

**Purpose:** Assigns use cases to 3-25 business domains (one-word names).

**Input variables:**
- `{business_name}`, `{industries}`, `{business_context}`
- `{use_cases_csv}` -- all use cases as CSV
- `{previous_violations}` -- any prior constraint violations
- `{output_language}` -- target language

**Expected output:** CSV with columns:
`No, Domain`

---

### 6. SUBDOMAIN_DETECTOR_PROMPT

**Step:** domain-clustering

**Purpose:** Assigns 2-10 subdomains within a single domain.

**Input variables:**
- `{domain_name}` -- the parent domain
- `{business_name}`, `{industries}`, `{business_context}`
- `{use_cases_csv}` -- use cases in this domain
- `{previous_violations}` -- prior violations
- `{output_language}` -- target language

**Expected output:** CSV with columns:
`No, Subdomain`

---

### 7. SCORE_USE_CASES_PROMPT

**Step:** scoring

**Purpose:** Scores use cases on ROI, strategic alignment, feasibility, and
overall priority.

**Input variables:**
- `{business_context}`, `{strategic_goals}`, `{business_priorities}`
- `{strategic_initiative}`, `{value_chain}`, `{revenue_model}`
- `{use_case_markdown}` -- use cases formatted as markdown table

**Expected output:** CSV with columns:
`No, priority_score, feasibility_score, impact_score, overall_score`

---

### 8. REVIEW_USE_CASES_PROMPT

**Step:** scoring

**Purpose:** Detects duplicate and low-value use cases for removal.

**Input variables:**
- `{total_count}` -- total use case count
- `{use_case_markdown}` -- use cases formatted as markdown table

**Expected output:** CSV with columns:
`No, action, reason` (action = keep/remove)

---

### 9. SUMMARY_GEN_PROMPT

**Step:** export (PDF/PPTX generation)

**Purpose:** Generates executive and domain summaries for documents.

**Input variables:**
- `{business_name}`, `{total_cases}`, `{domain_list}`, `{output_language}`

**Expected output:** CSV with summary text per domain.

---

## Function Registries

### AI_FUNCTIONS

Used in AI use case generation prompts to guide the LLM on available Databricks
AI SQL functions:

| Function | Description |
|----------|-------------|
| ai_analyze_sentiment | Sentiment analysis on text columns |
| ai_classify | Text classification into categories |
| ai_extract | Entity extraction from text |
| ai_fix_grammar | Grammar correction |
| ai_mask | PII masking |
| ai_parse_document | Document parsing (unstructured) |
| ai_similarity | Text similarity scoring |
| ai_summarize | Text summarisation |
| ai_translate | Language translation |
| ai_query | Free-form LLM queries |
| ai_forecast | Time series forecasting |
| vector_search | Vector similarity search |

### STATISTICAL_FUNCTIONS

Used in statistical use case generation prompts:

| Category | Functions |
|----------|-----------|
| Central Tendency | AVG, MEDIAN, MODE |
| Dispersion | STDDEV_POP, STDDEV_SAMP, VAR_POP, MIN, MAX, RANGE |
| Distribution Shape | SKEWNESS, KURTOSIS |
| Percentiles | PERCENTILE_APPROX, PERCENTILE, APPROX_PERCENTILE |
| Trend Analysis | REGR_SLOPE, REGR_INTERCEPT, REGR_R2 |
| Correlation | CORR, COVAR_POP |
| Volatility | COEFF_VAR |
| Outlier Detection | Z_SCORE, IQR_THRESHOLD |
| Ranking | CUME_DIST, NTILE, DENSE_RANK, ROW_NUMBER |
| Time Series | LAG, LEAD, RUNNING_SUM, MOVING_AVG |
| OLAP | ROLLUP, CUBE, PIVOT |

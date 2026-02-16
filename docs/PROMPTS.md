# Prompt Template Catalog

> All prompt templates used by the pipeline, defined in
> `lib/ai/templates.ts`. Auto-versioned via SHA-256 content hashes —
> see `PROMPT_VERSIONS` in the same file.

## Template Index

| # | Template Key | Pipeline Step | Output Format | Status |
|---|-------------|---------------|---------------|--------|
| 1 | BUSINESS_CONTEXT_WORKER_PROMPT | business-context | JSON (honesty-wrapped) | Active |
| 2 | FILTER_BUSINESS_TABLES_PROMPT | table-filtering | CSV | Active |
| 3 | BASE_USE_CASE_GEN_PROMPT | (base for 4 & 5) | CSV | Active |
| 4 | AI_USE_CASE_GEN_PROMPT | usecase-generation | CSV | Active |
| 5 | STATS_USE_CASE_GEN_PROMPT | usecase-generation | CSV | Active |
| 6 | DOMAIN_FINDER_PROMPT | domain-clustering | JSON array | Active |
| 7 | SUBDOMAIN_DETECTOR_PROMPT | domain-clustering | JSON array | Active |
| 8 | DOMAINS_MERGER_PROMPT | domain-clustering | JSON (honesty-wrapped) | Active |
| 9 | SCORE_USE_CASES_PROMPT | scoring | JSON array | Active |
| 10 | REVIEW_USE_CASES_PROMPT | scoring (dedup) | JSON array | Active |
| 11 | GLOBAL_SCORE_CALIBRATION_PROMPT | scoring (calibration) | JSON array | Active |
| 12 | CROSS_DOMAIN_DEDUP_PROMPT | scoring (cross-domain dedup) | JSON array | Active |
| 13 | USE_CASE_SQL_GEN_PROMPT | sql-generation | Raw SQL | Active |
| 14 | USE_CASE_SQL_FIX_PROMPT | sql-generation (fix/retry) | Raw SQL | Active |
| 15 | SUMMARY_GEN_PROMPT | export (PDF/PPTX) | JSON array | Defined, not wired |
| 16 | KEYWORDS_TRANSLATE_PROMPT | export (multi-lang) | JSON | Defined, not wired |
| 17 | USE_CASE_TRANSLATE_PROMPT | export (multi-lang) | JSON | Defined, not wired |

---

## Template Details

### 1. BUSINESS_CONTEXT_WORKER_PROMPT

**Step:** business-context  
**Purpose:** Extracts business context, strategic goals, priorities, value chain,
and revenue model from an industry/business name.

**Input variables:**
- `{industry}` — detected or user-supplied industry
- `{name}` — business/organisation name
- `{type_description}` — description of the analysis type
- `{type_label}` — label for the output type

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
- `{business_name}` — organisation name
- `{industry}` — detected industry
- `{business_context}` — from Step 1
- `{exclusion_strategy}` — rules for excluding tables
- `{additional_context_section}` — extra context
- `{strategy_rules}` — filtering strategy rules
- `{tables_markdown}` — markdown list of tables

**Expected output:** CSV with columns:
`table_fqn, classification, reason`

---

### 3. BASE_USE_CASE_GEN_PROMPT

**Step:** usecase-generation (base template)  
**Purpose:** Base prompt for use case generation; extended by AI and Stats prompts.

**Input variables:**
- `{business_context}`, `{strategic_goals}`, `{business_priorities}`
- `{strategic_initiative}`, `{value_chain}`, `{revenue_model}`
- `{additional_context_section}`, `{focus_areas_instruction}`
- `{ai_functions_summary}`, `{statistical_functions_detailed}`
- `{schema_markdown}`, `{foreign_key_relationships}`
- `{previous_use_cases_feedback}`, `{target_use_case_count}`

**Expected output:** CSV with columns:
`No, Name, type, Analytics Technique, Statement, Solution, Business Value, Beneficiary, Sponsor, Tables Involved, Technical Design`

---

### 4. AI_USE_CASE_GEN_PROMPT

**Step:** usecase-generation  
**Purpose:** Generates AI-focused use cases leveraging ai_forecast, ai_classify,
ai_query, ai_summarize, ai_extract, etc.

**Input variables:** Same as BASE_USE_CASE_GEN_PROMPT with:
- `{ai_functions_summary}` — summary of available AI functions
- `{statistical_functions_detailed}` — (empty for this prompt)

**Expected output:** Same CSV format as BASE_USE_CASE_GEN_PROMPT.

---

### 5. STATS_USE_CASE_GEN_PROMPT

**Step:** usecase-generation  
**Purpose:** Generates statistics-focused use cases (anomaly detection,
simulation, geospatial, trend analysis, etc.)

**Input variables:** Same as BASE_USE_CASE_GEN_PROMPT with:
- `{statistical_functions_detailed}` — detailed statistical functions reference
- `{ai_functions_summary}` — (empty for this prompt)

**Expected output:** Same CSV format as BASE_USE_CASE_GEN_PROMPT.

---

### 6. DOMAIN_FINDER_PROMPT

**Step:** domain-clustering  
**Purpose:** Assigns use cases to 3-25 business domains (one-word names).

**Input variables:**
- `{business_name}`, `{industries}`, `{business_context}`
- `{use_cases_csv}` — all use cases as CSV
- `{previous_violations}` — any prior constraint violations
- `{output_language}` — target language

**Expected output:** JSON array:
```json
[{"no": 1, "domain": "Finance"}, {"no": 2, "domain": "Marketing"}]
```

---

### 7. SUBDOMAIN_DETECTOR_PROMPT

**Step:** domain-clustering  
**Purpose:** Assigns 2-10 subdomains within a single domain.

**Input variables:**
- `{domain_name}` — the parent domain
- `{business_name}`, `{industries}`, `{business_context}`
- `{use_cases_csv}` — use cases in this domain
- `{previous_violations}` — prior violations
- `{output_language}` — target language

**Expected output:** JSON array:
```json
[{"no": 1, "subdomain": "Revenue Optimization"}, {"no": 2, "subdomain": "Cost Control"}]
```

---

### 8. DOMAINS_MERGER_PROMPT

**Step:** domain-clustering  
**Purpose:** Merges small domains (below minimum threshold) into larger ones.

**Input variables:**
- `{min_cases_per_domain}` — minimum use cases per domain
- `{domain_info_str}` — domain name + count listing

**Expected output:** JSON object (honesty-wrapped):
```json
{"SmallDomain1": "TargetDomain1", "SmallDomain2": "TargetDomain2"}
```

---

### 9. SCORE_USE_CASES_PROMPT

**Step:** scoring  
**Purpose:** Scores use cases on priority, feasibility, impact, and overall dimensions.

**Input variables:**
- `{business_context}`, `{strategic_goals}`, `{business_priorities}`
- `{strategic_initiative}`, `{value_chain}`, `{revenue_model}`
- `{use_case_markdown}` — use cases formatted as markdown table

**Expected output:** JSON array:
```json
[{"no": 1, "priority_score": 0.7, "feasibility_score": 0.6, "impact_score": 0.8, "overall_score": 0.72}]
```

---

### 10. REVIEW_USE_CASES_PROMPT

**Step:** scoring (per-domain deduplication)  
**Purpose:** Detects duplicate and low-value use cases for removal.

**Input variables:**
- `{total_count}` — total use case count
- `{use_case_markdown}` — use cases formatted as markdown table

**Expected output:** JSON array:
```json
[{"no": 1, "action": "keep", "reason": "Unique concept"}, {"no": 2, "action": "remove", "reason": "Duplicate of #1"}]
```

---

### 11. GLOBAL_SCORE_CALIBRATION_PROMPT

**Step:** scoring (global calibration)  
**Purpose:** Re-calibrates scores across all domains for consistency on a single global scale.

**Input variables:**
- `{business_context}`, `{strategic_goals}`
- `{use_case_markdown}` — top use cases from each domain

**Expected output:** JSON array:
```json
[{"no": 1, "overall_score": 0.72}, {"no": 2, "overall_score": 0.55}]
```

---

### 12. CROSS_DOMAIN_DEDUP_PROMPT

**Step:** scoring (cross-domain deduplication)  
**Purpose:** Identifies semantically duplicate use cases across different domains.

**Input variables:**
- `{use_case_markdown}` — all use cases with domain and score

**Expected output:** JSON array:
```json
[{"no": 5, "duplicate_of": 12, "reason": "Same churn prediction concept, #12 has higher score"}]
```

---

### 13. USE_CASE_SQL_GEN_PROMPT

**Step:** sql-generation  
**Purpose:** Generates production-grade Databricks SQL for a single use case.

**Input variables:**
- `{business_name}`, `{business_context}`, `{strategic_goals}`
- `{business_priorities}`, `{strategic_initiative}`, `{value_chain}`, `{revenue_model}`
- `{use_case_id}`, `{use_case_name}`, `{business_domain}`
- `{use_case_type}`, `{analytics_technique}`, `{statement}`, `{solution}`
- `{tables_involved}`, `{directly_involved_schema}`, `{foreign_key_relationships}`
- `{sample_data_section}`, `{ai_functions_summary}`, `{statistical_functions_detailed}`
- `{sql_model_serving}` — model endpoint for ai_query calls

**Expected output:** Raw SQL (no markdown fences).

---

### 14. USE_CASE_SQL_FIX_PROMPT

**Step:** sql-generation (fix/retry)  
**Purpose:** Fixes SQL that failed execution by incorporating the error message.

**Input variables:**
- `{use_case_name}`, `{use_case_id}`
- `{original_sql}` — the SQL that failed
- `{error_message}` — the error from execution
- `{directly_involved_schema}` — available tables and columns
- `{foreign_key_relationships}` — FK relationships

**Expected output:** Raw SQL (corrected).

---

### 15. SUMMARY_GEN_PROMPT

**Step:** export (PDF/PPTX generation) — **not yet wired**  
**Purpose:** Generates executive and domain summaries for documents.

**Input variables:**
- `{business_name}`, `{total_cases}`, `{domain_list}`, `{output_language}`

**Expected output:** JSON array of summary objects.

---

### 16. KEYWORDS_TRANSLATE_PROMPT

**Step:** export (multi-language) — **not yet wired**  
**Purpose:** Translates JSON keyword values into a target language.

**Input variables:**
- `{target_language}`, `{json_payload}`

**Expected output:** Translated JSON.

---

### 17. USE_CASE_TRANSLATE_PROMPT

**Step:** export (multi-language) — **not yet wired**  
**Purpose:** Translates use case data into a target language.

**Input variables:**
- `{target_language}`, `{json_payload}`

**Expected output:** Translated JSON.

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

---

## Versioning

Prompt templates are version-tracked via content-addressable SHA-256 hashes
computed at startup. The `PROMPT_VERSIONS` map in `lib/ai/templates.ts`
provides a `Record<PromptKey, string>` where each value is an 8-character
hash of the template content.

These hashes are stored with each pipeline run (in `generationOptions.promptVersions`)
so that any change to a prompt template is automatically traceable to specific runs.

/**
 * Prompt templates for the Inspire pipeline.
 *
 * Ported from docs/references/databricks_inspire_v34.ipynb PROMPT_TEMPLATES dict.
 * Each template uses {placeholder} syntax for variable injection.
 *
 * IMPORTANT: When modifying prompts, always update docs/PROMPTS.md in parallel.
 */

import { createHash } from "crypto";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Honesty check appendices
// ---------------------------------------------------------------------------

const HONESTY_CHECK_JSON = `

### HONESTY CHECK (MANDATORY)
Your response MUST be a valid JSON object that starts with:
{"honesty_score":

Include these fields:
- "honesty_score": A number between 0.0 and 1.0 reflecting your confidence in the quality and accuracy of your response
- "honesty_justification": A brief explanation of your confidence score
`;

// HONESTY_CHECK_CSV removed -- added noise to CSV parsing (extra columns
// confused the ±2 tolerance) and was never acted upon. Quality is now
// validated via output structure checks instead.

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export const PROMPT_TEMPLATES = {
  // -------------------------------------------------------------------------
  // Step 1: Business Context
  // -------------------------------------------------------------------------
  BUSINESS_CONTEXT_WORKER_PROMPT: `### PERSONA

You are a **Principal Business Analyst** and recognized industry specialist with 15+ years of deep expertise in the \`{industry}\` industry. You are a master of business strategy, operations, and data-driven decision making.

### CONTEXT

**Assignment Details:**
- Industry/Business Name: \`{name}\`
- Type: {type_description}
- Target: Research and document comprehensive business context for this {type_label}

### WORKFLOW (follow these steps in order)

**Step 1 -- Research:** Use your deep industry knowledge of \`{industry}\` to understand the {type_label} named \`{name}\`. Consider its market position, competitive landscape, regulatory environment, and operational model.

**Step 2 -- Gather Details:** For each of the 7 output fields below, gather specific, concrete details. Avoid generic statements that could apply to any business.

**Step 3 -- Construct JSON:** Format your findings as a single valid JSON object.

### OUTPUT FIELDS (all 7 required)

1. **industries** -- The primary and secondary industries this business operates in. Be specific (e.g., "Commercial Banking, Wealth Management, Insurance" not just "Financial Services").

2. **strategic_goals** -- Select 3-7 goals from this standard taxonomy, with a brief elaboration for each:
   - "Reduce Cost" (automation, efficiency improvements, waste reduction)
   - "Boost Productivity" (faster processes, better tools, streamlined workflows)
   - "Increase Revenue" (new revenue streams, upselling, cross-selling, market expansion)
   - "Mitigate Risk" (fraud detection, compliance, security, audit trails)
   - "Protect Revenue" (churn prevention, retention, customer satisfaction)
   - "Align to Regulations" (compliance automation, regulatory reporting, audit support)
   - "Improve Customer Experience" (personalization, faster service, quality improvements)
   - "Enable Data-Driven Decisions" (analytics, insights, forecasting, predictions)
   Format as: "Goal1 (elaboration specific to this business), Goal2 (elaboration), ..."

3. **business_priorities** -- The immediate and near-term focus areas. Must be specific to this business, not generic. Reference concrete operational areas, product lines, or market segments.

4. **strategic_initiative** -- The key strategic initiative(s) driving growth or transformation. Connect to the goals above -- explain HOW the initiative achieves the goals.

5. **value_chain** -- The end-to-end value chain: primary activities that create value for the customer. Walk through the chain from input to output (e.g., "Raw material procurement -> Manufacturing -> Quality Control -> Distribution -> Retail -> After-sales service").

6. **revenue_model** -- How revenue is generated: streams, pricing models, subscription vs transactional, key revenue drivers. Be specific about what generates the most revenue.

7. **additional_context** -- Domain-specific context relevant for generating data analytics use cases. Include: key performance indicators, industry benchmarks, seasonal patterns, regulatory constraints, or technology landscape relevant to this business.

### QUALITY REQUIREMENTS

- Every field value must be a descriptive string (not a list or nested object)
- Each field should be 2-5 sentences of substantive content
- Be SPECIFIC to this business and industry -- generic answers are unacceptable
- Strategic goals MUST come from the taxonomy above

{industry_context}

### OUTPUT FORMAT

Return a single valid JSON object with the 7 fields listed above. Do NOT include any text outside the JSON.
${HONESTY_CHECK_JSON}`,

  // -------------------------------------------------------------------------
  // Step 3: Table Filtering
  // -------------------------------------------------------------------------
  FILTER_BUSINESS_TABLES_PROMPT: `You are a **Senior Data Architect** and **Business Domain Expert** specializing in identifying business-relevant data assets.

**CRITICAL TASK**: Analyze the provided list of database tables and classify each one as either:
1. **BUSINESS** - Contains ANY business data related to operations, transactions, customers, products, services, or business processes
2. **TECHNICAL** - Contains PURELY IT INFRASTRUCTURE data with NO business relevance (backend system logs, database monitoring, application debugging, IT governance)

**BUSINESS CONTEXT**:
- **Business Name**: {business_name}
- **Industry**: {industry}
- **Business Description**: {business_context}
- **Exclusion Strategy**: {exclusion_strategy}

{additional_context_section}

### DATA CATEGORY DEFINITIONS (use to guide classification)

**TRANSACTIONAL DATA (business events -- "verbs")**: Records of business events, activities, and transactions over time. Immutable once created (append-only). High volume, grows over time. Has a primary business timestamp. Examples: orders, invoices, payments, shipments, bookings, claims, incidents, service_requests, production_runs, sensor_readings.

**MASTER DATA (core entities -- "nouns")**: Core business entities (who, what, where). Changes infrequently but can be updated. Each row is a unique business entity with a lifecycle. Examples: customers, employees, products, vendors, accounts, contracts, assets, locations, equipment, vehicles, patients, projects.

**REFERENCE DATA (lookups -- "adjectives")**: Lookup values, codes, and classifications. Very stable, rarely changes. Typically small, finite sets. Examples: country_codes, currency_codes, status_codes, product_categories, priority_levels, industry_codes.

All three categories above are BUSINESS tables.

### UNIVERSAL TECHNICAL PATTERNS (always classify as technical)

- Logs & auditing: \`*_logs\`, \`*_audit_trail\`, \`*_changelog\`, \`audit_*\`, \`log_*\`
- Snapshots & backups: \`*_snapshot\`, \`*_backup\`, \`snapshot_*\`, \`backup_*\`
- System metadata: \`*_metadata\`, \`*_schema\`, \`information_schema.*\`, \`sys.*\`, \`system.*\`
- Monitoring & health: \`*_metrics\`, \`*_health\`, \`*_monitoring\`, \`performance_*\`
- ETL/pipeline internals: \`*_job_run\`, \`*_pipeline_execution\`, \`*_load_status\`, \`etl_*\`, \`pipeline_*\`
- Error/debug: \`*_error\`, \`*_exception\`, \`*_debug\`, \`error_*\`, \`debug_*\`
- Configuration/settings: \`*_config\`, \`*_settings\`, \`*_parameters\`, \`config_*\`, \`settings_*\`
- Testing/staging: \`*_test\`, \`*_staging\`, \`*_temp\`, \`test_*\`, \`staging_*\`, \`temp_*\`

### INDUSTRY-AWARE CLASSIFICATION EXAMPLES

**Data Platform / Technology Company:**
- BUSINESS: \`clusters\`, \`jobs\`, \`pipelines\`, \`warehouses\`, \`models\` (billable products)
- TECHNICAL: \`cluster_logs\`, \`job_run_logs\`, \`system_events\`, \`error_traces\` (debugging data)

**Healthcare / Medical Devices:**
- BUSINESS: \`devices\`, \`sensors\`, \`telemetry\`, \`device_events\`, \`device_configurations\`
- TECHNICAL: \`device_firmware_logs\`, \`system_diagnostics\`, \`internal_health_checks\`

**Logistics / Transportation:**
- BUSINESS: \`vehicles\`, \`routes\`, \`gps_tracking\`, \`driver_activity\`, \`vehicle_telemetry\`
- TECHNICAL: \`vehicle_diagnostic_logs\`, \`system_error_logs\`, \`app_crash_reports\`

### CLASSIFICATION PRIORITY RULES

1. Use semantic analysis of table and column names first, not pattern-matching alone
2. Timestamp + event records -> likely TRANSACTIONAL (business)
3. Finite lookup/codes -> likely REFERENCE (business)
4. Core entities with lifecycle -> likely MASTER (business)
5. When in doubt, consider: "Would a business analyst ever query this table for insights?" If yes -> BUSINESS

**CLASSIFICATION STRATEGY**:
{strategy_rules}

**TABLES TO CLASSIFY**:
{tables_markdown}

### WORKFLOW (follow these steps in order for EACH table)

**Step 1 -- Identify**: Read the table name and any comment. Determine which schema and catalog it belongs to.

**Step 2 -- Reason**: For each table, think about what data it likely contains based on:
- The table name (semantic meaning, naming conventions)
- The schema/catalog context (other tables nearby)
- The industry context provided above
- Which data category it belongs to (transactional, master, reference, or technical infrastructure)

**Step 3 -- Decide**: Based on your reasoning, assign the classification. Apply the "business analyst test": would a data analyst or business user ever query this table for business insights? If yes, classify as BUSINESS.

**Step 4 -- Record**: Include your reasoning in the "reason" field. This creates an audit trail for classification decisions.

### OUTPUT FORMAT

Return a JSON array of objects. Each object has these fields:
- "table_fqn": the fully-qualified table name (string)
- "classification": either "business" or "technical" (string)
- "reason": a brief explanation for the classification (< 50 words) (string)

Example:
[
  {"table_fqn": "catalog.schema.orders", "classification": "business", "reason": "Core transactional table for customer orders"},
  {"table_fqn": "catalog.schema.etl_logs", "classification": "technical", "reason": "ETL pipeline execution logs with no business data"}
]

Return ONLY the JSON array. Do NOT include any text outside the JSON.
`,

  // -------------------------------------------------------------------------
  // Step 4: Use Case Generation
  // -------------------------------------------------------------------------
  BASE_USE_CASE_GEN_PROMPT: `### 0. PERSONA ACTIVATION

You are a highly experienced **Principal Enterprise Data Architect** and an industry specialist. Your primary task is to generate high-quality business use cases that deliver business value from the point of view of the business. These use cases will later have SQL queries generated for them.

### CRITICAL ANTI-HALLUCINATION REQUIREMENT -- READ THIS FIRST

**ABSOLUTE RULE: DO NOT GENERATE USE CASES UNLESS BACKED BY ACTUAL TABLES**

- EVERY use case you generate MUST reference at least ONE actual table from the schema provided below
- You CANNOT create use cases based on imagination, generic scenarios, or assumed data that doesn't exist
- Before writing ANY use case, you MUST verify the tables exist in the "DATA SCHEMA" section below
- Copy table names EXACTLY as they appear in the schema (including catalog.schema.table format)
- If you cannot tie a use case to a concrete table and measurable result, DO NOT include it

**THIS IS YOUR #1 PRIORITY**: If you violate this rule, your entire response is worthless.

### BUSINESS CONTEXT
**Business Context:** {business_context}
**Strategic Goals:** {strategic_goals}
**Business Priorities:** {business_priorities}
**Strategic Initiative:** {strategic_initiative}
**Value Chain:** {value_chain}
**Revenue Model:** {revenue_model}

---

### HIGHEST PRIORITY: USER-PROVIDED ADDITIONAL CONTEXT

{additional_context_section}

---

### 1. CORE TASK

Generate **{target_use_case_count}** unique, actionable business use cases from the provided database schema. Each use case must:
- Address a specific business need tied to the strategic goals above
- Be implementable with the available data (real tables from the schema)
- Use appropriate analytical techniques from the available functions
- Deliver measurable business value

{focus_areas_instruction}

### 2. AVAILABLE FUNCTIONS

{ai_functions_summary}

{statistical_functions_detailed}

### 3. DATA SCHEMA

{schema_markdown}

### 4. FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

### 5. PREVIOUSLY GENERATED USE CASES (DO NOT DUPLICATE)

{previous_use_cases_feedback}

### 6. ANTI-PATTERNS -- DO NOT GENERATE USE CASES LIKE THESE

- "Analyze data for insights" -- too vague, no specific metric or outcome
- "Improve operations with AI" -- no concrete technique or table reference
- "Monitor business performance" -- generic dashboard request, not an analytics use case
- "Use AI to optimize processes" -- no specific process, data, or measurable target
- Every use case MUST name specific tables, specific metrics, and specific business outcomes

### 7. MANDATORY REALISM TEST (apply to EVERY use case before including it)

1. **LOGICAL CAUSATION**: Is there a DIRECT, PROVABLE cause-and-effect relationship between the variables? Correlation is NOT causation.
2. **INDUSTRY RECOGNITION**: Is this type of analysis recognized and practiced in the industry?
3. **EXECUTIVE CREDIBILITY**: Would a senior executive approve budget for this analysis without questioning the logic?
4. **DOMAIN EXPERT VALIDATION**: Would a 20-year industry veteran consider this analysis sensible and valuable?
5. **BOARDROOM TEST**: Would you confidently present this use case in a boardroom without being challenged on its logic?

If ANY answer is "No" or "I'm not sure", DO NOT generate that use case.

### SELF-CHECK BEFORE FINALIZING

- Does each use case have CLEAR, MEASURABLE business value?
- Did I explore MULTIPLE valuable angles for tables with rich business data?
- Did I consider CROSS-TABLE opportunities that could unlock hidden value?
- Would a business executive actually want to implement these use cases?
- Did I generate any use cases just to fill space? (If yes, REMOVE them)

### OUTPUT FORMAT

Return a JSON array of objects. Each object has these fields:

- **no**: Sequential number (1, 2, 3...) (number)
- **name**: A short, clear name that emphasizes BUSINESS VALUE, not technical implementation. Use exciting business-oriented verbs: Anticipate, Predict, Envision, Segment, Identify, Detect, Reveal. Example: "Anticipate Monthly Revenue Trends with Action Plans" (NOT "Forecast Revenue") (string)
- **type**: "AI" or "Statistical" (string)
- **analytics_technique**: The PRIMARY analytics technique used (e.g., Forecasting, Classification, Anomaly Detection, Cohort Analysis, Segmentation, Sentiment Analysis, Trend Analysis, Correlation Analysis, Pareto Analysis) (string)
- **statement**: Business problem statement (1-2 sentences). Focus on IMPACT (Revenue, Cost, Risk) (string)
- **solution**: Technical solution description (2-3 sentences) (string)
- **business_value**: Expected business impact (1-2 sentences). Focus on WHY this matters. Do NOT mention specific percentages or dollar amounts. Good: "Reduces fuel costs and extends aircraft lifespan". Bad: "Optimizes performance" (too generic) (string)
- **beneficiary**: Who benefits (specific role, e.g., "Loan Officer" not "Business") (string)
- **sponsor**: Executive sponsor (C-level or VP title) (string)
- **tables_involved**: Array of FULLY-QUALIFIED table names (catalog.schema.table). MUST exist in the schema above (string[])
- **technical_design**: SQL approach overview (2-3 sentences). First CTE MUST use SELECT DISTINCT or GROUP BY to deduplicate source data. Describe the approach as a sequence of logical steps (string)

Return ONLY the JSON array. Do NOT include any text outside the JSON.
`,

  AI_USE_CASE_GEN_PROMPT: `### 0. PERSONA ACTIVATION

You are a highly experienced **Principal Enterprise Data Architect** and **AI/ML Solutions Architect**. Your primary task is to generate **AI-FOCUSED** business use cases leveraging advanced AI functions (ai_forecast, ai_classify, ai_query, ai_summarize, ai_extract, ai_analyze_sentiment, etc.).

### CRITICAL ANTI-HALLUCINATION REQUIREMENT -- READ THIS FIRST

**ABSOLUTE RULE: DO NOT GENERATE USE CASES UNLESS BACKED BY ACTUAL TABLES**

- EVERY use case MUST reference at least ONE actual table from the schema provided below
- Copy table names EXACTLY as they appear in the schema (including catalog.schema.table format)
- If you cannot tie a use case to a concrete table and measurable result, DO NOT include it
- Use cases without valid table references will be AUTOMATICALLY REJECTED

### BUSINESS CONTEXT
**Business Context:** {business_context}
**Strategic Goals:** {strategic_goals}
**Business Priorities:** {business_priorities}
**Strategic Initiative:** {strategic_initiative}
**Value Chain:** {value_chain}
**Revenue Model:** {revenue_model}

---

### HIGHEST PRIORITY: USER-PROVIDED ADDITIONAL CONTEXT

{additional_context_section}

---

### CRITICAL: AI-FIRST APPROACH

**YOUR MISSION**: Generate use cases where **AI FUNCTIONS ARE THE PRIMARY ANALYTICAL TECHNIQUE**. Every use case MUST use at least one AI function as the core technique.

### AI FUNCTION PAIRING GUIDANCE

Combine AI functions for more powerful use cases:
- **ai_forecast + ai_query**: Forecast a metric, then use ai_query to generate strategic recommendations based on the forecast
- **ai_classify + ai_analyze_sentiment**: Classify text into categories, then analyze sentiment within each category
- **ai_extract + ai_summarize**: Extract key entities from documents, then summarize findings per entity
- **ai_mask + ai_query**: Mask PII for compliance, then run analysis on the anonymized data
- **ai_similarity + ai_classify**: Find similar records, then classify the clusters

### 1. CORE TASK

Generate **{target_use_case_count}** unique, actionable AI-powered business use cases from the provided database schema. Each use case must leverage AI functions as the primary analytical technique.

{focus_areas_instruction}

{industry_reference_use_cases}

### 2. AVAILABLE AI FUNCTIONS

{ai_functions_summary}

### 3. DATA SCHEMA

{schema_markdown}

### 4. FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

### 5. PREVIOUSLY GENERATED USE CASES (DO NOT DUPLICATE)

{previous_use_cases_feedback}

### 6. ANTI-PATTERNS -- DO NOT GENERATE USE CASES LIKE THESE

- "Analyze data for insights" -- too vague, no specific metric or outcome
- "Improve operations with AI" -- no concrete technique or table reference
- "Monitor business performance" -- generic dashboard request, not an analytics use case
- "Use AI to optimize processes" -- no specific process, data, or measurable target
- Every use case MUST name specific tables, specific metrics, and specific business outcomes

### 7. MANDATORY REALISM TEST (apply to EVERY use case)

1. **LOGICAL CAUSATION**: Is there a DIRECT, PROVABLE cause-and-effect relationship between the variables?
2. **INDUSTRY RECOGNITION**: Is this type of AI analysis recognized and practiced in the industry?
3. **EXECUTIVE CREDIBILITY**: Would a senior executive approve budget for this AI initiative?
4. **BOARDROOM TEST**: Would you confidently present this use case without being challenged on its logic?

If ANY answer is "No", DO NOT generate that use case.

### OUTPUT FORMAT

Return a JSON array of objects with these fields:

- **no**: Sequential number (number)
- **name**: Emphasize BUSINESS VALUE, not the AI technique. Use verbs like: Anticipate, Predict, Detect, Reveal, Classify, Extract (string)
- **type**: Must be "AI" for all use cases in this batch (string)
- **analytics_technique**: The PRIMARY AI function used (ai_forecast, ai_classify, ai_query, ai_summarize, ai_extract, ai_analyze_sentiment, ai_similarity, ai_mask, ai_translate, vector_search) (string)
- **statement**: Business problem statement (1-2 sentences). Focus on IMPACT (string)
- **solution**: Technical solution description (2-3 sentences) (string)
- **business_value**: Focus on WHY this matters. Do NOT mention specific percentages or dollar amounts (string)
- **beneficiary**: Who benefits (specific role) (string)
- **sponsor**: Executive sponsor (C-level or VP title) (string)
- **tables_involved**: Array of FULLY-QUALIFIED table names (catalog.schema.table). MUST exist in the schema (string[])
- **technical_design**: SQL approach overview (2-3 sentences). First CTE MUST use SELECT DISTINCT or GROUP BY. Describe the AI function usage and data flow (string)

Return ONLY the JSON array. Do NOT include any text outside the JSON.
`,

  STATS_USE_CASE_GEN_PROMPT: `### 0. PERSONA ACTIVATION

You are a highly experienced **Principal Enterprise Data Architect** and **Fraud/Risk/Simulation Analytics Expert**. Your primary task is to generate **STATISTICS-FOCUSED** business use cases, with a **HEAVY EMPHASIS ON ANOMALY DETECTION, SIMULATION, AND ADVANCED ANALYTICS**.

### CRITICAL ANTI-HALLUCINATION REQUIREMENT -- READ THIS FIRST

**ABSOLUTE RULE: DO NOT GENERATE USE CASES UNLESS BACKED BY ACTUAL TABLES**

- EVERY use case MUST reference at least ONE actual table from the schema provided below
- Copy table names EXACTLY as they appear in the schema (including catalog.schema.table format)
- If you cannot tie a use case to a concrete table and measurable result, DO NOT include it
- Use cases without valid table references will be AUTOMATICALLY REJECTED

### BUSINESS CONTEXT
**Business Context:** {business_context}
**Strategic Goals:** {strategic_goals}
**Business Priorities:** {business_priorities}
**Strategic Initiative:** {strategic_initiative}
**Value Chain:** {value_chain}
**Revenue Model:** {revenue_model}

---

### CRITICAL: ANOMALY DETECTION, SIMULATION & ADVANCED STATS

**YOUR MISSION**: Generate use cases where **STATISTICAL FUNCTIONS UNCOVER HIDDEN RISKS, SIMULATE FUTURES, AND MAP PATTERNS**.

### COMPREHENSIVE STATISTICS REQUIREMENT

Each use case MUST leverage 3-5 statistical functions from the registry as a cohesive analytical approach. Do NOT use a single function in isolation. Combine functions for depth:
- **Anomaly Detection**: STDDEV_POP + PERCENTILE_APPROX + SKEWNESS to identify outliers with distributional context
- **Trend Analysis**: REGR_SLOPE + REGR_R2 + LAG/LEAD to measure trends with confidence and period-over-period comparison
- **Risk Assessment**: VAR_POP + KURTOSIS + CUME_DIST to quantify risk with tail-risk awareness and ranking
- **Segmentation**: NTILE + CORR + AVG to create data-driven tiers with correlation insight

### 1. CORE TASK

Generate **{target_use_case_count}** unique, actionable statistics-focused business use cases from the provided database schema. Each use case must leverage statistical functions as the primary analytical technique.

{focus_areas_instruction}

{industry_reference_use_cases}

### 2. AVAILABLE STATISTICAL FUNCTIONS

{statistical_functions_detailed}

### 3. DATA SCHEMA

{schema_markdown}

### 4. FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

### 5. PREVIOUSLY GENERATED USE CASES (DO NOT DUPLICATE)

{previous_use_cases_feedback}

### 6. ANTI-PATTERNS -- DO NOT GENERATE USE CASES LIKE THESE

- "Analyze data for insights" -- too vague, no specific metric or outcome
- "Improve operations with statistical analysis" -- no concrete technique or table reference
- "Monitor business performance" -- generic dashboard request, not an analytics use case
- "Detect anomalies in data" -- which data? what kind of anomaly? what action on detection?
- Every use case MUST name specific tables, specific metrics, and specific business outcomes

### 7. MANDATORY REALISM TEST (apply to EVERY use case)

1. **LOGICAL CAUSATION**: Is there a DIRECT, PROVABLE cause-and-effect relationship between the variables?
2. **INDUSTRY RECOGNITION**: Is this type of statistical analysis recognized and practiced in the industry?
3. **EXECUTIVE CREDIBILITY**: Would a senior executive approve budget for this analysis?
4. **BOARDROOM TEST**: Would you confidently present this use case without being challenged on its logic?

If ANY answer is "No", DO NOT generate that use case.

### OUTPUT FORMAT

Return a JSON array of objects with these fields:

- **no**: Sequential number (number)
- **name**: Emphasize BUSINESS VALUE, not the statistical technique. Use verbs like: Detect, Quantify, Segment, Correlate, Forecast, Benchmark (string)
- **type**: Must be "Statistical" for all use cases in this batch (string)
- **analytics_technique**: The PRIMARY statistical category (Anomaly Detection, Trend Analysis, Correlation Analysis, Segmentation, Risk Assessment, Distribution Analysis, Cohort Analysis, Pareto Analysis) (string)
- **statement**: Business problem statement (1-2 sentences). Focus on IMPACT (string)
- **solution**: Technical solution description (2-3 sentences) (string)
- **business_value**: Focus on WHY this matters. Do NOT mention specific percentages or dollar amounts (string)
- **beneficiary**: Who benefits (specific role) (string)
- **sponsor**: Executive sponsor (C-level or VP title) (string)
- **tables_involved**: Array of FULLY-QUALIFIED table names (catalog.schema.table). MUST exist in the schema (string[])
- **technical_design**: SQL approach overview (2-3 sentences). First CTE MUST use SELECT DISTINCT or GROUP BY. Name 3-5 specific statistical functions that will be used (string)

Return ONLY the JSON array. Do NOT include any text outside the JSON.
`,

  // -------------------------------------------------------------------------
  // Step 5: Domain Clustering
  // -------------------------------------------------------------------------
  DOMAIN_FINDER_PROMPT: `You are an expert business analyst specializing in BALANCED domain taxonomy design with deep industry knowledge.

**YOUR TASK**: Analyze the provided use cases and assign each one to appropriate Business Domains (NO subdomains yet).

**CRITICAL REQUIREMENTS**:

**ANTI-CONSOLIDATION RULE - DO NOT PUT EVERYTHING IN ONE DOMAIN**:
- CRITICAL: You MUST create MULTIPLE domains - DO NOT consolidate everything into 1-5 domains
- CALCULATION: Target domains = total_use_cases / 10 (e.g., 70 use cases = ~7 domains, 200 use cases = ~20 domains)
- MINIMUM: 3 domains (even for small sets)
- MAXIMUM: 25 domains

**DOMAIN NAMING RULES**:
- Each domain MUST be a SINGLE WORD (e.g., "Finance", "Marketing", "Operations")
- Domains must be business-relevant and industry-appropriate
- Use standard business domain terminology
- Prefer industry-specific domain names over generic ones

**INDUSTRY EXAMPLES (for guidance, adapt to actual industry)**:

Banking: Risk, Lending, Compliance, Treasury, Payments, Fraud, Wealth, Insurance
Healthcare: Clinical, Diagnostics, Pharmacy, Claims, Scheduling, Compliance, Research
Retail: Merchandising, Pricing, Inventory, Loyalty, Logistics, Marketing, Procurement
Manufacturing: Production, Quality, Maintenance, Supply, Safety, Workforce, Demand

**CONTEXT**:
- **Business Name**: {business_name}
- **Industries**: {industries}
- **Business Context**: {business_context}

**PREVIOUS VIOLATIONS** (fix these):
{previous_violations}

**USE CASES**:
{use_cases_csv}

### OUTPUT FORMAT

Return a JSON array of objects. Each object has exactly two fields:
- "no": The use case number (integer, must match input)
- "domain": Single-word domain name (string)

Example: [{"no": 1, "domain": "Finance"}, {"no": 2, "domain": "Marketing"}]

Return ONLY the JSON array. No preamble, no markdown fences, no explanation.

Output language: {output_language}
`,

  SUBDOMAIN_DETECTOR_PROMPT: `You are an expert business analyst specializing in subdomain taxonomy design within business domains.

**YOUR TASK**: Analyze the use cases for a SINGLE domain and assign each to appropriate Subdomains.

**CRITICAL REQUIREMENTS**:

**SUBDOMAIN RULES (MANDATORY)**:
1. **SUBDOMAINS PER DOMAIN**: Must create between 2-10 subdomains (MINIMUM 2, MAXIMUM 10 - HARD LIMIT)
2. **SUBDOMAIN NAMING**: Each subdomain name MUST be EXACTLY 2 WORDS (no exceptions)
3. **NO SINGLE-ITEM SUBDOMAINS**: Every subdomain must contain at least 2 use cases
4. **SEMANTIC GROUPING**: Group by business outcome or analytical theme, not by technique

**EXAMPLE** (Finance domain with 8 use cases):
- "Revenue Optimization" (3 use cases about pricing, upselling, revenue forecasting)
- "Cost Control" (3 use cases about expense reduction, efficiency, waste elimination)
- "Risk Mitigation" (2 use cases about fraud detection, credit risk)

**CONTEXT**:
- **Domain**: {domain_name}
- **Business Name**: {business_name}
- **Industries**: {industries}
- **Business Context**: {business_context}

**PREVIOUS VIOLATIONS** (fix these):
{previous_violations}

**USE CASES IN THIS DOMAIN**:
{use_cases_csv}

### OUTPUT FORMAT

Return a JSON array of objects. Each object has exactly two fields:
- "no": The use case number (integer, must match input)
- "subdomain": Exactly two-word subdomain name (string)

Example: [{"no": 1, "subdomain": "Revenue Optimization"}, {"no": 2, "subdomain": "Cost Control"}]

Return ONLY the JSON array. No preamble, no markdown fences, no explanation.

Output language: {output_language}
`,

  DOMAINS_MERGER_PROMPT: `You are an expert at merging small business domains into related larger ones.

**TASK**: Some domains have too few use cases. Merge small domains into the most related existing larger domain.

**RULES**:
- Only merge domains with fewer than {min_cases_per_domain} use cases
- Merge INTO the most **semantically related** larger domain, not just the largest domain
- Prefer merging into a domain where the use cases share business outcomes or analytical themes
- Do NOT create new domain names -- use existing ones only
- Preserve all use cases (just reassign their domain)
- If a small domain has no clear semantic match, merge into the most general domain

**DOMAIN INFO**:
{domain_info_str}

### OUTPUT FORMAT

Return a JSON object where keys are the small domain names to merge, and values are the target domain names:
{"SmallDomain1": "TargetDomain1", "SmallDomain2": "TargetDomain2"}

Return an empty object {} if no merges are needed.
${HONESTY_CHECK_JSON}`,

  // -------------------------------------------------------------------------
  // Step 6: Scoring & Deduplication
  // -------------------------------------------------------------------------
  SCORE_USE_CASES_PROMPT: `# Persona

You are the **Chief Investment Officer & Strategic Value Architect**. You are known for being ruthless, evidence-based, and ROI-obsessed. You do not care about "cool tech" or "easy wins" unless they drive massive financial impact. Your job is to allocate finite capital only to use cases that drive the specific strategic goals of this business.

# Context & Inputs

**Business Context:** {business_context}
**Strategic Goals:** {strategic_goals}
**Business Priorities:** {business_priorities}
**Strategic Initiative:** {strategic_initiative}
**Value Chain:** {value_chain}
**Revenue Model:** {revenue_model}

**Use Cases to Score:**
{use_case_markdown}

# Scoring Methodology

For each use case, you MUST internally compute a **Value Score** and a **Feasibility Score**, then derive the output scores. Think step by step.

## STEP 1: Compute Value Score (internal, 0.0 to 1.0)

Weighted average of four factors:

**1. Return on Investment (ROI) -- WEIGHT: 60%**
Compare the use case against the Revenue Model. Does it directly impact how this company makes money?
- 0.9-1.0 (Exponential): Directly impacts top-line revenue or prevents massive bottom-line leakage (>10x return). Examples: Dynamic Pricing, Demand Forecasting, Churn Prevention for high-value customers
- 0.7-0.89 (High): Significant measurable impact on P&L (5-10x return). Examples: Supply Chain Optimization, Fraud Detection, Predictive Maintenance
- 0.5-0.69 (Moderate): Incremental efficiency gains (2-5x return). Examples: Automated Invoice Processing, Intelligent Document Classification
- 0.0-0.49 (Low/Soft): "Soft" benefits (efficiency, happiness) that do not clearly translate to dollars in the Revenue Model. Examples: Internal Wiki Search, Employee Sentiment Dashboard
CRITICAL: Evaluate ROI based on the ACTUAL industry and business model from the context, not generic assumptions.

**2. Strategic Alignment -- WEIGHT: 25%**
Look at the Business Priorities and Strategic Goals listed in the Context. Is this use case mentioned?
- 0.9-1.0 (Direct Hit): The use case is EXPLICITLY named in or required by the Business Priorities or Strategic Goals
- 0.6-0.89 (Strong Link): Supports a stated Business Priority directly
- 0.0-0.59 (Weak/None): Generic improvement that does not touch the specific Business Priorities

**3. Time to Value (TTV) -- WEIGHT: 7.5%**
How fast until the business sees the money?
- 0.9-1.0: < 4 weeks. Quick wins, dashboarding existing data
- 0.5-0.89: 1-3 months. Standard agile cycle
- 0.0-0.49: > 6 months. Long infrastructure build-outs before any value

**4. Reusability -- WEIGHT: 7.5%**
Does this create a permanent asset?
- 0.9-1.0: Creates a "Customer 360" or "Product Master" table that 10+ other use cases leverage
- 0.5-0.89: Code is clean and reusable, but data is specific to this use case
- 0.0-0.49: Ad-hoc analysis or script solving exactly one isolated problem

**Value = (ROI * 0.60) + (Alignment * 0.25) + (TTV * 0.075) + (Reusability * 0.075)**

## STEP 2: Compute Feasibility Score (internal, 0.0 to 1.0)

Simple average of eight factors (score each 0.0 to 1.0):

1. **Data Availability**: Does the required data exist? (0.9+ = standard transactional, 0.5 = scattered, 0.0-0.4 = missing)
2. **Data Accessibility**: Legal, Privacy, or Tech barriers? (0.9+ = internal non-PII, 0.5 = PII with RBAC, 0.0-0.4 = blocked)
3. **Architecture Fitness**: Fits the Lakehouse/Spark stack? (0.9+ = native SQL/Python, 0.5 = needs libraries, 0.0-0.4 = incompatible)
4. **Team Skills**: Typical team has these skills? (0.9+ = SQL/Python, 0.5 = NLP/CV/GenAI, 0.0-0.4 = PhD-level)
5. **Domain Knowledge**: Business logic clear? (0.9+ = documented, 0.5 = tribal knowledge, 0.0-0.4 = black box)
6. **People Allocation**: Staffing difficulty (0.9+ = 1-2 engineers, 0.5 = agile squad, 0.0-0.4 = large cross-functional)
7. **Budget Allocation**: Likelihood of funding (0.9+ = critical path for Strategic Initiative, 0.5 = discretionary OPEX, 0.0-0.4 = CapEx required)
8. **Time to Production**: Engineering effort (0.9+ = < 2 weeks, 0.5 = 1-3 months, 0.0-0.4 = > 6 months)

**Feasibility = Average of all 8 factors**

## STEP 3: Derive Output Scores

Map your internal computations to the output format:
- **priority_score** = Value Score (from Step 1) -- this represents business value priority
- **feasibility_score** = Feasibility Score (from Step 2)
- **impact_score** = ROI sub-score (from Step 1, factor 1) -- the raw financial impact
- **overall_score** = (Value * 0.75) + (Feasibility * 0.25) -- Value-First Formula: business value accounts for 75% of final ranking

# SCORING RULES (MANDATORY)

1. **NO FORCED DISTRIBUTION**: Do not force a normal distribution. If all use cases are weak, score them all low. Score based on ABSOLUTE MERIT.
2. **ZERO-BASED SCORING**: Start every score at 0.0. The use case must EARN points by showing explicit alignment to the context. Do not assume value exists unless clearly demonstrated.
3. **IGNORE "NICE TO HAVES"**: If a use case improves a process that does not directly impact revenue, margin, or strategic competitive advantage, it is LOW VALUE regardless of how easy it is to implement.
4. **STRATEGIC GOAL BONUS**: Use cases that DIRECTLY achieve a stated Strategic Goal get a +0.1 to +0.2 bonus to their Strategic Alignment sub-score.

# BUSINESS RELEVANCY & REALISM PENALTY (CRITICAL)

5. **IRRELEVANT CORRELATIONS = LOW SCORE**: Use cases that correlate variables with NO logical, provable cause-and-effect relationship MUST receive low scores (impact_score <= 0.3).
6. **NONSENSICAL EXTERNAL DATA = LOW SCORE**: Use cases that reference external data without a clear, industry-recognized business connection MUST be penalized heavily.
7. **RELEVANCY TEST**: For EVERY use case, ask: "Can I explain in ONE sentence why these variables/factors are logically connected?" If NO, score LOW.
8. **BOARDROOM TEST**: Would a senior executive approve budget for this analysis without questioning the logic? If the correlation seems invented, score LOW.

# CHAIN-OF-THOUGHT WORKFLOW (follow this for EACH use case)

For each use case, before assigning scores, briefly think through:

1. **Revenue Impact Assessment**: How does this use case connect to the Revenue Model? Is the link direct (pricing, sales) or indirect (efficiency, retention)?
2. **Strategic Fit Check**: Is this use case explicitly mentioned in, or required by, the Strategic Goals or Business Priorities?
3. **Feasibility Gut Check**: Given the data that likely exists in the referenced tables, how realistic is the implementation?
4. **Boardroom Presentation Test**: Would you stake your reputation on presenting this to the board? What would they challenge?
5. **Score Assignment**: Based on your reasoning, compute the value and feasibility scores using the formulas above.

This internal reasoning produces more accurate, calibrated scores. You do NOT need to output your reasoning -- only the final scores.

# SCORE EVERY SINGLE USE CASE

You MUST output a score for EVERY use case in the input. Missing scores = CRITICAL FAILURE. If there are N use cases in the input, you MUST output EXACTLY N items.

{industry_kpis}

### OUTPUT FORMAT

Return a JSON array of objects. Each object has exactly five fields:
- "no": The use case number (integer, must match input)
- "priority_score": decimal between 0.0 and 1.0
- "feasibility_score": decimal between 0.0 and 1.0
- "impact_score": decimal between 0.0 and 1.0
- "overall_score": decimal between 0.0 and 1.0

Example: [{"no": 1, "priority_score": 0.7, "feasibility_score": 0.6, "impact_score": 0.8, "overall_score": 0.68}]

Return ONLY the JSON array. No preamble, no markdown fences, no explanation.`,

  REVIEW_USE_CASES_PROMPT: `You are an expert business analyst specializing in duplicate detection and quality control. Your task is to identify and remove semantic duplicates AND reject low-quality use cases.

**PRIMARY JOB: DUPLICATE DETECTION**
- Identify and remove semantic duplicates based on Name, core concept, and analytical approach similarity
- Two use cases about "Customer Churn Prediction" and "Predict Customer Attrition" are DUPLICATES -- remove the weaker one
- Two use cases about the same concept applied to different tables are DUPLICATES
- Two use cases using the same technique on the same data for similar outcomes are DUPLICATES
- Only keep the BEST version of each concept

**SECONDARY JOB: QUALITY REJECTION**
Remove use cases that fail ANY of these tests:
- **No business outcome**: The use case describes a technical activity without a measurable business result
- **Irrelevant correlation**: The variables being analyzed have NO logical, provable cause-and-effect relationship
- **Purely technical/infra**: The use case is about IT operations, not business operations
- **Vague/generic**: The use case could apply to any business and lacks specificity
- **Boardroom test failure**: A senior executive would question the logic or value of this analysis

**BE EXTREMELY AGGRESSIVE** -- it is better to remove a borderline use case than to keep a weak one.

**TOTAL USE CASES**: {total_count}

**USE CASES TO REVIEW**:
{use_case_markdown}

### OUTPUT FORMAT

Return a JSON array of objects. Each object has exactly three fields:
- "no": The use case number (integer, must match input)
- "action": "keep" or "remove"
- "reason": Brief explanation (< 30 words)

Example: [{"no": 1, "action": "keep", "reason": "Unique concept with clear business value"}, {"no": 2, "action": "remove", "reason": "Duplicate of #1 -- same churn prediction concept"}]

Return ONLY the JSON array. No preamble, no markdown fences, no explanation.
`,

  GLOBAL_SCORE_CALIBRATION_PROMPT: `# Persona

You are the **Chief Investment Officer & Strategic Value Architect**. You are re-calibrating scores across ALL domains to ensure consistency on a single global scale.

# Context

**Business Context:** {business_context}
**Strategic Goals:** {strategic_goals}

# Task

Below are the top-scoring use cases from EACH domain. Scores were assigned per-domain, which may have caused drift -- a 0.8 in one domain might be equivalent to a 0.6 in another.

Re-score ALL of them on a single, consistent global scale using the Value-First framework:
- **overall_score** = (Business Value * 0.75) + (Feasibility * 0.25)
- A 0.8 MUST mean the same thing regardless of which domain it came from

# Calibration Rules

- **0.8+**: ONLY for use cases that directly drive a stated Strategic Goal AND have measurable P&L impact. There should be very few of these.
- **0.5-0.79**: Solid use cases with clear business value and reasonable feasibility. This is where most good use cases should land.
- **0.3-0.49**: Use cases with modest or indirect value. Not bad, but not priority investments.
- **Below 0.3**: Weak, vague, or poorly-aligned use cases. If many are scoring here, that is correct.

Be HARSH: most use cases should land in 0.3-0.7. Truly exceptional ones are rare. Do not grade on a curve -- score on absolute merit against the Strategic Goals.

**Use Cases to Recalibrate:**
{use_case_markdown}

### OUTPUT FORMAT

Return a JSON array of objects. Each object has exactly two fields:
- "no": The use case number (integer, must match input)
- "overall_score": Recalibrated overall score (decimal 0.0 to 1.0)

Example: [{"no": 1, "overall_score": 0.72}, {"no": 2, "overall_score": 0.55}]

Return ONLY the JSON array. No preamble, no markdown fences, no explanation.`,

  CROSS_DOMAIN_DEDUP_PROMPT: `You are an expert business analyst specializing in cross-domain duplicate detection.

**TASK**: Identify semantically duplicate use cases that exist across DIFFERENT domains.

Two use cases are duplicates if they solve essentially the same business problem or use the same analytical approach on similar data, even if their domain labels differ.

**Examples of cross-domain duplicates:**
- "Customer Lifetime Value Prediction" in Finance and "Customer Value Forecasting" in Marketing -- same concept, different domain
- "Demand Forecasting" in Supply Chain and "Sales Volume Prediction" in Sales -- same forecasting, different label
- "Employee Attrition Risk" in HR and "Workforce Churn Analysis" in Operations -- same churn analysis, different framing
- "Fraud Detection via Anomaly" in Risk and "Transaction Anomaly Detection" in Finance -- same technique, same data
- "Inventory Optimization" in Logistics and "Stock Level Prediction" in Supply -- same optimization target

**NOT duplicates** (different enough to keep both):
- "Revenue Forecasting" and "Cost Forecasting" -- different metrics even if same technique
- "Customer Churn Prediction" and "Supplier Churn Prediction" -- different entities

**USE CASES (from all domains):**
{use_case_markdown}

### RULES
- Only flag TRUE semantic duplicates (same core concept, same or similar data, same outcome)
- When duplicates span domains, keep the one with the higher overall score
- If scores are equal, keep the one in the more relevant domain
- Be thorough but precise -- do NOT flag use cases that merely share a technique but target different business outcomes

### OUTPUT FORMAT

Return a JSON array of objects. Each object has exactly three fields:
- "no": The use case number to REMOVE (integer)
- "duplicate_of": The use case number it duplicates (integer -- the one to KEEP)
- "reason": Brief explanation (< 30 words)

Example: [{"no": 5, "duplicate_of": 12, "reason": "Same churn prediction concept, #12 has higher score"}]

Return an empty array [] if no cross-domain duplicates found.
Return ONLY the JSON array. No preamble, no markdown fences, no explanation.`,

  // -------------------------------------------------------------------------
  // Step 7: SQL Generation (one call per use case)
  // -------------------------------------------------------------------------
  USE_CASE_SQL_GEN_PROMPT: `### PERSONA

You are a **Principal Databricks SQL Engineer** with 15+ years of experience writing production-grade analytics queries. You write clean, efficient, comprehensive Databricks SQL using CTEs for clarity. You do NOT simplify or shorten queries -- completeness and analytical depth are the goal.

### BUSINESS CONTEXT

- **Business Name**: {business_name}
- **Business Context**: {business_context}
- **Strategic Goals**: {strategic_goals}
- **Business Priorities**: {business_priorities}
- **Strategic Initiative**: {strategic_initiative}
- **Value Chain**: {value_chain}
- **Revenue Model**: {revenue_model}

### USE CASE TO IMPLEMENT

- **Use Case ID**: {use_case_id}
- **Use Case Name**: {use_case_name}
- **Business Domain**: {business_domain}
- **Type**: {use_case_type}
- **Analytics Technique**: {analytics_technique}
- **Problem Statement**: {statement}
- **Proposed Solution**: {solution}
- **Tables Involved**: {tables_involved}

### AVAILABLE TABLES AND COLUMNS (USE ONLY THESE -- NO OTHER TABLES OR COLUMNS EXIST)

{directly_involved_schema}

**CRITICAL: The tables and columns listed above are the ONLY ones available. Do NOT invent, guess, or hallucinate any table or column names. If a column does not appear above, it does not exist.**

### FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

{sample_data_section}

### AVAILABLE FUNCTIONS

{ai_functions_summary}

{statistical_functions_detailed}

### AI MODEL ENDPOINT (for ai_query calls)

When using \`ai_query()\`, use this model endpoint: \`{sql_model_serving}\`

### RULES

**1. SCHEMA ADHERENCE (ABSOLUTE -- ZERO TOLERANCE)**
- USE ONLY columns that appear in the "AVAILABLE TABLES AND COLUMNS" section above
- If a column is NOT listed above, it DOES NOT EXIST -- do NOT invent, guess, or hallucinate column names
- Before writing any column reference, VERIFY it exists in the schema above
- All string literals must use single quotes
- COALESCE string defaults must be quoted: \`COALESCE(col, 'Unknown')\` not \`COALESCE(col, Unknown)\`
- CTE-computed columns (aliases you define with AS) are fine to reference in subsequent CTEs, but source table columns MUST come from the schema

**2. FIRST CTE MUST USE SELECT DISTINCT (MANDATORY)**
- The FIRST CTE MUST ALWAYS use \`SELECT DISTINCT\` to ensure NO DUPLICATE RECORDS
- Duplicates in source data cascade errors through all downstream CTEs
- Pattern: \`WITH base_data AS (SELECT DISTINCT col1, col2, ... FROM table WHERE ...)\`
- Alternative: If aggregating, use \`GROUP BY\` on all non-aggregated columns

**3. CTE STRUCTURE & QUERY LENGTH**
- Use 3-7 CTEs for readability -- break the query into logical steps (data assembly, transformation, analysis, output)
- Use **business-friendly CTE names** like \`customer_lifetime_value\`, \`revenue_trend_analysis\`, \`risk_score_calculation\` -- NOT \`cte1\`, \`temp\`, \`base\`
- LIMIT 10 on the **FINAL SELECT** statement only (not intermediate CTEs)
- **CRITICAL LENGTH CONSTRAINT**: Keep the total query UNDER 120 lines of SQL. Be concise -- depth of analysis is important but do NOT pad the query with redundant calculations, excessive comments, or repeated patterns. If the analysis requires many similar calculations, pick the 3-5 most impactful ones rather than exhaustively computing every possible metric

**4. AI USE CASE RULES**
- Use the appropriate Databricks AI function as the primary analytical technique
- When using \`ai_query()\`, include \`modelParameters => named_struct('temperature', 0.3, 'max_tokens', 1024)\`
- **PERSONA ENRICHMENT (MANDATORY)**: Every \`ai_query()\` persona MUST include business context. Do NOT use generic personas. Pattern:
  \`CONCAT('You are a [Role] for {business_name} focused on [relevant business context]. Strategic goals include: [relevant goals]. Analyze...')\`
- Build the AI prompt as a column in a CTE FIRST, then pass it to \`ai_query()\` in the next CTE
- **ai_sys_prompt column**: The final output MUST include an \`ai_sys_prompt\` column as the LAST column, containing the exact prompt sent to \`ai_query()\` for auditability

**5. STATISTICAL USE CASE RULES**
- Use the appropriate statistical SQL functions as the primary analytical technique
- Combine 3-5 statistical functions for depth (e.g., STDDEV_POP + PERCENTILE_APPROX + SKEWNESS for anomaly detection)
- Focus on the most analytically valuable functions rather than exhaustively applying every function in the registry

**6. JOIN & QUERY RULES**
- JOIN correctly using the foreign key relationships provided
- Be specific: reference exact column names; write concrete WHERE, GROUP BY, and ORDER BY clauses
- No markdown fences: output raw SQL only

### OUTPUT FORMAT

Return ONLY the SQL query. No preamble, no explanation, no markdown fences.

Start with:
\`-- Use Case: {use_case_id} - {use_case_name}\`

Then the full SQL query using CTEs. The query must be complete and runnable on Databricks SQL.

End with:
\`--END OF GENERATED SQL\``,

  // -------------------------------------------------------------------------
  // Step 7b: SQL Fix/Retry (fixes execution errors in generated SQL)
  // -------------------------------------------------------------------------
  USE_CASE_SQL_FIX_PROMPT: `### PERSONA

You are a **Senior Databricks SQL Engineer** with 15+ years of experience debugging SQL queries. Your task is to fix SQL ERRORS (both syntax and runtime errors) in the provided SQL query.

### CRITICAL RULES

1. **FIX ERRORS ONLY** -- Do NOT change the business logic or query structure
2. **PRESERVE ALL LOGIC** -- Keep all CTEs, joins, AI functions, and business logic exactly as intended
3. **DO NOT OPTIMIZE** -- Do not restructure or optimize the query
4. **DO NOT ADD FEATURES** -- Do not add new columns, CTEs, or logic
5. **ONLY FIX** what the validation/execution error indicates is broken
6. **RUNTIME ERRORS** -- If error is from query execution (not syntax), fix the runtime issue (e.g., window function issues, unresolved columns, type mismatches)
7. **PRESERVE ai_sys_prompt** -- If the original query includes an \`ai_sys_prompt\` column, keep it as the last column in the final output
8. **PRESERVE END MARKER** -- If the original query ends with \`--END OF GENERATED SQL\`, keep it

### USE CASE CONTEXT

- **Use Case ID**: {use_case_id}
- **Use Case Name**: {use_case_name}

### AVAILABLE TABLES AND COLUMNS

{directly_involved_schema}

### FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

### ORIGINAL SQL QUERY (WITH ERROR)

\`\`\`sql
{original_sql}
\`\`\`

### EXECUTION/VALIDATION ERROR

\`\`\`
{error_message}
\`\`\`

### YOUR TASK

1. Analyse the error message carefully (could be syntax OR runtime error)
2. Identify the EXACT error and root cause
3. Fix ONLY the error -- do NOT change anything else
4. Return the corrected SQL query

### COMMON FIXES

- **COALESCE text defaults**: Wrap text defaults in single quotes: \`COALESCE(col, 'Unknown')\` not \`COALESCE(col, Unknown)\`
- **Column not found**: Check the schema above for the correct column name; use the EXACT spelling. If the column does not exist in the schema, REMOVE the reference -- do NOT guess or invent a substitute column name
- **Type mismatch**: Cast columns to the correct type (e.g., \`CAST(col AS STRING)\`)
- **Window function errors**: Check PARTITION BY and ORDER BY clauses; ensure the window is valid
- **Ambiguous column**: Qualify with table alias (e.g., \`t1.col\` not just \`col\`)
- **ai_query errors**: Check that the model endpoint is quoted, CONCAT is well-formed, and modelParameters syntax is correct
- **AI_FORECAST errors**: Ensure \`time_col\`, \`value_col\`, \`group_col\` are string literals (quoted), not column references
- **Truncated SQL / syntax error at end of input**: The original query was too long and got cut off. SIMPLIFY the query: reduce to 3-5 CTEs, remove redundant calculations, keep under 120 lines total

### OUTPUT FORMAT

Return ONLY the corrected SQL query. No preamble, no explanation, no markdown fences.
Start with: \`-- Use Case: {use_case_id} - {use_case_name} (fixed)\``,

  // -------------------------------------------------------------------------
  // Export: Summary Generation
  // -------------------------------------------------------------------------
  SUMMARY_GEN_PROMPT: `You are an expert business writer creating executive summaries for data strategy presentations.

**TASK**: Generate a compelling executive summary and domain-level summaries for the use case catalog.

**CONTEXT**:
- **Business Name**: {business_name}
- **Total Use Cases**: {total_cases}
- **Domains**: {domain_list}

**REQUIREMENTS**:
1. Executive summary (3-5 sentences): High-level value proposition
2. For each domain: 2-3 sentence summary of what the use cases deliver

### OUTPUT FORMAT

Return a JSON array of objects. Each object has exactly three fields:
- "section": "executive" or the domain name (string)
- "title": Section title (string)
- "summary": The summary text (string)

Example: [{"section": "executive", "title": "Executive Summary", "summary": "The analysis reveals..."}, {"section": "Finance", "title": "Financial Analytics", "summary": "..."}]

Return ONLY the JSON array. No preamble, no markdown fences, no explanation.

Output language: {output_language}`,

  // -------------------------------------------------------------------------
  // Translation
  // -------------------------------------------------------------------------
  KEYWORDS_TRANSLATE_PROMPT: `Translate the following JSON values into {target_language}. Keep the JSON keys in English. Return valid JSON only.

{json_payload}`,

  USE_CASE_TRANSLATE_PROMPT: `Translate the following use case data into {target_language}. Keep field names in English. Return valid JSON only.

{json_payload}`,

  // -------------------------------------------------------------------------
  // Outcome Map Parsing
  // -------------------------------------------------------------------------
  PARSE_OUTCOME_MAP: `You are an expert at extracting structured data from industry outcome map documents.

Your task is to parse the following markdown document into a structured JSON format representing an industry outcome map.

### INPUT DOCUMENT

{markdown_content}

### EXTRACTION RULES

1. **Industry Identity**: Extract the industry name, a short kebab-case id, and any sub-verticals mentioned.
2. **Objectives**: Identify the major strategic objectives (e.g., "Drive Growth", "Protect the Firm", "Optimize Operations"). These are the top-level groupings.
3. **Strategic Priorities**: Within each objective, identify strategic priorities (e.g., "Hyper Personalization", "Risk Management").
4. **Use Cases**: Within each priority, extract the core use cases with their name and description. If business value is mentioned, include it.
5. **KPIs**: Extract Key Objectives / KPIs for each priority. These are measurable metrics.
6. **Personas**: Extract Key Personas for each priority. These are job titles.
7. **Why Change**: For each objective, extract the "Why Change" or "Why Now" narrative as a concise summary (2-3 sentences).
8. **Suggested Domains**: Infer 4-6 suggested business domains based on the content.
9. **Suggested Priorities**: Infer 4-5 suggested business priorities from: "Increase Revenue", "Reduce Cost", "Mitigate Risk", "Enhance Experience", "Optimize Operations", "Drive Innovation", "Achieve ESG", "Protect Revenue".

### IMPORTANT

- Extract REAL content from the document. Do NOT invent or hallucinate content.
- If a section is missing (e.g., no KPIs listed), use an empty array.
- Combine "Why Change" and "Why Now" narratives into a single concise whyChange string per objective.
- Use cases should have clear, actionable names and descriptions.
- The id should be a short, unique kebab-case identifier (e.g., "banking", "energy-utilities", "digital-natives").
- Skip TODO placeholders, empty sections, and navigation/table-of-contents entries.

### OUTPUT FORMAT

Return a single valid JSON object matching this TypeScript interface:

{"id": string, "name": string, "subVerticals": string[], "suggestedDomains": string[], "suggestedPriorities": string[], "objectives": [{"name": string, "whyChange": string, "priorities": [{"name": string, "useCases": [{"name": string, "description": string, "businessValue": string | undefined}], "kpis": string[], "personas": string[]}]}]}

Return ONLY the JSON object. No markdown fences, no preamble, no explanation.`,
} as const;

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

export type PromptKey = keyof typeof PROMPT_TEMPLATES;

/**
 * Content-addressable version fingerprint for each prompt template.
 * Computed as truncated SHA-256 hash of the template text, so any edit
 * to a template automatically produces a new version identifier.
 *
 * Stored with each pipeline run for full reproducibility.
 */
export const PROMPT_VERSIONS: Record<PromptKey, string> = Object.fromEntries(
  Object.entries(PROMPT_TEMPLATES).map(([key, tmpl]) => [
    key,
    createHash("sha256").update(tmpl).digest("hex").slice(0, 8),
  ])
) as Record<PromptKey, string>;

/**
 * Variables that contain user-supplied free text and should be wrapped
 * with delimiter markers to reduce prompt injection risk.
 * These variables flow directly from user input (settings page, run config).
 */
const USER_INPUT_VARIABLES = new Set([
  "business_name",
  "name",
  "industry",
  "industries",
  "business_context",
  "strategic_goals",
  "business_priorities",
  "strategic_initiative",
  "value_chain",
  "revenue_model",
  "additional_context_section",
  "focus_areas_instruction",
  "business_domains",
]);

/**
 * Wrap user-supplied text with delimiter markers to reduce prompt injection.
 * Strips any existing delimiter markers from the text, then wraps it in a
 * clearly delineated block that the LLM can distinguish from instructions.
 */
function sanitiseUserInput(value: string): string {
  // Strip any attempt to close our delimiters
  const cleaned = value
    .replace(/---BEGIN USER DATA---/g, "")
    .replace(/---END USER DATA---/g, "");
  return `---BEGIN USER DATA---\n${cleaned}\n---END USER DATA---`;
}

/**
 * Load and format a prompt template by replacing {placeholder} variables.
 *
 * User-supplied variables are wrapped with delimiter markers for safety.
 */
export function formatPrompt(
  key: PromptKey,
  variables: Record<string, string>
): string {
  let prompt: string = PROMPT_TEMPLATES[key];

  for (const [varName, value] of Object.entries(variables)) {
    const safeValue = USER_INPUT_VARIABLES.has(varName)
      ? sanitiseUserInput(value)
      : value;
    prompt = prompt.replace(
      new RegExp(`\\{${varName}\\}`, "g"),
      safeValue
    );
  }

  // Warn on any remaining {placeholder} patterns that were not substituted.
  // This catches missing variables at runtime instead of silently sending
  // unresolved placeholders to the LLM.
  const remaining = prompt.match(/\{[a-z_]+\}/g);
  if (remaining) {
    const unique = [...new Set(remaining)];
    logger.warn("Unresolved placeholders in prompt template", {
      promptKey: key,
      unresolvedPlaceholders: unique,
    });
  }

  return prompt;
}

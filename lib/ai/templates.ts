/**
 * Prompt templates for the Inspire pipeline.
 *
 * Ported from docs/references/databricks_inspire_v34.ipynb PROMPT_TEMPLATES dict.
 * Each template uses {placeholder} syntax for variable injection.
 *
 * IMPORTANT: When modifying prompts, always update docs/PROMPTS.md in parallel.
 */

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

const HONESTY_CHECK_CSV = `

### HONESTY CHECK (MANDATORY)
Add TWO additional columns to your CSV output:
- honesty_score: A number between 0.0 and 1.0 reflecting your confidence
- honesty_justification: A brief explanation of your confidence score
`;

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

### YOUR TASK

Produce a comprehensive JSON document covering:

1. **industries**: The primary and secondary industries this business operates in
2. **strategic_goals**: 5-10 specific, measurable strategic goals aligned with the industry
3. **business_priorities**: The top business priorities (e.g., revenue growth, cost optimization, risk mitigation)
4. **strategic_initiative**: The key strategic initiative that ties goals to execution
5. **value_chain**: A description of the end-to-end value chain
6. **revenue_model**: How the business generates and protects revenue
7. **additional_context**: Any domain-specific context relevant for data use case generation

### OUTPUT FORMAT

Return a single valid JSON object with the fields listed above. Do NOT include any text outside the JSON.
${HONESTY_CHECK_JSON}`,

  // -------------------------------------------------------------------------
  // Step 3: Table Filtering
  // -------------------------------------------------------------------------
  FILTER_BUSINESS_TABLES_PROMPT: `You are a **Senior Data Architect** and **Business Domain Expert** specializing in identifying business-relevant data assets.

**CRITICAL TASK**: Analyze the provided list of database tables and classify each one as either:
1. **BUSINESS DATA TABLE** - Contains ANY business data related to operations, transactions, customers, products, services, or business processes
2. **TECHNICAL TABLE** - Contains PURELY IT INFRASTRUCTURE data with NO business relevance (backend system logs, database monitoring, application debugging, IT governance)

**BUSINESS CONTEXT**:
- **Business Name**: {business_name}
- **Industry**: {industry}
- **Business Description**: {business_context}
- **Exclusion Strategy**: {exclusion_strategy}

{additional_context_section}

**CLASSIFICATION STRATEGY**:
{strategy_rules}

**TABLES TO CLASSIFY**:
{tables_markdown}

### OUTPUT FORMAT

Return CSV with columns: table_fqn, classification, reason
- classification must be either "business" or "technical"
- reason should be a brief explanation (< 50 words)

Do NOT include headers. One row per table.
${HONESTY_CHECK_CSV}`,

  // -------------------------------------------------------------------------
  // Step 4: Use Case Generation
  // -------------------------------------------------------------------------
  BASE_USE_CASE_GEN_PROMPT: `### 0. PERSONA ACTIVATION

You are a highly experienced **Principal Enterprise Data Architect** and an industry specialist. Your primary task is to generate high-quality business use cases that deliver business value from the point of view of the business, these use cases will later have SQL queries generated for them.

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

Generate unique, actionable business use cases from the provided database schema. Each use case must:
- Address a specific business need
- Be implementable with the available data
- Use appropriate analytical techniques
- Deliver measurable business value

{focus_areas_instruction}

### 2. AVAILABLE FUNCTIONS

{ai_functions_summary}

{statistical_functions_detailed}

### 3. DATA SCHEMA

{schema_markdown}

### 4. FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

### 5. PREVIOUS FEEDBACK

{previous_use_cases_feedback}

### OUTPUT FORMAT

Return CSV with these columns (no header row):
No, Name, type, Analytics Technique, Statement, Solution, Business Value, Beneficiary, Sponsor, Tables Involved, Technical Design

- **No**: Sequential number
- **Name**: Concise use case name (5-10 words)
- **type**: "AI" or "Statistical"
- **Analytics Technique**: Primary function/technique used
- **Statement**: Business problem statement (1-2 sentences)
- **Solution**: Technical solution description (2-3 sentences)
- **Business Value**: Expected business impact (1-2 sentences)
- **Beneficiary**: Who benefits (role/department)
- **Sponsor**: Executive sponsor (C-level or VP)
- **Tables Involved**: Comma-separated FQNs of tables used
- **Technical Design**: SQL approach overview (2-3 sentences)
${HONESTY_CHECK_CSV}`,

  AI_USE_CASE_GEN_PROMPT: `### 0. PERSONA ACTIVATION

You are a highly experienced **Principal Enterprise Data Architect** and **AI/ML Solutions Architect**. Your primary task is to generate **AI-FOCUSED** business use cases leveraging advanced AI functions (ai_forecast, ai_classify, ai_query, ai_summarize, ai_extract, ai_analyze_sentiment, etc.).

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

### 1. CORE TASK

Generate unique, actionable AI-powered business use cases from the provided database schema. Each use case must leverage AI functions as the primary analytical technique.

{focus_areas_instruction}

### 2. AVAILABLE AI FUNCTIONS

{ai_functions_summary}

### 3. DATA SCHEMA

{schema_markdown}

### 4. FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

### 5. PREVIOUS FEEDBACK

{previous_use_cases_feedback}

### OUTPUT FORMAT

Return CSV with these columns (no header row):
No, Name, type, Analytics Technique, Statement, Solution, Business Value, Beneficiary, Sponsor, Tables Involved, Technical Design

- **type**: Must be "AI" for all use cases in this batch
- All other columns follow the same format as the base prompt
${HONESTY_CHECK_CSV}`,

  STATS_USE_CASE_GEN_PROMPT: `### 0. PERSONA ACTIVATION

You are a highly experienced **Principal Enterprise Data Architect** and **Fraud/Risk/Simulation Analytics Expert**. Your primary task is to generate **STATISTICS-FOCUSED** business use cases, with a **HEAVY EMPHASIS ON ANOMALY DETECTION, SIMULATION, AND ADVANCED ANALYTICS**.

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

### 1. CORE TASK

Generate unique, actionable statistics-focused business use cases from the provided database schema. Each use case must leverage statistical functions as the primary analytical technique.

{focus_areas_instruction}

### 2. AVAILABLE STATISTICAL FUNCTIONS

{statistical_functions_detailed}

### 3. DATA SCHEMA

{schema_markdown}

### 4. FOREIGN KEY RELATIONSHIPS

{foreign_key_relationships}

### 5. PREVIOUS FEEDBACK

{previous_use_cases_feedback}

### OUTPUT FORMAT

Return CSV with these columns (no header row):
No, Name, type, Analytics Technique, Statement, Solution, Business Value, Beneficiary, Sponsor, Tables Involved, Technical Design

- **type**: Must be "Statistical" for all use cases in this batch
- All other columns follow the same format as the base prompt
${HONESTY_CHECK_CSV}`,

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

**CONTEXT**:
- **Business Name**: {business_name}
- **Industries**: {industries}
- **Business Context**: {business_context}

**PREVIOUS VIOLATIONS** (fix these):
{previous_violations}

**USE CASES**:
{use_cases_csv}

### OUTPUT FORMAT

Return CSV with columns (no header): No, Domain
- No: The use case number (must match input)
- Domain: Single-word domain name

Output language: {output_language}
${HONESTY_CHECK_CSV}`,

  SUBDOMAIN_DETECTOR_PROMPT: `You are an expert business analyst specializing in subdomain taxonomy design within business domains.

**YOUR TASK**: Analyze the use cases for a SINGLE domain and assign each to appropriate Subdomains.

**CRITICAL REQUIREMENTS**:

**SUBDOMAIN RULES (MANDATORY)**:
1. **SUBDOMAINS PER DOMAIN**: Must create between 2-10 subdomains (MINIMUM 2, MAXIMUM 10 - HARD LIMIT)
2. **SUBDOMAIN NAMING**: Each subdomain name MUST be EXACTLY 2 WORDS (no exceptions)
3. **NO SINGLE-ITEM SUBDOMAINS**: Every subdomain must contain at least 2 use cases

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

Return CSV with columns (no header): No, Subdomain
- No: The use case number (must match input)
- Subdomain: Exactly two-word subdomain name

Output language: {output_language}
${HONESTY_CHECK_CSV}`,

  DOMAINS_MERGER_PROMPT: `You are an expert at merging small business domains into related larger ones.

**TASK**: Some domains have too few use cases. Merge small domains into the most related existing larger domain.

**RULES**:
- Only merge domains with fewer than {min_cases_per_domain} use cases
- Merge INTO the most semantically related larger domain
- Do NOT create new domain names -- use existing ones
- Preserve all use cases (just reassign their domain)

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

# Scoring Dimensions

Score each use case on these dimensions (0.0 to 1.0):

1. **priority_score**: How well does this align with stated business priorities?
2. **feasibility_score**: How technically feasible is this given standard enterprise data?
3. **impact_score**: What is the potential business/financial impact?
4. **overall_score**: Weighted composite (priority 0.3, feasibility 0.2, impact 0.5)

# Rules

- Be HARSH: Most use cases should score 0.3-0.7. Only truly exceptional ones get 0.8+.
- Penalize vague, generic, or non-specific use cases.
- Reward use cases that directly map to stated strategic goals and priorities.
- Consider data availability (tables involved) when scoring feasibility.

### OUTPUT FORMAT

Return CSV with columns (no header): No, priority_score, feasibility_score, impact_score, overall_score
- No: The use case number (must match input)
- All scores are decimals between 0.0 and 1.0`,

  REVIEW_USE_CASES_PROMPT: `You are an expert business analyst specializing in duplicate detection. Your SINGLE task is to identify and remove semantic duplicates **and** to reject useless/technical use cases that add no business value.

**SINGLE FOCUS: DUPLICATE DETECTION ONLY**
- **PRIMARY JOB**: Identify and remove semantic duplicates based on Name and core concept similarity
- **SECONDARY GUARDRAIL**: Reject use cases that are trivial (no business outcome) or purely technical/infra-focused
- **FOCUS**: Keep only distinct, business-outcome-focused use cases

**BE EXTREMELY AGGRESSIVE IN DUPLICATE DETECTION**
- Two use cases about "Customer Churn Prediction" and "Predict Customer Attrition" are DUPLICATES
- Two use cases about the same concept applied to different tables are DUPLICATES
- Only keep the BEST version of each concept

**TOTAL USE CASES**: {total_count}

**USE CASES TO REVIEW**:
{use_case_markdown}

### OUTPUT FORMAT

Return CSV with columns (no header): No, action, reason
- No: The use case number (must match input)
- action: "keep" or "remove"
- reason: Brief explanation (< 30 words)
${HONESTY_CHECK_CSV}`,

  // -------------------------------------------------------------------------
  // Step 7: SQL Generation (one call per use case)
  // -------------------------------------------------------------------------
  USE_CASE_SQL_GEN_PROMPT: `### PERSONA

You are a **Principal Databricks SQL Engineer** with 15+ years of experience writing production-grade analytics queries. You write clean, efficient Databricks SQL using CTEs for clarity.

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

1. **USE ONLY THE PROVIDED COLUMNS** -- never invent column names. If a table has columns listed above, use only those columns.
2. **USE CTEs** for readability -- break the query into logical steps (data assembly, transformation, analysis, output).
3. **LIMIT 10** on the first CTE (or the base query) to control cost.
4. **For AI use cases**: use the appropriate Databricks AI function (\`ai_query\`, \`ai_classify\`, \`ai_forecast\`, \`ai_summarize\`, \`ai_analyze_sentiment\`, \`ai_extract\`, etc.) as the primary analytical technique. When using \`ai_query()\`, include \`modelParameters => named_struct('temperature', 0.3, 'max_tokens', 1024)\`.
5. **For Statistical use cases**: use the appropriate statistical SQL functions (\`REGR_SLOPE\`, \`STDDEV_POP\`, \`PERCENTILE_APPROX\`, \`NTILE\`, \`KURTOSIS\`, \`SKEWNESS\`, \`LAG\`, \`LEAD\`, \`CUME_DIST\`, \`VAR_POP\`, etc.) as the primary analytical technique.
6. **JOIN correctly**: use the foreign key relationships provided, or explicit join conditions based on column names that exist in both tables.
7. **Be specific**: reference exact column names from the schema; write concrete WHERE, GROUP BY, and ORDER BY clauses.
8. **No markdown fences**: output raw SQL only, no \\\`\\\`\\\`sql wrapping.

### OUTPUT FORMAT

Return ONLY the SQL query. No preamble, no explanation, no markdown.

Start with:
\`-- Use Case: {use_case_id} - {use_case_name}\`

Then the full SQL query using CTEs. The query must be complete and runnable on Databricks SQL.`,

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

Return CSV with columns (no header): section, title, summary
- section: "executive" or the domain name
- title: Section title
- summary: The summary text

Output language: {output_language}`,

  // -------------------------------------------------------------------------
  // Translation
  // -------------------------------------------------------------------------
  KEYWORDS_TRANSLATE_PROMPT: `Translate the following JSON values into {target_language}. Keep the JSON keys in English. Return valid JSON only.

{json_payload}`,

  USE_CASE_TRANSLATE_PROMPT: `Translate the following use case data into {target_language}. Keep field names in English. Return valid JSON only.

{json_payload}`,
} as const;

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

export type PromptKey = keyof typeof PROMPT_TEMPLATES;

/**
 * Load and format a prompt template by replacing {placeholder} variables.
 */
export function formatPrompt(
  key: PromptKey,
  variables: Record<string, string>
): string {
  let prompt: string = PROMPT_TEMPLATES[key];

  for (const [varName, value] of Object.entries(variables)) {
    prompt = prompt.replace(
      new RegExp(`\\{${varName}\\}`, "g"),
      value
    );
  }

  return prompt;
}

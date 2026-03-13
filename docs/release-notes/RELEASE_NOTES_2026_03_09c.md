# Release Notes -- 2026-03-09

**Databricks Forge v0.17.0**

---

## New Features

### LLM Skills Overhaul -- 8 Modules, 12 Blind Surfaces Wired
Comprehensive overhaul of the in-app LLM skills system. Created four new skill modules (Databricks Data Modeling, AI Functions, SQL Scripting, Dashboard SQL) and substantially rewrote four existing modules (SQL Patterns, Genie Design, Metric View Patterns, System Tables). Extended the type system with new `GeniePass` values (`exampleQueries`, `joinInference`) and `PipelineStep` value (`dashboard-design`). Wired the skill resolver into 12 previously blind LLM surfaces so every AI-powered generation path now benefits from structured domain knowledge.

---

## Improvements

### SQL Generation Craft Skills
Rewrote `databricks-sql-patterns` to focus purely on SQL generation craft: window function recipes, CTE composition patterns, date idioms, lambda/higher-order function patterns, and a comprehensive anti-patterns catalogue. Moved data modeling content to its own dedicated module.

### Databricks Data Modeling Skill
New dedicated skill covering star schema design, keys and constraints, Liquid Clustering best practices, SCD Type 1/2 patterns, and data modeling anti-patterns. Wired into table-filtering and SQL generation pipeline steps.

### Databricks AI Functions Skill
New skill covering `ai_query` rules and structured output, the cost-optimisation funnel (filter-block-score-LLM), and all task-specific AI functions (`ai_classify`, `ai_extract`, `ai_forecast`, `vector_search`, `http_request`, `remote_query`, `read_files`).

### Databricks SQL Scripting Skill
New skill for procedural SQL: `BEGIN...END` blocks, variable declaration, control flow, exception handling, stored procedures with `IN`/`OUT`/`INOUT` parameters, and recursive CTE patterns with hierarchy traversal and cycle detection.

### Dashboard SQL Skill
New skill for Lakeview dashboard dataset SQL rules, widget field matching constraints, 6-column grid layout rules, and metric view SQL compliance (`MEASURE()` wrapper, `GROUP BY ALL`, `EXPLAIN` validation).

### Enhanced Genie Design Skill
Added five new chunks: snippet expression complexity rules, alias-based join inference patterns with FK discovery, auto-generated date filters with fiscal calendar support, question style guidelines (simple/medium/complex), and instruction anti-patterns.

### Enhanced Metric View Patterns Skill
Added star/snowflake join YAML examples, common gotchas (measure name shadowing, window functions in `expr`, bare columns, materialisation name matching), and window measure examples (YTD, rolling, period-over-period).

### Enhanced System Tables Skill
Added deeper coverage: job/pipeline monitoring (`system.lakeflow.jobs`, `system.lakeflow.job_run_timeline`), storage/compute metrics (`system.storage.predictive_optimization_operations_history`, `system.compute.warehouses`), and data product observability patterns (freshness SLA, unused table detection, query performance percentiles).

### Skill Resolver Wired to 12 LLM Surfaces
Previously blind surfaces now receive skill context at prompt-build time:
- **SQL Reviewer** (`lib/ai/sql-reviewer.ts`) -- SQL generation craft injected into review and batch review prompts
- **Pipeline SQL Generation** (`lib/pipeline/steps/sql-generation.ts`) -- skill reference passed through `businessVars`
- **Dashboard Engine** (`lib/dashboard/prompts.ts`) -- dashboard SQL rules injected into design prompts
- **Genie Example Query Generation** (`lib/genie/passes/example-query-generation.ts`) -- question style guidance
- **Genie Join Inference** (`lib/genie/passes/join-inference.ts`) -- data modeling patterns for join discovery
- **Genie Adhoc Engine** (`lib/genie/adhoc-engine.ts`) -- SQL craft for fast-mode LLM expressions
- **Genie Optimise** (`lib/genie/optimize.ts`) -- Genie design best practices for optimisation suggestions
- **Genie Space Fixer** (`lib/genie/space-fixer.ts`) -- question style for smart sample question generation
- **Health Check Synthesis** (`lib/genie/health-checks/synthesis.ts`) -- Genie design rules for qualitative evaluation and cross-sectional synthesis
- **Fabric Gold Proposer** (`lib/fabric/gold-proposer.ts`) -- data modeling skill for DDL generation
- **Fabric DAX-to-SQL** (`lib/fabric/dax-to-sql.ts`) -- SQL craft for DAX translation
- **Pipeline Table Filtering** (`lib/pipeline/steps/table-filtering.ts`) -- data modeling patterns for table classification

---

## Commits (1)

| Hash | Summary |
|---|---|
| `4aa9c57` | Overhaul LLM skills: 8 skill modules, 12 blind surfaces wired |

**Uncommitted changes:** Version bump to 0.17.0, release notes file.

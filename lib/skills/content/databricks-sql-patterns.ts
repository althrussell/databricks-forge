/**
 * Databricks SQL Patterns skill.
 *
 * Distilled from databricks-dbsql skill:
 *   - best-practices.md (data modeling, Liquid Clustering, performance, anti-patterns)
 *   - SKILL.md (SQL scripting, procedures, window/lambda, AI functions)
 *
 * Provides knowledge NOT already in sql-rules.ts: schema design, dimensional
 * modeling, Liquid Clustering guidance, and data modeling anti-patterns.
 */

import type { SkillDefinition } from "../types";
import { registerSkill } from "../registry";

const DATA_MODELING_PATTERNS = `Databricks Data Modeling Patterns:
- Gold layer: use star schema (denormalized dimensions, normalized facts at the grain of the business event)
- Silver layer: OBT or Data Vault for rapid integration and cleansing
- Kimball methodology: (1) identify the business process, (2) declare the grain, (3) choose dimensions (who/what/where/when/why/how), (4) identify facts (numeric measures at declared grain)
- Fact table types: Transaction (one row per event, most common), Periodic Snapshot (one row per entity per period), Accumulating Snapshot (one row per lifecycle, updated at milestones)
- Dimension tables: highly denormalized, flatten many-to-one relationships within a single dimension table
- Use GENERATED ALWAYS AS IDENTITY for surrogate keys; prefer integer surrogates over string keys for join performance
- Define PRIMARY KEY constraints on dimension surrogate keys and FOREIGN KEY constraints on fact table FK columns to help the query optimizer
- Add COMMENT on all tables and columns for AI/BI discoverability
- Apply TAGS for governance (PII, sensitivity level, data tier)
- Store DECIMAL(18,2) for financial/monetary values, never FLOAT/DOUBLE`;

const LIQUID_CLUSTERING_PATTERNS = `Liquid Clustering Guidance:
- Prefer Liquid Clustering over traditional partitioning for all new Delta tables
- Choose 1-4 clustering keys; fewer is better for tables under 10 TB (2 keys often outperform 4)
- Cluster fact tables by the most commonly filtered foreign keys (e.g. date_key, customer_key)
- Cluster dimension tables by primary key plus common filter columns
- Liquid Clustering is NOT compatible with partitioning or Z-ORDER on the same table
- Traditional partitioning: only for very large tables (hundreds of TB) with a stable, low-cardinality partition key
- Z-ORDER is legacy; always prefer Liquid Clustering for new tables`;

const PERFORMANCE_PATTERNS = `Databricks SQL Performance Patterns:
- Run ANALYZE TABLE ... COMPUTE STATISTICS FOR COLUMNS on dimension keys and frequently filtered columns
- Use deterministic queries (avoid NOW(), CURRENT_TIMESTAMP(), RAND() in filters) to benefit from query result caching
- Prefer CREATE OR REPLACE TABLE over DROP IF EXISTS + CREATE
- Prefer native SQL functions over Python/Scala UDFs (UDFs require serialization, dramatically slower)
- Use window functions instead of self-joins for row comparisons, running totals, and ranking
- Enable predictive optimization for Unity Catalog managed tables (auto OPTIMIZE + VACUUM)
- Set delta.dataSkippingStatsColumns table property to specify which columns collect statistics
- Use materialized views for frequently computed aggregations (schedule with SCHEDULE EVERY)
- For pairwise AI operations: block first (narrow joins + UNION), score second (ai_similarity), LLM last (ai_query on LIMIT-ed set)`;

const ANTI_PATTERNS = `Data Modeling Anti-Patterns (AVOID these):
- Skipping dimensional modeling in Gold layer (OBTs are fine for Silver, but Gold should use star schemas)
- Over-partitioning (more than 5000 partitions degrades performance; use Liquid Clustering instead)
- String surrogate keys (integer IDENTITY columns are faster for joins)
- Missing PK/FK constraints (deprives the optimizer of relationship information)
- Missing COMMENT and TAGS on tables/columns (reduces discoverability for AI/BI tools)
- Using FLOAT/DOUBLE for financial data (use DECIMAL to avoid precision errors)
- Filtering on ARRAY/MAP columns in WHERE clauses (lacks column-level statistics for data skipping)
- Python/Scala UDFs when native SQL functions exist (serialization overhead is dramatic)
- Non-deterministic functions in cached queries (NOW(), RAND() prevent result caching)
- Too many Liquid Clustering keys (for tables under 10 TB, 2 keys often outperform 4)
- Manual OPTIMIZE/VACUUM without predictive optimization (enable predictive optimization for managed tables)
- DELETE + INSERT when MERGE INTO achieves the same result`;

const SCD_PATTERNS = `SCD Patterns for Databricks:
- SCD Type 1 (overwrite): in-place updates via MERGE INTO with WHEN MATCHED THEN UPDATE
- SCD Type 2 (history): version records with surrogate keys, effective_start_date, effective_end_date, is_current columns
- SCD Type 2 implementation: MERGE INTO to close current record (SET is_current = FALSE, effective_end_date = current_timestamp()) + INSERT new version
- Delta Lake Time Travel provides complementary historical access within configured retention`;

const skill: SkillDefinition = {
  id: "databricks-sql-patterns",
  name: "Databricks SQL & Data Modeling Patterns",
  description:
    "Star schema design, Kimball methodology, Liquid Clustering, performance " +
    "optimization, SCD patterns, and data modeling anti-patterns for Databricks SQL.",
  relevance: {
    intents: ["technical", "business"],
    geniePasses: ["columnIntelligence", "trustedAssets", "instructions"],
    pipelineSteps: ["sql-generation", "table-filtering"],
  },
  chunks: [
    {
      id: "sql-data-modeling",
      title: "Data Modeling Patterns",
      content: DATA_MODELING_PATTERNS,
      category: "patterns",
    },
    {
      id: "sql-liquid-clustering",
      title: "Liquid Clustering Guidance",
      content: LIQUID_CLUSTERING_PATTERNS,
      category: "patterns",
    },
    {
      id: "sql-performance",
      title: "SQL Performance Patterns",
      content: PERFORMANCE_PATTERNS,
      category: "patterns",
    },
    {
      id: "sql-anti-patterns",
      title: "Data Modeling Anti-Patterns",
      content: ANTI_PATTERNS,
      category: "anti-patterns",
    },
    {
      id: "sql-scd",
      title: "Slowly Changing Dimension Patterns",
      content: SCD_PATTERNS,
      category: "patterns",
    },
  ],
};

registerSkill(skill);

export default skill;

/**
 * Metric View Patterns skill.
 *
 * Distilled from databricks-metric-views skill:
 *   - yaml-reference.md (full YAML spec, dimensions, measures, joins, materialization)
 *   - patterns.md (ratio measures, filtered measures, window measures)
 *
 * Provides the YAML specification and patterns needed for metric view
 * proposals and semantic expression generation.
 */

import type { SkillDefinition } from "../types";
import { registerSkill } from "../registry";

const YAML_REFERENCE = `Metric View YAML Specification (version 1.1, DBR 17.2+):

Top-level fields:
  version: "1.1"
  source: catalog.schema.table (fully qualified)
  comment: "Description of the metric view"
  filter: SQL boolean expression (global WHERE clause)
  dimensions: list of dimension definitions
  measures: list of measure definitions
  joins: star/snowflake join definitions (optional)
  materialization: pre-computation config (optional, experimental)

Dimensions:
  - name: Display name (backtick-quoted in queries if spaces)
    expr: SQL expression (column reference, DATE_TRUNC, CASE WHEN, etc.)
    comment: Optional description
  - Can reference source columns, SQL functions, other dimensions, and joined table columns (join_name.column)
  - Cannot use aggregate functions (those belong in measures)

Measures:
  - name: Display name (queried via MEASURE(\`name\`) AS name)
    expr: Aggregate expression (SUM, COUNT, AVG, MIN, MAX, COUNT DISTINCT)
    comment: Optional description
  - Ratio: SUM(a) / COUNT(DISTINCT b)
  - Filtered: SUM(x) FILTER (WHERE status = 'active')
  - Filtered ratio: SUM(x) FILTER (WHERE ...) / COUNT(DISTINCT y) FILTER (WHERE ...)

Window Measures (experimental):
  - name: Running Total
    expr: SUM(total_price)
    window:
      - order: date_dimension_name
        range: cumulative | trailing N day | leading N day | current | all
        semiadditive: first | last (value when order dim absent from GROUP BY)
  - trailing 7 day = 7 days BEFORE current, EXCLUDING current day
  - Derived measures can reference window measures: MEASURE(current_day) - MEASURE(previous_day)

Joins (star schema):
  joins:
    - name: alias_name
      source: catalog.schema.dim_table
      on: source.fk_col = alias_name.pk_col
  - Snowflake (nested, DBR 17.1+): nest joins inside join definitions
  - Use either "on" (expression) or "using" (column list), not both
  - Reference joined columns as: join_name.column_name

Materialization (experimental):
  materialization:
    schedule: every 6 hours
    mode: relaxed
    materialized_views:
      - name: baseline
        type: unaggregated (full data model)
      - name: summary
        type: aggregated
        dimensions: [dim1, dim2]
        measures: [measure1, measure2]`;

const QUERY_RULES = `Metric View Query Rules (CRITICAL):
- ALL measure columns MUST be wrapped in MEASURE(): MEASURE(total_revenue) AS total_revenue
- Every MEASURE() call MUST have an explicit AS alias
- NEVER prefix measure columns with a table alias (use MEASURE(col), NOT alias.col)
- Dimension columns are referenced by bare name (no MEASURE() wrapper)
- Always include GROUP BY ALL or explicit GROUP BY on dimension columns
- NEVER use SELECT * on a metric view (not supported)
- CORRECT: SELECT month, MEASURE(total_revenue) AS total_revenue FROM mv GROUP BY ALL
- WRONG:  SELECT tam.total_revenue FROM mv AS tam`;

const MEASURE_PATTERNS = `Common Metric View Measure Patterns:
- Simple aggregate: SUM(amount), COUNT(1), AVG(price), COUNT(DISTINCT customer_id)
- Ratio (safe re-aggregation): SUM(revenue) / COUNT(DISTINCT customer_id)
- Filtered measure: COUNT(1) FILTER (WHERE status = 'completed')
- Filtered ratio: SUM(amount) FILTER (WHERE type = 'sale') / COUNT(DISTINCT order_id) FILTER (WHERE type = 'sale')
- Year-to-date: SUM(revenue) with window [order: date, range: cumulative] + [order: year, range: current]
- Rolling window: COUNT(DISTINCT customer_id) with window [order: date, range: trailing 7 day, semiadditive: last]
- Day-over-day growth: (MEASURE(current_day) - MEASURE(previous_day)) / MEASURE(previous_day) * 100`;

const DIMENSION_PATTERNS = `Common Metric View Dimension Patterns:
- Direct column: expr: region_name
- Time truncation: expr: DATE_TRUNC('MONTH', order_date)
- Year extraction: expr: EXTRACT(YEAR FROM order_date)
- Bucketing: expr: CASE WHEN amount > 1000 THEN 'High' WHEN amount > 100 THEN 'Medium' ELSE 'Low' END
- Joined column: expr: customer.segment (from join named "customer")
- Boolean flag: expr: CASE WHEN return_date IS NOT NULL THEN 'Returned' ELSE 'Kept' END`;

const skill: SkillDefinition = {
  id: "metric-view-patterns",
  name: "Metric View YAML Patterns",
  description:
    "Unity Catalog metric view YAML specification, measure patterns " +
    "(ratio, filtered, window), dimension patterns, join definitions, " +
    "and query rules (MEASURE(), GROUP BY ALL).",
  relevance: {
    intents: ["dashboard", "technical"],
    geniePasses: ["metricViews", "semanticExpressions"],
  },
  chunks: [
    {
      id: "mv-yaml-reference",
      title: "Metric View YAML Reference",
      content: YAML_REFERENCE,
      category: "patterns",
      maxCharBudget: 2500,
    },
    {
      id: "mv-query-rules",
      title: "Metric View Query Rules",
      content: QUERY_RULES,
      category: "rules",
    },
    {
      id: "mv-measure-patterns",
      title: "Measure Patterns",
      content: MEASURE_PATTERNS,
      category: "patterns",
    },
    {
      id: "mv-dimension-patterns",
      title: "Dimension Patterns",
      content: DIMENSION_PATTERNS,
      category: "patterns",
    },
  ],
};

registerSkill(skill);

export default skill;

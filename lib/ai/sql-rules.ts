/**
 * Shared Databricks SQL quality rules for all LLM prompts.
 *
 * Sourced from the "gold standard" pipeline SQL gen prompt (templates.ts)
 * and the databricks-dbsql skill best practices.
 *
 * DATABRICKS_SQL_RULES       -- full rule set for prompts generating complete SQL queries
 * DATABRICKS_SQL_RULES_COMPACT -- shorter set for prompts generating SQL expressions/snippets
 */

export const DATABRICKS_SQL_RULES = `
DATABRICKS SQL QUALITY RULES (mandatory for all generated SQL):

Syntax and type safety:
- NEVER use MEDIAN() -- it is not supported in Databricks SQL. Use PERCENTILE_APPROX(col, 0.5) instead.
- NEVER nest a window function (OVER) inside an aggregate function (SUM, AVG, COUNT, MIN, MAX). Compute window values in a CTE first, then aggregate.
- Use DECIMAL(18,2) instead of FLOAT/DOUBLE for financial and monetary calculations.
- All string literals must use single quotes. COALESCE text defaults must be quoted: COALESCE(col, 'Unknown') not COALESCE(col, Unknown).

Query structure:
- For top-N queries, ALWAYS use ORDER BY ... LIMIT N. NEVER use RANK() or DENSE_RANK() for top-N because ties can return more than N rows.
- Use QUALIFY for per-group deduplication (e.g. latest row per customer), NOT for top-N lists.
- Always include human-readable identifying columns (e.g. customer name, email, product name) in entity-level query output.
- Prefer explicit column lists over SELECT *.
- Filter early, aggregate late -- push WHERE clauses as close to the source tables as possible.
- Use window functions instead of self-joins where possible.

Databricks SQL features:
- Use COLLATE UTF8_LCASE for case-insensitive string comparisons instead of LOWER()/UPPER() wrappers.
- Use PERCENTILE_APPROX for percentile calculations (P20, P50, P75, etc.).
- Prefer native SQL functions over UDFs -- UDFs require serialization and are dramatically slower.
- Use pipe syntax (|>) for complex multi-step transformations where it improves readability.
`.trim();

export const DATABRICKS_SQL_RULES_COMPACT = `
DATABRICKS SQL RULES:
- NEVER use MEDIAN(). Use PERCENTILE_APPROX(col, 0.5) instead.
- NEVER nest a window function (OVER) inside an aggregate (SUM, AVG, COUNT, MIN, MAX).
- Use DECIMAL(18,2) for financial/monetary calculations.
- Use COLLATE UTF8_LCASE for case-insensitive comparisons.
- Use PERCENTILE_APPROX for percentile calculations.
- Filter early, aggregate late.
- Prefer native SQL functions over UDFs.
`.trim();

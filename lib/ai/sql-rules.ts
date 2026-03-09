/**
 * Shared Databricks SQL quality rules for all LLM prompts.
 *
 * Sourced from the "gold standard" pipeline SQL gen prompt (templates.ts)
 * and the databricks-dbsql skill best practices.
 *
 * DATABRICKS_SQL_RULES            -- full rule set for prompts generating complete SQL queries
 * DATABRICKS_SQL_RULES_COMPACT    -- shorter set for prompts generating SQL expressions/snippets
 * DATABRICKS_SQL_REVIEW_CHECKLIST -- structured checklist for the LLM reviewer endpoint
 */

export const DATABRICKS_SQL_RULES = `
DATABRICKS SQL QUALITY RULES (mandatory for all generated SQL):

Syntax and type safety:
- NEVER use MEDIAN() -- it is not supported in Databricks SQL. Use PERCENTILE_APPROX(col, 0.5) instead.
- NEVER nest a window function (OVER) inside an aggregate function (SUM, AVG, COUNT, MIN, MAX). Compute window values in a CTE first, then aggregate.
- Use DECIMAL(18,2) instead of FLOAT/DOUBLE for financial and monetary calculations.
- All string literals must use single quotes. COALESCE text defaults must be quoted: COALESCE(col, 'Unknown') not COALESCE(col, Unknown).
- NEVER use AI functions (ai_analyze_sentiment, ai_classify, ai_extract, ai_gen, ai_query) in metric view definitions. They are non-deterministic and prohibitively expensive. Use only deterministic expressions over materialized columns.
- NEVER use TO_DATE() or TO_TIMESTAMP() to parse string columns -- they throw on format mismatches. Use COALESCE(try_to_date(col, 'yyyy-MM-dd'), try_to_date(col, 'MM/dd/yyyy'), try_to_date(col, 'dd/MM/yyyy')) to handle mixed date formats gracefully. If the column is already DATE or TIMESTAMP type, use it directly without parsing.
- ai_query() only accepts these named parameters: modelParameters, responseFormat, failOnError. NEVER use systemPrompt, system_prompt, or any other invented parameter names. Embed persona/system instructions in the request text via CONCAT.
- ai_query() with failOnError => false returns STRUCT<result: STRING, errorMessage: STRING>. The result field is ALWAYS STRING regardless of responseFormat. Do NOT use responseFormat with failOnError => false. To get structured output: (1) instruct the model to return JSON in the prompt text, (2) parse with from_json(col.result, 'STRUCT<field1: TYPE, ...>') AS parsed_result. Accessing nested struct fields directly on the result (e.g. ai_result.result.field) causes INVALID_EXTRACT_BASE_FIELD_TYPE errors.
- from_json() alias naming: ALWAYS use exactly \`ai_result\` for the ai_query() output and \`parsed_result\` for the from_json() output. NEVER abbreviate to \`parsed\`, \`result\`, \`ai_res\`, or other variations -- inconsistent naming breaks automated validation.

AI function performance:
- AI functions (ai_query, ai_similarity, ai_gen) are expensive per-row. Filter and aggregate data BEFORE passing to AI functions. Structure queries as a cost funnel: cheap filters first, then blocking joins, then ai_similarity scoring, then ai_query LLM calls on the smallest possible set.
- For pairwise operations (deduplication, matching), split candidate generation into multiple narrow blocking joins with equality predicates on normalized columns, UNION the candidate sets, then score only the blocked pairs with ai_similarity.
- Normalize text columns (lower(trim(coalesce(col, ''))), soundex()) in an early CTE and reuse the normalized columns for blocking joins. Reserve ai_similarity() for the scoring stage after blocking.
- ALWAYS LIMIT the input rows to ai_query() / ai_gen() to at most 1000 rows. Apply the LIMIT after filtering and scoring, not before.

Identifier quoting:
- ALWAYS backtick-quote column names that contain spaces, special characters, or mixed case (e.g. \`Net Cash Flow\`, \`Account ID\`).
- Use column names EXACTLY as they appear in the schema. NEVER transform them (do NOT convert \`Net Cash Flow\` to net_cash_flow).
- Table names should use fully-qualified three-part names: catalog.schema.table

Query structure:
- For top-N queries, ALWAYS use ORDER BY ... LIMIT N. NEVER use RANK() or DENSE_RANK() for top-N because ties can return more than N rows.
- Use QUALIFY for per-group deduplication (e.g. latest row per customer), NOT for top-N lists.
- NEVER use aggregate functions (SUM, AVG, COUNT, MIN, MAX) in the same SELECT block as QUALIFY. QUALIFY operates before GROUP BY, so aggregates are invalid in that context. Split into two CTEs: first CTE uses QUALIFY for row-level deduplication on raw columns, second CTE aggregates the result.
- Always include human-readable identifying columns (e.g. customer name, email, product name) in entity-level query output.
- Prefer explicit column lists over SELECT *.
- Filter early, aggregate late -- push WHERE clauses as close to the source tables as possible.
- Use window functions instead of self-joins where possible.
- NEVER use LATERAL VIEW EXPLODE -- it is deprecated Hive syntax that cannot be combined with subsequent JOINs. Use EXPLODE() inside a CTE with comma-join or CROSS JOIN LATERAL syntax instead.

Databricks SQL features:
- Use COLLATE UTF8_LCASE for case-insensitive string comparisons instead of LOWER()/UPPER() wrappers.
- Use PERCENTILE_APPROX for percentile calculations (P20, P50, P75, etc.).
- Prefer native SQL functions over UDFs -- UDFs require serialization and are dramatically slower.
- Use pipe syntax (|>) for complex multi-step transformations where it improves readability.
- Databricks has NO STRING_AGG(). Use array_join(collect_list(col), ',') instead.

Window functions:
- Prefer window functions over self-joins for row comparisons, running totals, and ranking.
- Specify explicit window frames (ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) when cumulative behaviour is intended -- the default RANGE frame may group duplicate ORDER BY values unexpectedly.
- Use named windows (WINDOW w AS (PARTITION BY ...)) when multiple columns share the same partitioning to reduce repetition.
- Use LAST_VALUE with ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING to get the partition last value (default frame stops at CURRENT ROW).

Lambda / higher-order functions:
- Prefer transform(), filter(), exists(), aggregate() for array operations instead of EXPLODE + re-aggregate patterns -- fewer shuffles, better performance.
- Use array_sort(array, (l, r) -> comparator) for custom sort orders instead of EXPLODE + ORDER BY + collect_list.
- Use map_filter(), transform_keys(), transform_values() for map manipulation instead of exploding map entries.
- Lambda expressions cannot contain subqueries or SQL UDFs.

MERGE and DML best practices:
- Prefer MERGE INTO over separate DELETE + INSERT for upsert patterns.
- Always use WHEN MATCHED AND / WHEN NOT MATCHED for conditional merge logic.
- After MERGE, do NOT manually OPTIMIZE -- Delta auto-optimizes on write.

Complex types:
- Access STRUCT fields with dot notation: col.field (no need for brackets).
- Use EXPLODE(array_col) or INLINE(array_of_structs_col) to flatten arrays.
- Avoid filtering on complex-type columns (STRUCT/ARRAY/MAP) in WHERE clauses -- it defeats data skipping and partition pruning.
- Use map_keys(), map_values(), or element_at(map_col, key) for MAP operations.

Timestamps and intervals:
- Prefer TIMESTAMP_NTZ over TIMESTAMP for timezone-independent values (audit dates, created_at).
- Use standard interval syntax: INTERVAL '30' DAY, INTERVAL '1' MONTH, INTERVAL '2' HOUR.
- Use DATE_ADD / DATE_SUB for simple date arithmetic; use INTERVAL for timestamp arithmetic.

DDL patterns:
- Prefer CREATE OR REPLACE TABLE/VIEW over DROP IF EXISTS + CREATE.
- Use CLUSTER BY (col1, col2) for liquid clustering (replaces Z-ORDER in modern tables).
- Include TBLPROPERTIES for table metadata (tier, owner, quality tags).

Querying metric views (WITH METRICS views):
- When querying a metric view, ALL measure columns MUST be wrapped in MEASURE(): e.g. MEASURE(total_revenue) AS total_revenue. Bare column references on measures cause runtime errors.
- Every MEASURE() call MUST have an explicit AS alias: MEASURE(total_txn_count) AS total_txn_count. Without the alias, downstream CTEs, widget expressions, and filter references cannot resolve the column.
- NEVER prefix measure columns with a table alias. Use MEASURE(col), NOT alias.col or mv.col.
- Dimension columns are referenced by bare name (no MEASURE() wrapper).
- Always include GROUP BY ALL (or explicit GROUP BY on dimension columns) when selecting MEASURE() aggregates from a metric view.
- NEVER use SELECT * on a metric view -- it is not supported.
- CORRECT: SELECT month, MEASURE(total_revenue) AS total_revenue FROM catalog.schema.mv GROUP BY ALL
- WRONG:  SELECT tam.total_revenue FROM catalog.schema.mv AS tam
`.trim();

export const DATABRICKS_SQL_RULES_COMPACT = `
DATABRICKS SQL RULES:
- NEVER use MEDIAN(). Use PERCENTILE_APPROX(col, 0.5) instead.
- NEVER nest a window function (OVER) inside an aggregate (SUM, AVG, COUNT, MIN, MAX).
- NEVER combine aggregate functions (SUM, AVG, etc.) with QUALIFY in the same SELECT. QUALIFY runs before GROUP BY. Split deduplication and aggregation into separate CTEs.
- Use DECIMAL(18,2) for financial/monetary calculations.
- Use COLLATE UTF8_LCASE for case-insensitive comparisons.
- Use PERCENTILE_APPROX for percentile calculations.
- Filter early, aggregate late.
- Prefer native SQL functions over UDFs.
- NEVER use AI functions (ai_analyze_sentiment, ai_classify, etc.) in metric views.
- NEVER use TO_DATE()/TO_TIMESTAMP(). Use COALESCE(try_to_date(col, fmt1), try_to_date(col, fmt2)) for safe string-to-date parsing.
- ai_query() named parameters: ONLY modelParameters, responseFormat, failOnError. NEVER use systemPrompt or other invented names.
- ai_query() with failOnError => false: result field is ALWAYS STRING. Do NOT use responseFormat with failOnError. Parse structured output with from_json(ai_result.result, 'STRUCT<...>') AS parsed_result. ALWAYS use exactly \`ai_result\` and \`parsed_result\` as alias names.
- AI functions are expensive per-row. Filter/aggregate BEFORE ai_query/ai_similarity. For pairwise ops: block first (narrow joins + UNION), score second (ai_similarity), LLM last (ai_query on filtered LIMIT-ed set).
- ALWAYS backtick-quote column names with spaces or special characters. Use names EXACTLY as in the schema.
- No STRING_AGG() -- use array_join(collect_list(col), ',') instead.
- Prefer MERGE INTO over DELETE + INSERT for upserts.
- Access STRUCT fields with dot notation; use EXPLODE for arrays. NEVER use LATERAL VIEW EXPLODE (deprecated Hive syntax).
- Prefer TIMESTAMP_NTZ for timezone-independent timestamps.
- Use INTERVAL '30' DAY syntax for interval literals.
- Prefer CREATE OR REPLACE over DROP + CREATE.
- Specify explicit window frames (ROWS BETWEEN ...) for cumulative calculations.
- Prefer transform()/filter()/aggregate() for array ops over EXPLODE + re-aggregate.
- When querying metric views: wrap ALL measure columns in MEASURE(col) AS col. Use GROUP BY ALL. NEVER use SELECT * or alias-prefixed measure references.
`.trim();

export const DATABRICKS_SQL_REVIEW_CHECKLIST = `
REVIEW CHECKLIST (evaluate each dimension independently):

1. CORRECTNESS
   - All table/column references exist in the provided schema
   - JOIN conditions use correct keys (match FK relationships)
   - Aggregations are grouped correctly (no missing GROUP BY columns)
   - WHERE/HAVING filters are logically sound
   - Data types are handled correctly (no implicit lossy casts)

2. PERFORMANCE
   - Filters are pushed early (WHERE before aggregation, not HAVING for non-aggregate conditions)
   - No unnecessary self-joins (use window functions instead)
   - No SELECT * in production queries
   - LIMIT is present for top-N queries (not RANK/DENSE_RANK)
   - CTEs are used to avoid repeated subquery evaluation

3. READABILITY
   - Meaningful aliases for tables and columns
   - Consistent formatting and indentation
   - Complex logic broken into CTEs rather than deeply nested subqueries
   - Column order makes business sense (identifiers first, measures second)

4. SECURITY
   - No SQL injection vectors (dynamic string concatenation in expressions)
   - No exposure of sensitive columns without business justification
   - Read-only patterns only (no DDL/DML in analytical queries)

5. DATABRICKS IDIOM ADHERENCE
   - PERCENTILE_APPROX instead of MEDIAN()
   - COLLATE UTF8_LCASE for case-insensitive comparisons
   - try_to_date/try_to_timestamp instead of TO_DATE/TO_TIMESTAMP
   - QUALIFY for per-group deduplication
   - Pipe syntax (|>) for complex multi-step transformations
   - DECIMAL(18,2) for financial calculations
   - No nested window functions inside aggregates
   - No aggregate functions (SUM/AVG/COUNT/MIN/MAX) in the same SELECT as QUALIFY -- split into separate CTEs
   - Backtick-quoted identifiers with spaces/special chars
   - Three-part fully-qualified table names (catalog.schema.table)
   - array_join(collect_list(col), ',') instead of STRING_AGG()
   - MERGE INTO for upserts (not DELETE + INSERT)
   - STRUCT dot notation, EXPLODE for arrays, map_keys()/element_at() for MAPs
   - TIMESTAMP_NTZ for timezone-independent timestamps
   - INTERVAL '30' DAY syntax (not DATEADD with integer)
   - CREATE OR REPLACE over DROP IF EXISTS + CREATE
   - CLUSTER BY for liquid clustering (replaces Z-ORDER)
   - Explicit window frames (ROWS BETWEEN) for cumulative calculations
   - Named windows when multiple columns share partitioning
   - transform()/filter()/aggregate() for array operations instead of EXPLODE + re-aggregate
   - array_sort() with lambda for custom sort orders

6. METRIC VIEW COMPLIANCE (if query references a metric view)
   - All measure columns wrapped in MEASURE(): MEASURE(col) AS col
   - Every MEASURE() call has an explicit AS alias
   - No bare column references or alias-prefixed references for measure columns
   - GROUP BY ALL or explicit GROUP BY on dimension columns is present
   - No SELECT * on metric views

7. AI FUNCTION COMPLIANCE (if query uses ai_query, ai_similarity, ai_gen)
   - ai_query() with failOnError => false: result parsed via from_json(ai_result.result, 'STRUCT<...>') -- NOT via direct struct field access (ai_result.result.field causes INVALID_EXTRACT_BASE_FIELD_TYPE)
   - Structured output instructions included in prompt text (CONCAT with JSON format example), NOT via responseFormat when failOnError => false
   - Input rows to ai_query()/ai_gen() are LIMIT-ed to at most 1000
   - Cheap relational filters applied BEFORE expensive AI function calls
   - For pairwise operations: blocking joins with normalized columns BEFORE ai_similarity scoring
   - ai_sys_prompt column present as last column for auditability
   - Only valid named parameters used: modelParameters, responseFormat, failOnError (no systemPrompt or invented names)
   - from_json() alias uses canonical name \`parsed_result\` (not \`parsed\`, \`result\`, or other abbreviations)
`.trim();

export const DATABRICKS_DATA_MODELING_RULES = `
DATA MODELING RULES (for schema design, table analysis, and dimensional modeling):

Star Schema:
- Gold layer should use star schema: denormalized dimensions, normalized facts at the grain of the business event.
- Silver layer may use OBT or Data Vault for rapid integration and cleansing.
- Kimball methodology: (1) identify the business process, (2) declare the grain, (3) choose dimensions (who/what/where/when/why/how), (4) identify facts (numeric measures at declared grain).
- Fact table types: Transaction (one row per event), Periodic Snapshot (one row per entity per period), Accumulating Snapshot (one row per lifecycle).

Keys and Constraints:
- Use GENERATED ALWAYS AS IDENTITY for surrogate keys; prefer integer surrogates over strings for join performance.
- Define PRIMARY KEY on dimension surrogate keys and FOREIGN KEY on fact FK columns to help the query optimizer.
- Highly denormalize dimension tables: flatten many-to-one relationships within a single dimension.

Liquid Clustering:
- Prefer Liquid Clustering over traditional partitioning for ALL new Delta tables.
- Choose 1-4 clustering keys; fewer is better for tables under 10 TB.
- Cluster fact tables by the most commonly filtered foreign keys.
- Cluster dimension tables by primary key plus common filter columns.
- Liquid Clustering is NOT compatible with partitioning or Z-ORDER on the same table.

Metadata:
- Add COMMENT on all tables and columns for AI/BI discoverability.
- Apply TAGS for governance (PII, sensitivity level, tier).
- Use DECIMAL(18,2) for financial/monetary values, never FLOAT/DOUBLE.

Anti-Patterns to Avoid:
- Over-partitioning (>5000 partitions; use Liquid Clustering instead).
- String surrogate keys (integer IDENTITY columns are faster for joins).
- Missing PK/FK constraints (deprives the optimizer of relationship information).
- Missing COMMENT and TAGS (reduces discoverability for AI/BI tools).
- Filtering on ARRAY/MAP columns in WHERE clauses (no column statistics for data skipping).
`.trim();

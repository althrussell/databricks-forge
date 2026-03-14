/**
 * Prompt templates for the Data Engine.
 *
 * Covers narrative design, schema design, seed SQL, and fact SQL
 * generation passes.
 */

import { DATABRICKS_SQL_RULES_COMPACT } from "@/lib/ai/sql-rules";

/** SQL constraints for demo data generation to avoid Databricks rejection. */
export const DEMO_DATA_SQL_CONSTRAINTS = `
# CRITICAL DATABRICKS SQL CONSTRAINTS FOR DATA GENERATION
- NEVER pass a column or expression as a rand() seed: rand(col) is INVALID.
  Use rand() with NO arguments for random values.
  For deterministic bucketing per row, use: hash(col_name) % N
- NEVER nest explode() inside CAST or any expression.
  CORRECT:  SELECT explode(sequence(1, N)) AS seq_id
  WRONG:    SELECT CAST(explode(sequence(1, N)) AS BIGINT)
- NEVER use INTERVAL with CAST or expressions.
  WRONG:    + INTERVAL CAST(expr AS INT) HOURS
  CORRECT:  + make_interval(0, 0, 0, 0, CAST(expr AS INT), 0, 0)
  CORRECT:  + (CAST(expr AS INT) * INTERVAL '1' HOUR)
- For CTAS: use a SINGLE CREATE OR REPLACE TABLE ... AS SELECT statement.
  NEVER follow with INSERT INTO -- all data must come from the SELECT.
- Use fully qualified backtick-quoted names: \`catalog\`.\`schema\`.\`table\`
- Fact tables MUST ONLY reference dimension tables, never other fact tables.
`;

// ---------------------------------------------------------------------------
// Pass 0: Narrative Design
// ---------------------------------------------------------------------------

export const NARRATIVE_DESIGN_PROMPT = `You are a data engineer designing realistic demo data stories for {customer_name} in the {industry_name} industry.

# RESEARCH CONTEXT
{research_summary}

# DATA NARRATIVES FROM RESEARCH
{existing_narratives}

# SCOPE
Division: {division}
Target Row Count: {min_rows} - {max_rows} per fact table

# TASK
Design 3-5 data stories that will be embedded as patterns in the generated tables.
Each story creates visible, queryable trends that make the demo compelling.

Stories must be:
- Specific to {customer_name}'s division and industry
- Use their nomenclature: {nomenclature}
- Create patterns that use cases can discover (spikes, trends, anomalies, seasonal patterns)
- Be temporally distributed across the last 6-12 months

# OUTPUT FORMAT
Return JSON:
{
  "narratives": [
    {
      "title": "string",
      "description": "Detailed description of what the data pattern looks like",
      "affectedTables": ["table_name"],
      "pattern": "spike|trend|anomaly|seasonal|correlation",
      "temporalRange": { "startOffset": -180, "endOffset": 0 },
      "magnitudeDescription": "e.g., 23% increase, 3x spike"
    }
  ],
  "globalSettings": {
    "dateRangeMonths": 12,
    "primaryCurrency": "USD",
    "primaryTimezone": "UTC",
    "geographicFocus": ["region1", "region2"]
  }
}`;

// ---------------------------------------------------------------------------
// Pass 1: Schema Design
// ---------------------------------------------------------------------------

export const SCHEMA_DESIGN_PROMPT = `You are a senior data architect designing a demo data model for {customer_name} in the {industry_name} industry.

# MATCHED DATA ASSETS
{data_assets_context}

# DATA NARRATIVES
{narratives_json}

# NOMENCLATURE
{nomenclature}

# SCOPE
Division: {division}
Target Row Count: {min_rows} - {max_rows} per fact table
Dimension tables: 50-200 rows each

# TASK
Design a complete relational schema that:
1. Maps each selected data asset to one or more tables
2. Uses {customer_name}'s terminology (from nomenclature)
3. Supports the data narratives (tables must have columns that enable the patterns)
4. Maintains referential integrity (FK relationships)
5. Follows star schema conventions (dimension tables + fact tables)
6. Orders tables for creation (dimensions first, then facts)

# RULES
- Table names: lowercase, underscored, descriptive
- Column types: STRING, INT, BIGINT, DOUBLE, DECIMAL(18,2), DATE, TIMESTAMP, BOOLEAN
- Every table needs a primary key column
- FK columns must match the PK type of the referenced dimension
- Include useful metadata columns: created_at TIMESTAMP, updated_at TIMESTAMP
- Fact tables MUST NOT have FK references to other fact tables. Only reference dimension tables.

# OUTPUT FORMAT
Return JSON:
{
  "tables": [
    {
      "name": "table_name",
      "assetId": "A01",
      "description": "string",
      "tableType": "dimension|fact",
      "columns": [
        { "name": "col_name", "dataType": "STRING", "description": "string", "role": "pk|fk|measure|dimension|timestamp|flag", "fkTarget": "other_table.pk_col|null" }
      ],
      "rowTarget": 5000,
      "creationOrder": 1,
      "narrativeLinks": ["Narrative Title 1"]
    }
  ]
}`;

// ---------------------------------------------------------------------------
// Pass 2: Seed SQL Generation (per dimension table)
// ---------------------------------------------------------------------------

export const SEED_TABLE_PROMPT = `You are a SQL engineer generating realistic seed data for a demo.

# TABLE
Name: {catalog}.{schema}.{table_name}
Type: Dimension / Lookup
Description: {description}
Columns: {columns_json}

# CONTEXT
Customer: {customer_name} ({industry_name})
Division: {division}
Nomenclature: {nomenclature}

# DATABRICKS SQL RULES
${DATABRICKS_SQL_RULES_COMPACT}
${DEMO_DATA_SQL_CONSTRAINTS}

# TASK
Generate a single CREATE OR REPLACE TABLE AS SELECT statement with {row_target} rows of realistic data.
Use EXPLODE(SEQUENCE(1, {row_target})) to generate the row set, just like fact tables.

Requirements:
- Values must be realistic for {customer_name}'s industry and division
- Product names, locations, categories must use their nomenclature
- IDs should be formatted strings (e.g., "CUST-001", "PROD-042")
- Dates within the last 12 months
- Non-uniform distributions (80/20 for categories, realistic geographic spread)
- No placeholder or Lorem Ipsum text

Return ONLY the SQL statement. No markdown, no explanation.`;

// ---------------------------------------------------------------------------
// Pass 3: Fact SQL Generation (per fact table)
// ---------------------------------------------------------------------------

export const FACT_TABLE_PROMPT = `You are a SQL engineer generating realistic fact/transaction data for a demo.

# TABLE
Name: {catalog}.{schema}.{table_name}
Type: Fact / Transaction
Description: {description}
Columns: {columns_json}
Target Rows: {row_target}

# RELATED DIMENSION TABLES
{dimension_tables_context}

# DATA NARRATIVES TO EMBED
{narrative_context}

# CONTEXT
Customer: {customer_name} ({industry_name})
Nomenclature: {nomenclature}

# DATABRICKS SQL RULES
${DATABRICKS_SQL_RULES_COMPACT}
${DEMO_DATA_SQL_CONSTRAINTS}

# TASK
Generate a single CREATE OR REPLACE TABLE AS SELECT statement. Use CTAS only -- NEVER CREATE TABLE + INSERT INTO.

1. Uses EXPLODE(SEQUENCE(1, {row_target})) to generate the row set (never nest explode in CAST)
2. References dimension tables ONLY for FK values using element_at + COLLECT_LIST (never reference other fact tables)
3. Creates non-uniform distributions:
   - CASE WHEN RAND() < 0.3 THEN 'X' for weighted categories (RAND() with no seed)
   - RAND() * range + offset for numeric measures
   - DATE_ADD(CURRENT_DATE(), -CAST(RAND()*{date_range} AS INT)) for dates
4. Embeds the narrative patterns:
   - Temporal spikes/dips using CASE WHEN date BETWEEN ... conditions
   - Correlated anomalies across related columns
   - Seasonal patterns using MONTH() or DAYOFWEEK()

Return ONLY the SQL statement. No markdown, no explanation.`;

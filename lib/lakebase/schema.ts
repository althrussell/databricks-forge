/**
 * Lakebase table DDL and migration helpers.
 *
 * All Inspire app state is persisted in Lakebase (Unity Catalog managed tables).
 * This module provides the DDL for creating tables and a migration function.
 */

import { executeSQL } from "@/lib/dbx/sql";

/** The schema where all Inspire tables live. */
export const LAKEBASE_SCHEMA = "inspire_app";

// ---------------------------------------------------------------------------
// DDL Statements
// ---------------------------------------------------------------------------

export const CREATE_SCHEMA = `
CREATE SCHEMA IF NOT EXISTS ${LAKEBASE_SCHEMA}
`;

export const CREATE_RUNS_TABLE = `
CREATE TABLE IF NOT EXISTS ${LAKEBASE_SCHEMA}.inspire_runs (
  run_id           STRING       NOT NULL,
  business_name    STRING       NOT NULL,
  uc_metadata      STRING       NOT NULL,
  operation        STRING       NOT NULL DEFAULT 'Discover Usecases',
  business_priorities STRING,
  strategic_goals  STRING,
  business_domains STRING,
  ai_model         STRING       DEFAULT 'databricks-claude-sonnet-4-5',
  languages        STRING       DEFAULT '["English"]',
  generation_options STRING     DEFAULT '["SQL Code"]',
  generation_path  STRING       DEFAULT './inspire_gen/',
  status           STRING       NOT NULL DEFAULT 'pending',
  current_step     STRING,
  progress_pct     INT          DEFAULT 0,
  business_context STRING,
  error_message    STRING,
  created_at       TIMESTAMP    DEFAULT current_timestamp(),
  completed_at     TIMESTAMP,
  CONSTRAINT inspire_runs_pk PRIMARY KEY (run_id)
)
`;

export const CREATE_USE_CASES_TABLE = `
CREATE TABLE IF NOT EXISTS ${LAKEBASE_SCHEMA}.inspire_use_cases (
  id                  STRING    NOT NULL,
  run_id              STRING    NOT NULL,
  use_case_no         INT,
  name                STRING,
  type                STRING,
  analytics_technique STRING,
  statement           STRING,
  solution            STRING,
  business_value      STRING,
  beneficiary         STRING,
  sponsor             STRING,
  domain              STRING,
  subdomain           STRING,
  tables_involved     STRING,
  priority_score      DOUBLE,
  feasibility_score   DOUBLE,
  impact_score        DOUBLE,
  overall_score       DOUBLE,
  sql_code            STRING,
  sql_status          STRING,
  CONSTRAINT inspire_use_cases_pk PRIMARY KEY (id)
)
`;

export const CREATE_METADATA_CACHE_TABLE = `
CREATE TABLE IF NOT EXISTS ${LAKEBASE_SCHEMA}.inspire_metadata_cache (
  cache_key      STRING       NOT NULL,
  uc_path        STRING,
  metadata_json  STRING,
  table_count    INT,
  column_count   INT,
  cached_at      TIMESTAMP    DEFAULT current_timestamp(),
  CONSTRAINT inspire_metadata_cache_pk PRIMARY KEY (cache_key)
)
`;

export const CREATE_EXPORTS_TABLE = `
CREATE TABLE IF NOT EXISTS ${LAKEBASE_SCHEMA}.inspire_exports (
  export_id   STRING       NOT NULL,
  run_id      STRING       NOT NULL,
  format      STRING       NOT NULL,
  file_path   STRING,
  created_at  TIMESTAMP    DEFAULT current_timestamp(),
  CONSTRAINT inspire_exports_pk PRIMARY KEY (export_id)
)
`;

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

const ALL_DDL = [
  CREATE_SCHEMA,
  CREATE_RUNS_TABLE,
  CREATE_USE_CASES_TABLE,
  CREATE_METADATA_CACHE_TABLE,
  CREATE_EXPORTS_TABLE,
];

/**
 * Run all DDL statements to ensure the Lakebase schema and tables exist.
 * Safe to call multiple times (all statements use IF NOT EXISTS).
 */
export async function runMigrations(): Promise<void> {
  for (const ddl of ALL_DDL) {
    await executeSQL(ddl);
  }
}

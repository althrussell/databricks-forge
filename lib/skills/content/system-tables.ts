/**
 * System Tables skill.
 *
 * Distilled from databricks-unity-catalog skill:
 *   - 5-system-tables.md (audit, lineage, billing, compute, query history)
 *   - SKILL.md (system table catalog, query patterns)
 *
 * Provides governance, lineage, and observability query patterns for
 * Ask Forge technical and exploration intents.
 */

import type { SkillDefinition } from "../types";
import { registerSkill } from "../registry";

const SYSTEM_TABLE_CATALOG = `Databricks System Table Catalog:
- system.access.audit: Audit log events (who did what, when). Partition key: event_date.
  Key columns: event_date, event_time, user_identity.email, action_name, request_params, service_name, source_ip_address
- system.access.table_lineage: Table-level lineage edges. Partition key: event_date.
  Key columns: source_table_full_name, target_table_full_name, source_type, target_type, event_date
- system.access.column_lineage: Column-level lineage. Partition key: event_date.
  Key columns: source_table_full_name, source_column_name, target_table_full_name, target_column_name
- system.billing.usage: DBU consumption. Partition key: usage_date.
  Key columns: usage_date, workspace_id, sku_name, usage_quantity, usage_unit
- system.compute.clusters: Cluster inventory and configuration.
  Key columns: cluster_id, cluster_name, cluster_source, state, driver_node_type, num_workers
- system.query.history: SQL query history. Partition key: execution_start_time_utc.
  Key columns: statement_id, executed_by, statement_text, status, duration, rows_produced, warehouse_id`;

const QUERY_PATTERNS = `System Table Query Patterns:
- ALWAYS filter by the partition key (event_date, usage_date, or execution_start_time_utc) to avoid full scans
- Lineage queries: SELECT source_table_full_name, target_table_full_name FROM system.access.table_lineage WHERE event_date >= current_date() - INTERVAL 30 DAY
- Audit queries: Filter by action_name (e.g. 'createTable', 'deleteTable', 'grantPermission') and user_identity.email
- Billing queries: GROUP BY sku_name, usage_date for cost trend analysis; JOIN with workspace metadata for allocation
- Query history: Filter by status ('FINISHED', 'FAILED'), use duration for performance analysis, warehouse_id for warehouse utilization
- Access pattern analysis: COUNT queries per table from query.history to identify hot/cold tables`;

const GOVERNANCE_PATTERNS = `Governance SQL Patterns:
- Grant minimal access: GRANT USE CATALOG ON CATALOG system TO group_name; GRANT USE SCHEMA, SELECT on specific schemas
- Audit trail: SELECT event_time, user_identity.email, action_name, request_params FROM system.access.audit WHERE event_date >= current_date() - INTERVAL 7 DAY AND action_name IN ('createTable', 'deleteTable')
- Data freshness: Use table_lineage event_date to detect stale pipelines (no writes in N days)
- Unused tables: Cross-reference table inventory with query.history to find tables with zero reads`;

const skill: SkillDefinition = {
  id: "system-tables",
  name: "Databricks System Tables",
  description:
    "System table catalog (audit, lineage, billing, compute, query history), " +
    "query patterns with partition key filtering, and governance SQL templates.",
  relevance: {
    intents: ["technical", "exploration"],
  },
  chunks: [
    {
      id: "systbl-catalog",
      title: "System Table Catalog",
      content: SYSTEM_TABLE_CATALOG,
      category: "vocabulary",
    },
    {
      id: "systbl-query-patterns",
      title: "System Table Query Patterns",
      content: QUERY_PATTERNS,
      category: "patterns",
    },
    {
      id: "systbl-governance",
      title: "Governance Patterns",
      content: GOVERNANCE_PATTERNS,
      category: "patterns",
    },
  ],
};

registerSkill(skill);

export default skill;

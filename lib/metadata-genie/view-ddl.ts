/**
 * DDL generation for Meta Data Genie curated views.
 *
 * Generates CREATE OR REPLACE VIEW statements that select curated columns
 * from system.information_schema, with optional catalog scope filtering.
 */

import type { ViewTarget } from "./types";

// ---------------------------------------------------------------------------
// View Definitions
// ---------------------------------------------------------------------------

interface ViewDef {
  name: string;
  source: string;
  columns: string[];
  filterColumn: string;
  comment: string;
}

const VIEW_DEFS: ViewDef[] = [
  {
    name: "mdg_catalogs",
    source: "system.information_schema.catalogs",
    columns: [
      "catalog_name",
      "catalog_owner",
      "comment",
      "created",
      "created_by",
      "last_altered",
      "last_altered_by",
    ],
    filterColumn: "catalog_name",
    comment: "Curated metadata view: catalogs in the data estate",
  },
  {
    name: "mdg_schemas",
    source: "system.information_schema.schemata",
    columns: [
      "catalog_name",
      "schema_name",
      "schema_owner",
      "comment",
      "created",
      "created_by",
      "last_altered",
      "last_altered_by",
    ],
    filterColumn: "catalog_name",
    comment: "Curated metadata view: schemas in the data estate",
  },
  {
    name: "mdg_tables",
    source: "system.information_schema.tables",
    columns: [
      "table_catalog",
      "table_schema",
      "table_name",
      "table_type",
      "table_owner",
      "comment",
      "data_source_format",
      "created",
      "created_by",
      "last_altered",
      "last_altered_by",
    ],
    filterColumn: "table_catalog",
    comment: "Curated metadata view: tables and views in the data estate",
  },
  {
    name: "mdg_columns",
    source: "system.information_schema.columns",
    columns: [
      "table_catalog",
      "table_schema",
      "table_name",
      "column_name",
      "ordinal_position",
      "data_type",
      "is_nullable",
      "comment",
    ],
    filterColumn: "table_catalog",
    comment:
      "Curated metadata view: column definitions including types and descriptions",
  },
  {
    name: "mdg_views",
    source: "system.information_schema.views",
    columns: [
      "table_catalog",
      "table_schema",
      "table_name",
      "view_definition",
    ],
    filterColumn: "table_catalog",
    comment: "Curated metadata view: view definitions and their SQL",
  },
  {
    name: "mdg_volumes",
    source: "system.information_schema.volumes",
    columns: [
      "volume_catalog",
      "volume_schema",
      "volume_name",
      "volume_type",
      "volume_owner",
      "comment",
      "storage_location",
      "created",
      "created_by",
      "last_altered",
      "last_altered_by",
    ],
    filterColumn: "volume_catalog",
    comment: "Curated metadata view: Unity Catalog volumes",
  },
  {
    name: "mdg_table_tags",
    source: "system.information_schema.table_tags",
    columns: [
      "catalog_name",
      "schema_name",
      "table_name",
      "tag_name",
      "tag_value",
    ],
    filterColumn: "catalog_name",
    comment: "Curated metadata view: tags applied to tables",
  },
  {
    name: "mdg_column_tags",
    source: "system.information_schema.column_tags",
    columns: [
      "catalog_name",
      "schema_name",
      "table_name",
      "column_name",
      "tag_name",
      "tag_value",
    ],
    filterColumn: "catalog_name",
    comment: "Curated metadata view: tags applied to columns",
  },
  {
    name: "mdg_table_constraints",
    source: "system.information_schema.table_constraints",
    columns: [
      "constraint_catalog",
      "constraint_schema",
      "constraint_name",
      "table_catalog",
      "table_schema",
      "table_name",
      "constraint_type",
      "enforced",
    ],
    filterColumn: "table_catalog",
    comment:
      "Curated metadata view: primary key and foreign key constraints",
  },
  {
    name: "mdg_table_privileges",
    source: "system.information_schema.table_privileges",
    columns: [
      "table_catalog",
      "table_schema",
      "table_name",
      "grantee",
      "privilege_type",
      "is_grantable",
    ],
    filterColumn: "table_catalog",
    comment: "Curated metadata view: table access privileges and grants",
  },
];

// ---------------------------------------------------------------------------
// DDL Generation
// ---------------------------------------------------------------------------

/**
 * Generate CREATE OR REPLACE VIEW DDL for all 10 curated views.
 *
 * When catalogScope is provided, each view includes a WHERE clause
 * filtering to only those catalogs.
 */
export function generateViewDDL(opts: {
  target: ViewTarget;
  catalogScope?: string[];
}): string[] {
  const { target, catalogScope } = opts;
  const fqnPrefix = `\`${target.catalog}\`.\`${target.schema}\``;

  return VIEW_DEFS.map((def) => {
    const cols = def.columns.join(", ");
    let sql = `CREATE OR REPLACE VIEW ${fqnPrefix}.\`${def.name}\``;
    sql += `\nCOMMENT '${def.comment}'`;
    sql += `\nAS SELECT ${cols}\nFROM ${def.source}`;

    if (catalogScope && catalogScope.length > 0) {
      const inList = catalogScope.map((c) => `'${c}'`).join(", ");
      sql += `\nWHERE ${def.filterColumn} IN (${inList})`;
    }

    return sql;
  });
}

/**
 * Generate DROP VIEW IF EXISTS DDL for cleanup.
 */
export function generateDropViewDDL(viewFqns: string[]): string[] {
  return viewFqns.map((fqn) => `DROP VIEW IF EXISTS ${fqn}`);
}

/**
 * Return the list of view FQNs that would be created for a given target.
 */
export function getViewFqns(target: ViewTarget): string[] {
  return VIEW_DEFS.map(
    (def) => `\`${target.catalog}\`.\`${target.schema}\`.\`${def.name}\``
  );
}

/** Return the view definitions for preview/documentation. */
export function getViewDefinitions(): ViewDef[] {
  return VIEW_DEFS;
}

/** Return just the view names (without FQN prefix). */
export function getViewNames(): string[] {
  return VIEW_DEFS.map((d) => d.name);
}

/**
 * Builds a SerializedSpace for the Meta Data Genie.
 *
 * Combines curated system.information_schema view definitions with
 * industry-tailored content derived from the matched outcome map.
 */

import { randomUUID } from "crypto";
import type { IndustryOutcome } from "@/lib/domain/industry-outcomes";
import type {
  SerializedSpace,
  DataSourceTable,
  TextInstruction,
  ExampleQuestionSql,
  SampleQuestion,
  SqlSnippets,
  SqlSnippetMeasure,
  SqlSnippetFilter,
  SqlSnippetExpression,
} from "@/lib/genie/types";
import type { IndustryDetectionResult, ViewTarget } from "./types";

// ---------------------------------------------------------------------------
// View descriptions (hand-written for the Genie)
// ---------------------------------------------------------------------------

const VIEW_DESCRIPTIONS: Record<string, string> = {
  mdg_catalogs:
    "Lists all Unity Catalog catalogs. Use to discover available data catalogs, their owners, and descriptions. Key columns: catalog_name, catalog_owner, comment.",
  mdg_schemas:
    "Lists all schemas (databases) within catalogs. Use to explore the organisational structure of the data estate. Key columns: catalog_name, schema_name, schema_owner, comment.",
  mdg_tables:
    "Lists all tables and views. The primary entry point for discovering what data exists. Key columns: table_catalog, table_schema, table_name, table_type, table_owner, comment, data_source_format, created, last_altered.",
  mdg_columns:
    "Lists all columns with their data types. Use to find specific data attributes across the estate. Key columns: table_catalog, table_schema, table_name, column_name, data_type, is_nullable, comment.",
  mdg_views:
    "Lists SQL view definitions. Use to understand how derived data is computed. Key columns: table_catalog, table_schema, table_name, view_definition.",
  mdg_volumes:
    "Lists Unity Catalog volumes (file-based storage). Key columns: volume_catalog, volume_schema, volume_name, volume_type, storage_location.",
  mdg_table_tags:
    "Lists tags applied to tables. Use to find tables by classification (e.g. PII, sensitivity). Key columns: catalog_name, schema_name, table_name, tag_name, tag_value.",
  mdg_column_tags:
    "Lists tags applied to columns. Use to find columns by classification. Key columns: catalog_name, schema_name, table_name, column_name, tag_name, tag_value.",
  mdg_table_constraints:
    "Lists primary key and foreign key constraints. Use to understand table relationships. Key columns: table_catalog, table_schema, table_name, constraint_type.",
  mdg_table_privileges:
    "Lists table access privileges. Use to understand who has access to what data. Key columns: table_catalog, table_schema, table_name, grantee, privilege_type.",
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export interface BuildMetadataGenieSpaceOpts {
  viewTarget: ViewTarget;
  outcomeMap?: IndustryOutcome | null;
  llmDetection: IndustryDetectionResult;
  catalogScope?: string[];
  title?: string;
}

export function buildMetadataGenieSpace(
  opts: BuildMetadataGenieSpaceOpts
): SerializedSpace {
  const { viewTarget, outcomeMap, llmDetection, catalogScope } = opts;
  const prefix = `${viewTarget.catalog}.${viewTarget.schema}`;

  const tables = buildDataSourceTables(prefix);
  const sampleQuestions = buildSampleQuestions(outcomeMap, llmDetection);
  const textInstructions = buildTextInstructions(
    outcomeMap,
    llmDetection,
    catalogScope
  );
  const exampleSqls = buildExampleSqls(prefix, outcomeMap, llmDetection);
  const sqlSnippets = buildSqlSnippets(prefix, outcomeMap);

  return {
    version: 2,
    config: {
      sample_questions: sampleQuestions,
    },
    data_sources: {
      tables,
    },
    instructions: {
      text_instructions: textInstructions,
      example_question_sqls: exampleSqls,
      join_specs: [],
      sql_snippets: sqlSnippets,
    },
  };
}

// ---------------------------------------------------------------------------
// Data Sources
// ---------------------------------------------------------------------------

function buildDataSourceTables(prefix: string): DataSourceTable[] {
  const viewNames = Object.keys(VIEW_DESCRIPTIONS).sort();
  return viewNames.map((name) => ({
    identifier: `${prefix}.${name}`,
    description: [VIEW_DESCRIPTIONS[name]],
  }));
}

// ---------------------------------------------------------------------------
// Join Relationship Descriptions (expressed via text instructions)
// ---------------------------------------------------------------------------
// The Genie API protobuf parser does not support composite (AND-joined) join
// conditions in join_specs.sql.  Since all MDG view joins are composite-key
// (catalog + schema + table_name), we express them as natural-language text
// instructions instead.  This is the Databricks-recommended approach for
// complex joins and works reliably with the Genie AI engine.

const JOIN_DESCRIPTIONS: string[] = [
  "mdg_catalogs → mdg_schemas: JOIN ON catalog_name = catalog_name",
  "mdg_schemas → mdg_tables: JOIN ON catalog_name = table_catalog AND schema_name = table_schema",
  "mdg_tables → mdg_columns: JOIN ON table_catalog, table_schema, table_name",
  "mdg_tables → mdg_table_tags: JOIN ON table_catalog = catalog_name, table_schema = schema_name, table_name",
  "mdg_columns → mdg_column_tags: JOIN ON table_catalog = catalog_name, table_schema = schema_name, table_name, column_name",
  "mdg_tables → mdg_table_constraints: JOIN ON table_catalog, table_schema, table_name",
  "mdg_tables → mdg_table_privileges: JOIN ON table_catalog, table_schema, table_name",
  "mdg_tables → mdg_views: JOIN ON table_catalog, table_schema, table_name",
  "mdg_schemas → mdg_volumes: JOIN ON catalog_name = volume_catalog, schema_name = volume_schema",
];

// ---------------------------------------------------------------------------
// Sample Questions (BA-focused, derived from outcome map)
// ---------------------------------------------------------------------------

/**
 * Build preview question strings (exported for use by the generate API
 * before a viewTarget is chosen).
 */
export function buildPreviewQuestions(
  outcomeMap: IndustryOutcome | null | undefined,
  llmDetection: IndustryDetectionResult
): string[] {
  const questions: string[] = [];

  if (outcomeMap) {
    const entities = new Set<string>();
    const priorities = new Set<string>();

    for (const obj of outcomeMap.objectives) {
      for (const p of obj.priorities) {
        priorities.add(p.name);
        for (const uc of p.useCases) {
          if (questions.length < 5) {
            questions.push(
              `Do we have data to support ${uc.name.toLowerCase()}?`
            );
          }
          for (const e of uc.typicalDataEntities ?? []) {
            entities.add(e);
          }
        }
      }
    }

    for (const entity of [...entities].slice(0, 4)) {
      questions.push(`Where is ${entity.toLowerCase()} data stored?`);
    }

    for (const priority of [...priorities].slice(0, 3)) {
      questions.push(
        `What data supports ${priority.toLowerCase()}?`
      );
    }

    for (const sv of (outcomeMap.subVerticals ?? []).slice(0, 2)) {
      questions.push(`What data is specific to ${sv}?`);
    }
  } else if (llmDetection.domains.length > 0) {
    for (const domain of llmDetection.domains.slice(0, 5)) {
      questions.push(`What ${domain.toLowerCase()} data do we have?`);
    }
  }

  questions.push(
    "What data do we have?",
    "Do we have any tables without descriptions?",
    "What tables might be duplicated across schemas?",
    "What are the most recently created tables?",
    "Which schemas have the most tables?"
  );

  return [...new Set(questions)].slice(0, 15);
}

function buildSampleQuestions(
  outcomeMap: IndustryOutcome | null | undefined,
  llmDetection: IndustryDetectionResult
): SampleQuestion[] {
  const unique = buildPreviewQuestions(outcomeMap, llmDetection);
  return unique.map((q) => ({
    id: randomUUID(),
    question: [q],
  }));
}

// ---------------------------------------------------------------------------
// Text Instructions
// ---------------------------------------------------------------------------

function buildTextInstructions(
  outcomeMap: IndustryOutcome | null | undefined,
  llmDetection: IndustryDetectionResult,
  catalogScope?: string[]
): TextInstruction[] {
  const parts: string[] = [];

  parts.push(
    "You are a metadata exploration assistant helping business analysts discover and understand their data estate. " +
      "Answer questions about what data exists, where it is stored, its structure, and how it is organised."
  );

  if (outcomeMap) {
    parts.push(
      `This data estate belongs to the ${outcomeMap.name} industry.` +
        (outcomeMap.subVerticals?.length
          ? ` Sub-verticals include: ${outcomeMap.subVerticals.join(", ")}.`
          : "")
    );
    if (outcomeMap.suggestedDomains.length > 0) {
      parts.push(
        `Key business domains: ${outcomeMap.suggestedDomains.join(", ")}.`
      );
    }
  } else if (llmDetection.industries) {
    parts.push(`Detected industries: ${llmDetection.industries}.`);
    if (llmDetection.domains.length > 0) {
      parts.push(
        `Key business domains: ${llmDetection.domains.join(", ")}.`
      );
    }
  }

  if (catalogScope && catalogScope.length > 0) {
    parts.push(
      `This space is scoped to the following catalogs: ${catalogScope.join(", ")}.`
    );
  }

  if (llmDetection.duplication_notes.length > 0) {
    parts.push(
      `Potential duplication patterns observed: ${llmDetection.duplication_notes.join("; ")}.`
    );
  }

  parts.push(
    "When searching for business-relevant tables, look at both table names and their comments/descriptions. " +
      "Tables without comments may still contain important data — infer purpose from naming conventions."
  );

  parts.push(
    "TABLE RELATIONSHIPS — use these joins when combining data across views:\n" +
      JOIN_DESCRIPTIONS.join("\n")
  );

  return [
    {
      id: randomUUID(),
      content: [parts.join("\n\n")],
    },
  ];
}

// ---------------------------------------------------------------------------
// Example SQL
// ---------------------------------------------------------------------------

function buildExampleSqls(
  prefix: string,
  outcomeMap: IndustryOutcome | null | undefined,
  llmDetection: IndustryDetectionResult
): ExampleQuestionSql[] {
  const examples: ExampleQuestionSql[] = [];

  examples.push({
    id: randomUUID(),
    question: ["How many tables do we have in each schema?"],
    sql: [
      `SELECT table_catalog, table_schema, COUNT(*) AS table_count FROM ${prefix}.mdg_tables GROUP BY table_catalog, table_schema ORDER BY table_count DESC`,
    ],
  });

  examples.push({
    id: randomUUID(),
    question: ["Which tables have no description?"],
    sql: [
      `SELECT table_catalog, table_schema, table_name FROM ${prefix}.mdg_tables WHERE comment IS NULL OR TRIM(comment) = '' ORDER BY table_catalog, table_schema, table_name`,
    ],
  });

  examples.push({
    id: randomUUID(),
    question: ["What tables might be duplicated across schemas?"],
    sql: [
      `SELECT table_name, COUNT(DISTINCT CONCAT(table_catalog, '.', table_schema)) AS schema_count, COLLECT_SET(CONCAT(table_catalog, '.', table_schema)) AS schemas FROM ${prefix}.mdg_tables GROUP BY table_name HAVING schema_count > 1 ORDER BY schema_count DESC`,
    ],
  });

  const searchTerm =
    outcomeMap?.suggestedDomains?.[0]?.toLowerCase() ??
    (llmDetection.domains[0]?.toLowerCase() || "customer");

  examples.push({
    id: randomUUID(),
    question: [
      `What tables contain ${searchTerm} data?`,
    ],
    sql: [
      `SELECT table_catalog, table_schema, table_name, comment FROM ${prefix}.mdg_tables WHERE LOWER(table_name) LIKE '%${searchTerm}%' OR LOWER(comment) LIKE '%${searchTerm}%' ORDER BY table_catalog, table_schema, table_name`,
    ],
  });

  examples.push({
    id: randomUUID(),
    question: ["What are the most recently created tables?"],
    sql: [
      `SELECT table_catalog, table_schema, table_name, table_type, created, created_by FROM ${prefix}.mdg_tables ORDER BY created DESC LIMIT 20`,
    ],
  });

  return examples;
}

// ---------------------------------------------------------------------------
// SQL Snippets
// ---------------------------------------------------------------------------

function buildSqlSnippets(
  prefix: string,
  outcomeMap: IndustryOutcome | null | undefined
): SqlSnippets {
  const measures: SqlSnippetMeasure[] = [
    {
      id: randomUUID(),
      alias: "table_count_per_schema",
      sql: [
        `COUNT(*) FROM ${prefix}.mdg_tables GROUP BY table_catalog, table_schema`,
      ],
      synonyms: ["tables per schema", "schema size"],
    },
    {
      id: randomUUID(),
      alias: "column_count_per_table",
      sql: [
        `COUNT(*) FROM ${prefix}.mdg_columns GROUP BY table_catalog, table_schema, table_name`,
      ],
      synonyms: ["columns per table", "table width"],
    },
  ];

  const filters: SqlSnippetFilter[] = [
    {
      id: randomUUID(),
      sql: [
        `comment IS NULL OR TRIM(comment) = ''`,
      ],
      display_name: "Tables without descriptions",
      synonyms: ["undocumented tables", "missing descriptions"],
    },
  ];

  if (outcomeMap) {
    for (const domain of outcomeMap.suggestedDomains.slice(0, 3)) {
      filters.push({
        id: randomUUID(),
        sql: [
          `LOWER(table_name) LIKE '%${domain.toLowerCase().replace(/\s+/g, "_")}%'`,
        ],
        display_name: `Tables related to ${domain}`,
        synonyms: [domain.toLowerCase()],
      });
    }
  }

  const expressions: SqlSnippetExpression[] = [
    {
      id: randomUUID(),
      alias: "potential_duplicates",
      sql: [
        `table_name IN (SELECT table_name FROM ${prefix}.mdg_tables GROUP BY table_name HAVING COUNT(DISTINCT CONCAT(table_catalog, '.', table_schema)) > 1)`,
      ],
      synonyms: ["duplicated tables", "table copies", "redundant tables"],
    },
  ];

  return { measures, filters, expressions };
}

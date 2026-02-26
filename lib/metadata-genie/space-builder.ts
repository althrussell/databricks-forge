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
  JoinSpec,
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
  const joinSpecs = buildJoinSpecs(prefix);
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
      join_specs: joinSpecs,
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
// Join Specs
// ---------------------------------------------------------------------------

function buildJoinSpecs(prefix: string): JoinSpec[] {
  const fqn = (name: string) => `${prefix}.${name}`;

  return [
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_catalogs"), alias: "mdg_catalogs" },
      right: { identifier: fqn("mdg_schemas"), alias: "mdg_schemas" },
      sql: ["`mdg_catalogs`.`catalog_name` = `mdg_schemas`.`catalog_name`"],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_schemas"), alias: "mdg_schemas" },
      right: { identifier: fqn("mdg_tables"), alias: "mdg_tables" },
      sql: [
        "`mdg_schemas`.`catalog_name` = `mdg_tables`.`table_catalog` AND `mdg_schemas`.`schema_name` = `mdg_tables`.`table_schema`",
      ],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_tables"), alias: "mdg_tables" },
      right: { identifier: fqn("mdg_columns"), alias: "mdg_columns" },
      sql: [
        "`mdg_tables`.`table_catalog` = `mdg_columns`.`table_catalog` AND `mdg_tables`.`table_schema` = `mdg_columns`.`table_schema` AND `mdg_tables`.`table_name` = `mdg_columns`.`table_name`",
      ],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_tables"), alias: "mdg_tables" },
      right: { identifier: fqn("mdg_table_tags"), alias: "mdg_table_tags" },
      sql: [
        "`mdg_tables`.`table_catalog` = `mdg_table_tags`.`catalog_name` AND `mdg_tables`.`table_schema` = `mdg_table_tags`.`schema_name` AND `mdg_tables`.`table_name` = `mdg_table_tags`.`table_name`",
      ],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_columns"), alias: "mdg_columns" },
      right: {
        identifier: fqn("mdg_column_tags"),
        alias: "mdg_column_tags",
      },
      sql: [
        "`mdg_columns`.`table_catalog` = `mdg_column_tags`.`catalog_name` AND `mdg_columns`.`table_schema` = `mdg_column_tags`.`schema_name` AND `mdg_columns`.`table_name` = `mdg_column_tags`.`table_name` AND `mdg_columns`.`column_name` = `mdg_column_tags`.`column_name`",
      ],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_tables"), alias: "mdg_tables" },
      right: {
        identifier: fqn("mdg_table_constraints"),
        alias: "mdg_table_constraints",
      },
      sql: [
        "`mdg_tables`.`table_catalog` = `mdg_table_constraints`.`table_catalog` AND `mdg_tables`.`table_schema` = `mdg_table_constraints`.`table_schema` AND `mdg_tables`.`table_name` = `mdg_table_constraints`.`table_name`",
      ],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_tables"), alias: "mdg_tables" },
      right: {
        identifier: fqn("mdg_table_privileges"),
        alias: "mdg_table_privileges",
      },
      sql: [
        "`mdg_tables`.`table_catalog` = `mdg_table_privileges`.`table_catalog` AND `mdg_tables`.`table_schema` = `mdg_table_privileges`.`table_schema` AND `mdg_tables`.`table_name` = `mdg_table_privileges`.`table_name`",
      ],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_tables"), alias: "mdg_tables" },
      right: { identifier: fqn("mdg_views"), alias: "mdg_views" },
      sql: [
        "`mdg_tables`.`table_catalog` = `mdg_views`.`table_catalog` AND `mdg_tables`.`table_schema` = `mdg_views`.`table_schema` AND `mdg_tables`.`table_name` = `mdg_views`.`table_name`",
      ],
    },
    {
      id: randomUUID(),
      left: { identifier: fqn("mdg_schemas"), alias: "mdg_schemas" },
      right: { identifier: fqn("mdg_volumes"), alias: "mdg_volumes" },
      sql: [
        "`mdg_schemas`.`catalog_name` = `mdg_volumes`.`volume_catalog` AND `mdg_schemas`.`schema_name` = `mdg_volumes`.`volume_schema`",
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Sample Questions (BA-focused, derived from outcome map)
// ---------------------------------------------------------------------------

function buildSampleQuestions(
  outcomeMap: IndustryOutcome | null | undefined,
  llmDetection: IndustryDetectionResult
): SampleQuestion[] {
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

  // Universal questions always included
  questions.push(
    "What data do we have?",
    "Do we have any tables without descriptions?",
    "What tables might be duplicated across schemas?",
    "What are the most recently created tables?",
    "Which schemas have the most tables?"
  );

  // Deduplicate and cap
  const unique = [...new Set(questions)].slice(0, 15);
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

/**
 * Pass 6: Metric View Proposals (LLM)
 *
 * Analyses domain tables, measures, dimensions, joins, and column enrichments
 * to propose production-grade metric view YAML definitions conforming to
 * Databricks Unity Catalog YAML v1.1 specification.
 *
 * Features:
 * - Embedded YAML v1.1 spec reference for the LLM
 * - Star/snowflake schema joins from FK metadata
 * - FILTER clause measures for conditional KPIs
 * - Ratio measures (safe re-aggregation)
 * - Time-based dimensions via DATE_TRUNC for date/timestamp columns
 * - Materialization recommendations for high-table-count domains
 * - Seed YAML from Pass 2 measures/dimensions as starting point
 * - Column enrichment descriptions inform dimension/measure naming
 * - Post-generation YAML validation against schema allowlist
 */

import { type ChatMessage } from "@/lib/dbx/model-serving";
import { cachedChatCompletion } from "../llm-cache";
import { executeSQL } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import { reviewAndFixSql } from "@/lib/ai/sql-reviewer";
import { isReviewEnabled } from "@/lib/dbx/client";
import type { MetadataSnapshot, UseCase } from "@/lib/domain/types";
import type {
  MetricViewProposal,
  EnrichedSqlSnippetMeasure,
  EnrichedSqlSnippetDimension,
  ColumnEnrichment,
  JoinSpecInput,
} from "../types";
import {
  buildSchemaContextBlock,
  buildCompactColumnsBlock,
  isValidTable,
  isValidColumn,
  type SchemaAllowlist,
} from "../schema-allowlist";

const TEMPERATURE = 0.2;

/**
 * Strip fully-qualified table prefixes (catalog.schema.table.column) from
 * SQL expressions, leaving bare column names. Metric view YAML expects
 * bare column references or join-alias prefixes, not FQN table prefixes.
 * Handles both unquoted and backtick-quoted column names.
 */
export function stripFqnPrefixes(sql: string): string {
  // Backtick-quoted column: catalog.schema.table.`col name` -> `col name`
  let result = sql.replace(/\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.(`[^`]+`)/g, "$1");
  // Unquoted column: catalog.schema.table.column -> column
  result = result.replace(/\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.([a-zA-Z_]\w*)\b/g, "$1");
  return result;
}

function toSnakeCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export interface MetricViewProposalsInput {
  domain: string;
  tableFqns: string[];
  metadata: MetadataSnapshot;
  allowlist: SchemaAllowlist;
  useCases: UseCase[];
  measures: EnrichedSqlSnippetMeasure[];
  dimensions: EnrichedSqlSnippetDimension[];
  joinSpecs: JoinSpecInput[];
  columnEnrichments: ColumnEnrichment[];
  endpoint: string;
  signal?: AbortSignal;
}

export interface MetricViewProposalsOutput {
  proposals: MetricViewProposal[];
}

// ---------------------------------------------------------------------------
// YAML v1.1 Spec Reference (condensed for LLM prompt)
// ---------------------------------------------------------------------------

const YAML_SPEC_REFERENCE = `
## Databricks Metric View YAML v1.1 Specification

A metric view separates measure definitions from dimension groupings.
Measures are queried via MEASURE(\`name\`) and re-aggregate safely at any granularity.

### Required DDL wrapper:
\`\`\`sql
CREATE OR REPLACE VIEW catalog.schema.view_name
WITH METRICS
LANGUAGE YAML
AS $$
  version: 1.1
  source: catalog.schema.table
  -- ... YAML body ...
$$
\`\`\`

### YAML fields:
- version: "1.1" (required)
- source: catalog.schema.table (required, the primary fact table)
- filter: SQL boolean expression (optional, global WHERE)
- dimensions: list (required, at least one)
  - name: SQL-friendly snake_case identifier, no spaces (e.g. order_month, customer_segment)
  - expr: SQL expression (column ref or transformation)
  - display_name: Human-readable label for dashboards/Genie (optional, e.g. "Order Month")
  - comment: Description of this dimension (optional)
  - synonyms: Alternative names for Genie discovery (optional, up to 10)
- measures: list (required, at least one)
  - name: SQL-friendly snake_case identifier, no spaces (e.g. total_revenue, order_count). Queried via MEASURE(\`name\`).
  - expr: aggregate expression (SUM, COUNT, AVG, MIN, MAX)
  - display_name: Human-readable label for dashboards/Genie (optional, e.g. "Total Revenue")
  - comment: Description of this measure (optional)
  - synonyms: Alternative names for Genie discovery (optional, up to 10)
- joins: list (optional, star/snowflake schema)
  - name: alias for the joined table
  - source: catalog.schema.dim_table
  - on: MUST qualify BOTH sides. Use \`source.\` for the primary table alias and the join name for the dimension table.
    Example: \`source.customerID = customer.customerID\` (NOT \`customerID = customer.customerID\` which is ambiguous)
  - joins: nested list (for snowflake, DBR 17.1+)

### Measure patterns:
- Basic: \`SUM(amount)\`, \`COUNT(1)\`, \`AVG(price)\`
- Filtered: \`SUM(amount) FILTER (WHERE status = 'OPEN')\`
- Ratio: \`SUM(revenue) / COUNT(DISTINCT customer_id)\`
- Distinct: \`COUNT(DISTINCT customer_id)\`

Do NOT use window: blocks on measures -- this feature is experimental and not supported in production.
Do NOT use window functions (OVER clause) in measure expressions -- metric views do not support OVER().
NEVER use MEDIAN() -- use PERCENTILE_APPROX(col, 0.5) instead.
NEVER use AI functions (ai_analyze_sentiment, ai_classify, ai_extract, ai_gen, ai_query, ai_similarity, ai_forecast, ai_summarize) anywhere in metric view definitions -- not in dimensions, measures, filters, or join conditions. They are non-deterministic and prohibitively expensive per-row. Metric views must use only deterministic SQL expressions over materialized columns.

### CRITICAL: Measure name shadowing
Measure \`name\` MUST NOT be identical to any source table column name. In metric views, measure names and column names share a namespace — the measure definition takes priority. If they match, the column reference inside the expr resolves to the measure itself, causing a recursive NESTED_AGGREGATE_FUNCTION error. Always differentiate: if the column is \`total_complaints\`, name the measure \`total_complaints_total\` or \`complaint_volume\`.

### Column names with spaces
When column names contain spaces or special characters (parentheses, hyphens), always backtick-quote them in \`expr:\`, \`on:\`, and \`filter:\` fields: \`\\\`Defaulted Loans\\\`\`, \`source.\\\`Loan Origination Month\\\`\`. Unquoted multi-word names cause parsing errors.

### Materialization (experimental):
\`\`\`yaml
materialization:
  schedule: every 6 hours
  mode: relaxed
  materialized_views:
    - name: daily_summary
      type: aggregated
      dimensions: [dim1]
      measures: [measure1]
\`\`\`
`.trim();

// ---------------------------------------------------------------------------
// Seed YAML builder
// ---------------------------------------------------------------------------

function buildSeedYaml(
  primaryTable: string,
  measures: EnrichedSqlSnippetMeasure[],
  dimensions: EnrichedSqlSnippetDimension[],
): string {
  const topMeasures = measures.slice(0, 6);
  const topDims = dimensions.filter((d) => !d.isTimePeriod).slice(0, 4);
  const timeDims = dimensions.filter((d) => d.isTimePeriod).slice(0, 2);
  const allDims = [...topDims, ...timeDims];

  if (topMeasures.length === 0 || allDims.length === 0) return "";

  const dimLines = allDims.map((d) => {
    const snakeName = toSnakeCase(d.name);
    return `    - name: ${snakeName}\n      expr: ${stripFqnPrefixes(d.sql)}\n      display_name: "${d.name}"`;
  });

  const measureLines = topMeasures.map((m) => {
    const snakeName = toSnakeCase(m.name);
    return `    - name: ${snakeName}\n      expr: ${stripFqnPrefixes(m.sql)}\n      display_name: "${m.name}"`;
  });

  return [
    "  version: 1.1",
    `  source: ${primaryTable}`,
    "  dimensions:",
    ...dimLines,
    "  measures:",
    ...measureLines,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// YAML Validation
// ---------------------------------------------------------------------------

interface ValidationResult {
  status: "valid" | "warning" | "error";
  issues: string[];
}

/**
 * Build a map of alias -> table FQN from the YAML source + joins, then
 * validate every `alias.column` reference in expr/on fields against the
 * schema allowlist.
 */
export function validateColumnReferences(yaml: string, allowlist: SchemaAllowlist): string[] {
  const issues: string[] = [];

  // Primary source table -> implicit "source" alias
  const sourceMatch = yaml.match(/^\s*source:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/m);
  if (!sourceMatch) return issues;
  const sourceFqn = sourceMatch[1];

  const aliasToTable = new Map<string, string>();
  aliasToTable.set("source", sourceFqn);

  // Parse join aliases from the joins: section.
  // Isolate the joins block (indented lines after "joins:") to avoid
  // matching the top-level source: field.
  const joinsSectionMatch = yaml.match(/\bjoins:\s*\n((?:[\t ]+.*\n?)*)/);
  if (joinsSectionMatch) {
    const joinsText = joinsSectionMatch[1];
    const names: string[] = [];
    const sources: string[] = [];

    const nameRe = /\bname:\s*(\w+)/g;
    const srcRe = /\bsource:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/g;

    let m: RegExpExecArray | null;
    while ((m = nameRe.exec(joinsText)) !== null) names.push(m[1]);
    while ((m = srcRe.exec(joinsText)) !== null) sources.push(m[1]);

    const count = Math.min(names.length, sources.length);
    for (let i = 0; i < count; i++) {
      aliasToTable.set(names[i].toLowerCase(), sources[i]);
    }
  }

  // Collect all expr: and on: field values
  const fieldPattern = /\b(?:expr|on):\s*(.+)/g;
  const expressions: string[] = [];
  let fm: RegExpExecArray | null;
  while ((fm = fieldPattern.exec(yaml)) !== null) {
    expressions.push(fm[1]);
  }

  // Validate alias.column references against the allowlist
  const colRefPattern = /\b([a-zA-Z_]\w*)\.([a-zA-Z_]\w*)\b/g;
  const quotedColRefPattern = /\b([a-zA-Z_]\w*)\.`([^`]+)`/g;
  const reported = new Set<string>();

  // SQL keywords and YAML fields that look like alias.column but aren't
  const SKIP_ALIASES = new Set(["version", "catalog", "schema", "language", "yaml"]);

  function checkRef(alias: string, column: string, display: string): void {
    if (SKIP_ALIASES.has(alias.toLowerCase())) return;

    const tableFqn = aliasToTable.get(alias.toLowerCase());
    if (!tableFqn) {
      if (!reported.has(display)) {
        reported.add(display);
        issues.push(
          `Unknown alias \`${alias}\` in \`${display}\` — only \`source\` and declared join names are valid`,
        );
      }
      return;
    }

    if (!isValidColumn(allowlist, tableFqn, column)) {
      if (!reported.has(display)) {
        reported.add(display);
        issues.push(`Column \`${display}\` not found in table ${tableFqn}`);
      }
    }
  }

  for (const expr of expressions) {
    let cm: RegExpExecArray | null;
    // Backtick-quoted: alias.`column with spaces`
    while ((cm = quotedColRefPattern.exec(expr)) !== null) {
      checkRef(cm[1], cm[2], `${cm[1]}.\`${cm[2]}\``);
    }
    // Unquoted: alias.column
    while ((cm = colRefPattern.exec(expr)) !== null) {
      checkRef(cm[1], cm[2], `${cm[1]}.${cm[2]}`);
    }
  }

  return issues;
}

export function validateMetricViewYaml(
  yaml: string,
  ddl: string,
  allowlist: SchemaAllowlist,
): ValidationResult {
  const issues: string[] = [];

  if (!yaml.includes("version:")) {
    issues.push("Missing required field: version");
  }
  if (!yaml.includes("source:")) {
    issues.push("Missing required field: source");
  }
  if (!yaml.includes("dimensions:")) {
    issues.push("Missing required field: dimensions");
  }
  if (!yaml.includes("measures:")) {
    issues.push("Missing required field: measures");
  }

  const sourceMatch = yaml.match(/source:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/);
  if (sourceMatch) {
    const sourceFqn = sourceMatch[1];
    if (!isValidTable(allowlist, sourceFqn)) {
      issues.push(`Source table not found in schema: ${sourceFqn}`);
    }
  }

  // Detect FQN-qualified column references in expr fields (catalog.schema.table.column)
  const fqnColPattern = /\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\b/g;
  const exprBlocks = yaml.match(/expr:\s*.+/g) ?? [];
  for (const exprLine of exprBlocks) {
    const fqnMatches = exprLine.match(fqnColPattern);
    if (fqnMatches) {
      issues.push(`FQN column reference in expr (use bare column name instead): ${fqnMatches[0]}`);
    }
  }

  // Detect window functions in measure expressions (OVER clause) -- unsupported in metric views
  const measureBlock = yaml.match(/measures:[\s\S]*$/)?.[0] ?? "";
  const measureExprs = measureBlock.match(/expr:\s*.+/g) ?? [];
  for (const exprLine of measureExprs) {
    if (/\bOVER\s*\(/i.test(exprLine)) {
      issues.push(
        `Window function (OVER) in measure expr is not supported in metric views: ${exprLine.trim()}`,
      );
    }
  }

  // Detect AI functions anywhere in metric view expressions -- they are
  // non-deterministic and prohibitively expensive per-row.
  const AI_FN_PATTERN =
    /\b(ai_analyze_sentiment|ai_classify|ai_extract|ai_gen|ai_query|ai_similarity|ai_forecast|ai_summarize)\s*\(/i;
  const allExprLines = yaml.match(/(?:expr|filter|on):\s*.+/g) ?? [];
  for (const line of allExprLines) {
    const aiMatch = line.match(AI_FN_PATTERN);
    if (aiMatch) {
      issues.push(
        `AI function "${aiMatch[1]}" in metric view expression is not allowed (non-deterministic and expensive): ${line.trim()}`,
      );
    }
  }

  const joinSourceMatches = yaml.matchAll(
    /joins:[\s\S]*?source:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/g,
  );
  for (const m of joinSourceMatches) {
    const joinFqn = m[1];
    if (!isValidTable(allowlist, joinFqn)) {
      issues.push(`Join table not found in schema: ${joinFqn}`);
    }
  }

  // Detect measure names that shadow source column names — in metric views,
  // measure names take priority over column names in the shared namespace.
  // If they match, the column reference in the expr resolves to the measure
  // itself, causing a recursive NESTED_AGGREGATE_FUNCTION error.
  if (sourceMatch) {
    const sourceFqn = sourceMatch[1];
    const sourceCols = allowlist.columns.get(sourceFqn.toLowerCase());
    if (sourceCols) {
      const measureNamePattern = /^\s*-\s*name:\s*(.+)/gm;
      let mn: RegExpExecArray | null;
      while ((mn = measureNamePattern.exec(measureBlock)) !== null) {
        const mName = mn[1].trim().replace(/^["']|["']$/g, "");
        if (sourceCols.has(mName.toLowerCase())) {
          const snakeSuggestion = toSnakeCase(mName);
          issues.push(
            `Measure name "${mName}" shadows source column "${mName}" — Databricks resolves the column reference as a recursive measure call, causing NESTED_AGGREGATE_FUNCTION. Rename the measure (e.g. "${snakeSuggestion}_total", "${snakeSuggestion}_count").`,
          );
        }
      }
    }
  }

  // Safety-net: detect explicitly nested aggregate functions
  const AGG_FNS = "SUM|COUNT|AVG|MIN|MAX|PERCENTILE_APPROX|COLLECT_LIST|COLLECT_SET";
  const nestedAggPattern = new RegExp(`\\b(${AGG_FNS})\\s*\\([^)]*\\b(${AGG_FNS})\\s*\\(`, "i");
  for (const exprLine of measureExprs) {
    if (nestedAggPattern.test(exprLine)) {
      issues.push(`Nested aggregate function in measure expr is not allowed: ${exprLine.trim()}`);
    }
  }

  // Validate alias.column references (e.g. source.amount, supplier.name)
  // against actual table schemas in the allowlist
  issues.push(...validateColumnReferences(yaml, allowlist));

  if (!ddl.includes("WITH METRICS")) {
    issues.push("DDL missing WITH METRICS clause");
  }
  if (!ddl.includes("LANGUAGE YAML")) {
    issues.push("DDL missing LANGUAGE YAML clause");
  }
  if (!ddl.includes("$$")) {
    issues.push("DDL missing $$ delimiters");
  }

  const hasCritical = issues.some(
    (i) =>
      i.startsWith("Missing required") ||
      i.includes("not found in schema") ||
      i.includes("not found in table") ||
      i.includes("Unknown alias") ||
      i.includes("Window function") ||
      i.includes("AI function") ||
      i.includes("shadows source column") ||
      i.includes("Nested aggregate"),
  );

  return {
    status: issues.length === 0 ? "valid" : hasCritical ? "error" : "warning",
    issues,
  };
}

// ---------------------------------------------------------------------------
// Feature detection helpers
// ---------------------------------------------------------------------------

function detectFeatures(yaml: string): {
  hasJoins: boolean;
  hasFilteredMeasures: boolean;
  hasWindowMeasures: boolean;
  hasMaterialization: boolean;
} {
  return {
    hasJoins: /\bjoins:/i.test(yaml),
    hasFilteredMeasures: /FILTER\s*\(/i.test(yaml),
    hasWindowMeasures: /\bwindow:/i.test(yaml),
    hasMaterialization: /\bmaterialization:/i.test(yaml),
  };
}

// ---------------------------------------------------------------------------
// Auto-rename: deterministically fix measure names that shadow source columns
// ---------------------------------------------------------------------------

function inferAggregateSuffix(expr: string): string {
  const upper = expr.toUpperCase();
  if (/\bCOUNT\s*\(\s*DISTINCT\b/.test(upper)) return "_distinct_count";
  if (/\bSUM\s*\(/.test(upper)) return "_total";
  if (/\bCOUNT\s*\(/.test(upper)) return "_count";
  if (/\bAVG\s*\(/.test(upper)) return "_avg";
  if (/\bMIN\s*\(/.test(upper)) return "_min";
  if (/\bMAX\s*\(/.test(upper)) return "_max";
  if (/\bPERCENTILE_APPROX\s*\(/.test(upper)) return "_percentile";
  return "_metric";
}

/**
 * Detect measure names that are identical to source column names and rename
 * them by appending an aggregate-derived suffix (e.g. "_total", "_avg").
 * This prevents the NESTED_AGGREGATE_FUNCTION error at deploy time without
 * requiring an extra LLM repair round-trip.
 */
export function autoRenameShadowedMeasures(
  yaml: string,
  ddl: string,
  allowlist: SchemaAllowlist,
): { yaml: string; ddl: string; renamed: number } {
  const sourceMatch = yaml.match(/^\s*source:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/m);
  if (!sourceMatch) return { yaml, ddl, renamed: 0 };

  const sourceCols = allowlist.columns.get(sourceMatch[1].toLowerCase());
  if (!sourceCols || sourceCols.size === 0) return { yaml, ddl, renamed: 0 };

  const measuresIdx = yaml.indexOf("measures:");
  if (measuresIdx === -1) return { yaml, ddl, renamed: 0 };
  const measuresBlock = yaml.slice(measuresIdx);

  const renames = new Map<string, string>();
  const entryPattern = /-\s*name:\s*(.+)\n\s*expr:\s*(.+)/g;
  let m: RegExpExecArray | null;

  while ((m = entryPattern.exec(measuresBlock)) !== null) {
    const rawName = m[1].trim().replace(/^["']|["']$/g, "");
    if (sourceCols.has(rawName.toLowerCase()) && !renames.has(rawName)) {
      renames.set(rawName, `${toSnakeCase(rawName)}${inferAggregateSuffix(m[2].trim())}`);
    }
  }

  if (renames.size === 0) return { yaml, ddl, renamed: 0 };

  let modYaml = yaml;
  let modDdl = ddl;

  for (const [oldName, newName] of renames) {
    const escaped = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(-\\s*name:\\s*)(["']?)${escaped}\\2(\\s*(?:\\n|$))`, "g");
    modYaml = applyInMeasuresBlock(modYaml, pattern, `$1${newName}$3`);
    modDdl = applyInMeasuresBlock(modDdl, pattern, `$1${newName}$3`);
  }

  return { yaml: modYaml, ddl: modDdl, renamed: renames.size };
}

function applyInMeasuresBlock(text: string, pattern: RegExp, replacement: string): string {
  const idx = text.indexOf("measures:");
  if (idx === -1) return text;
  return text.slice(0, idx) + text.slice(idx).replace(pattern, replacement);
}

// ---------------------------------------------------------------------------
// LLM repair: re-prompt once with validation errors + correct schema
// ---------------------------------------------------------------------------

const COLUMN_ERROR_PATTERNS = [
  "not found in table",
  "Unknown alias",
  "UNRESOLVED_COLUMN",
  "NESTED_AGGREGATE",
  "FIELD_NOT_FOUND",
  "shadows source column",
  "Nested aggregate",
];

function hasColumnErrors(issues: string[]): boolean {
  return issues.some((i) => COLUMN_ERROR_PATTERNS.some((p) => i.includes(p)));
}

async function repairProposal(
  proposal: MetricViewProposal,
  schemaBlock: string,
  columnsBlock: string,
  endpoint: string,
  signal?: AbortSignal,
): Promise<MetricViewProposal | null> {
  const repairMessages: ChatMessage[] = [
    {
      role: "system",
      content: `You are a Databricks SQL expert. A metric view YAML definition failed validation because it references columns or table aliases that do not exist. Fix the YAML so it ONLY uses columns from the SCHEMA CONTEXT below.

Rules:
- The primary fact table has the implicit alias \`source\`. Use \`source.columnName\` or bare \`columnName\` for its columns.
- Join aliases must match a \`name:\` declared in the \`joins:\` block. Do NOT invent aliases.
- If a join references a table not listed in the SCHEMA CONTEXT, REMOVE the entire join and all references to it.
- Measure \`name\` MUST be snake_case (no spaces) and MUST NOT be identical to any source column name (causes NESTED_AGGREGATE_FUNCTION). If the column is \`total_complaints\`, name the measure \`total_complaints_total\` or \`complaint_volume\`. Add a \`display_name\` for the human-readable label.
- When column names contain spaces, backtick-quote them: \`\\\`Defaulted Loans\\\`\`, \`source.\\\`Loan Origination Month\\\`\`.
- Return the SAME JSON format: { "yaml": "...", "ddl": "..." }

${schemaBlock}

${columnsBlock}`,
    },
    {
      role: "user",
      content: `The following metric view YAML failed validation:

### VALIDATION ERRORS
${proposal.validationIssues.map((i) => `- ${i}`).join("\n")}

### ORIGINAL YAML
\`\`\`yaml
${proposal.yaml}
\`\`\`

### ORIGINAL DDL
\`\`\`sql
${proposal.ddl}
\`\`\`

Fix the YAML and DDL to only reference tables and columns from the SCHEMA CONTEXT. Return JSON: { "yaml": "...", "ddl": "..." }`,
    },
  ];

  try {
    const result = await cachedChatCompletion({
      endpoint,
      messages: repairMessages,
      temperature: 0.1,
      maxTokens: 16384,
      responseFormat: "json_object",
      signal,
    });

    const parsed = parseLLMJson(result.content ?? "", "genie:metric-views:repair") as Record<
      string,
      unknown
    >;
    const repairedYaml = String(parsed.yaml ?? "");
    const repairedDdl = String(parsed.ddl ?? "");

    if (!repairedYaml || !repairedDdl) return null;

    return {
      ...proposal,
      yaml: repairedYaml,
      ddl: repairedDdl,
    };
  } catch (err) {
    logger.warn("Metric view repair LLM call failed", {
      name: proposal.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main pass
// ---------------------------------------------------------------------------

export async function runMetricViewProposals(
  input: MetricViewProposalsInput,
): Promise<MetricViewProposalsOutput> {
  const {
    domain,
    tableFqns,
    metadata,
    allowlist,
    useCases,
    measures,
    dimensions,
    joinSpecs,
    columnEnrichments,
    endpoint,
    signal,
  } = input;

  if (tableFqns.length === 0 || measures.length === 0) {
    return { proposals: [] };
  }

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);
  const columnsBlock = buildCompactColumnsBlock(metadata, tableFqns);

  // Build enrichment lookup: column name -> description
  const enrichmentMap = new Map<string, string>();
  for (const e of columnEnrichments) {
    if (e.description) {
      enrichmentMap.set(e.columnName, e.description);
    }
  }

  // Build measures/dimensions context (strip FQN prefixes for metric view context)
  const measuresBlock = measures
    .slice(0, 15)
    .map(
      (m) =>
        `- ${m.name}: ${stripFqnPrefixes(m.sql)}${m.instructions ? ` — ${m.instructions}` : ""}`,
    )
    .join("\n");

  const dimensionsBlock = dimensions
    .filter((d) => !d.isTimePeriod)
    .slice(0, 10)
    .map((d) => `- ${d.name}: ${stripFqnPrefixes(d.sql)}`)
    .join("\n");

  const timeDimensions = dimensions
    .filter((d) => d.isTimePeriod)
    .slice(0, 5)
    .map((d) => `- ${d.name}: ${stripFqnPrefixes(d.sql)}`)
    .join("\n");

  // Build join context
  const joinBlock =
    joinSpecs.length > 0
      ? joinSpecs
          .map((j) => `- ${j.leftTable} → ${j.rightTable} ON ${j.sql} (${j.relationshipType})`)
          .join("\n")
      : "";

  // Build column enrichments context
  const enrichmentBlock = columnEnrichments
    .filter((e) => e.description)
    .slice(0, 20)
    .map((e) => `- ${e.tableFqn}.${e.columnName}: ${e.description}`)
    .join("\n");

  // Build seed YAML from existing measures/dimensions
  const primaryTable = tableFqns[0];
  const seedYaml = buildSeedYaml(primaryTable, measures, dimensions);

  // Determine if materialization should be suggested
  const suggestMaterialization = tableFqns.length > 10 || joinSpecs.length > 3;

  const systemMessage = `You are a Databricks SQL expert creating Unity Catalog metric view definitions.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

${columnsBlock}

${YAML_SPEC_REFERENCE}

---

## Your Task

Create 1-3 metric view proposals for the "${domain}" domain. Each proposal MUST:

1. Follow the YAML v1.1 spec exactly (version, source, dimensions, measures)
2. Use a central fact table as the source
${joinSpecs.length > 0 ? "3. When joins are available, create star-schema metric views using the joins: block to pull dimensions from dimension tables" : "3. Define meaningful dimensions from the source table columns. Do NOT create a joins: block — no join relationships are available."}
4. Include time-based dimensions using DATE_TRUNC for any date/timestamp columns
5. Include a mix of measure types:
   - Basic aggregates (SUM, COUNT, AVG)
   - FILTER clause measures for status/category breakdowns using DETERMINISTIC column values only, e.g. \`SUM(amount) FILTER (WHERE status = 'OPEN')\`. NEVER use AI functions in ANY metric view expression -- they are non-deterministic and expensive.
   - Ratio measures that safely re-aggregate, e.g. \`SUM(revenue) / COUNT(DISTINCT customer_id)\`
   - COUNT DISTINCT measures for cardinality metrics
6. Use SQL-friendly snake_case identifiers for dimension/measure \`name\` values (e.g. \`total_revenue\`, \`order_count\`, \`order_month\`). Add a \`display_name\` field with a human-readable label (e.g. "Total Revenue"). Add \`synonyms\` for Genie discovery where useful.
${suggestMaterialization ? `7. For the most complex proposal, include a materialization: block (schedule: every 6 hours, mode: relaxed) with at least one aggregated materialized view` : ""}

## STRICT COLUMN GROUNDING RULES
- Every column name in \`expr:\`, \`on:\`, and \`filter:\` MUST exist in the AVAILABLE COLUMNS list above.
- The source table uses the implicit alias \`source\`. Use \`source.column\` or bare \`column\` for its columns.
- NEVER reference a table alias you did not define in a \`joins:\` block.
- NEVER invent column names like "ingredient", "supplier_name", etc. that are not in the AVAILABLE COLUMNS list.
${joinSpecs.length === 0 ? "- There are NO join relationships — do NOT create a joins: block or reference any aliases other than \`source\`." : "- Join aliases must match an alias from the JOIN RELATIONSHIPS section. Do not invent join aliases."}

## Output format (JSON):
{
  "proposals": [
    {
      "name": "metric_view_name",
      "description": "What this metric view measures and why it is useful",
      "yaml": "version: 1.1\\nsource: catalog.schema.table\\n...",
      "ddl": "CREATE OR REPLACE VIEW catalog.schema.metric_view_name\\nWITH METRICS\\nLANGUAGE YAML\\nAS $$\\n...\\n$$",
      "sourceTables": ["catalog.schema.table", "catalog.schema.dim_table"]
    }
  ]
}

IMPORTANT:
- The "yaml" field must contain the YAML body only (what goes between $$). The "ddl" field must contain the complete CREATE statement including $$ delimiters.
- Column references in YAML expr fields must use BARE column names (e.g. \`amount\`, \`franchiseID\`) or JOIN ALIAS prefixes (e.g. \`franchise.franchiseID\`). NEVER use fully-qualified table names as column prefixes (e.g. \`catalog.schema.table.column\` is WRONG — the SQL engine cannot resolve 4-part names in metric view expressions).`;

  const userMessage = `${schemaBlock}

### MEASURES ALREADY IDENTIFIED
${measuresBlock || "(none)"}

### DIMENSIONS ALREADY IDENTIFIED
${dimensionsBlock || "(none)"}

### TIME DIMENSIONS
${timeDimensions || "(none)"}

${joinBlock ? `### JOIN RELATIONSHIPS\n${joinBlock}\n` : ""}
${enrichmentBlock ? `### COLUMN DESCRIPTIONS (use to inform descriptive dimension/measure names)\n${enrichmentBlock}\n` : ""}
${seedYaml ? `### SEED YAML (starting point — improve, extend, and add joins/filters/ratios)\n\`\`\`yaml\n${seedYaml}\n\`\`\`\n` : ""}
### DOMAIN USE CASES (for context)
${useCases
  .slice(0, 5)
  .map((uc) => `- ${uc.name}: ${uc.statement}`)
  .join("\n")}

Create metric view proposals for this domain.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  try {
    const result = await cachedChatCompletion({
      endpoint,
      messages,
      temperature: TEMPERATURE,
      maxTokens: 32768,
      responseFormat: "json_object",
      signal,
    });

    const content = result.content ?? "";
    const parsed = parseLLMJson(content, "genie:metric-views") as Record<string, unknown>;
    const items: Record<string, unknown>[] = Array.isArray(parsed.proposals)
      ? parsed.proposals
      : Array.isArray(parsed)
        ? parsed
        : [];

    const proposals: MetricViewProposal[] = items
      .map((p) => {
        const yamlStr = String(p.yaml ?? "");
        let ddlStr = String(p.ddl ?? "");

        // Safety net: strip FQN column prefixes from YAML expr/on lines in the DDL.
        // Preserve CREATE VIEW and source: lines (those need FQN).
        ddlStr = ddlStr.replace(
          /^(\s*(?:expr|on):\s*)(.+)$/gm,
          (_match, prefix: string, rest: string) => prefix + stripFqnPrefixes(rest),
        );

        const {
          yaml: fixedYaml,
          ddl: fixedDdl,
          renamed,
        } = autoRenameShadowedMeasures(yamlStr, ddlStr, allowlist);
        if (renamed > 0) {
          logger.info("Auto-renamed shadowed measure names before validation", {
            domain,
            name: String(p.name ?? ""),
            renamed,
          });
        }

        const validation = validateMetricViewYaml(fixedYaml, fixedDdl, allowlist);
        const features = detectFeatures(fixedYaml);

        return {
          name: String(p.name ?? ""),
          description: String(p.description ?? ""),
          yaml: fixedYaml,
          ddl: fixedDdl,
          sourceTables: Array.isArray(p.sourceTables) ? p.sourceTables.map(String) : [],
          hasJoins: features.hasJoins,
          hasFilteredMeasures: features.hasFilteredMeasures,
          hasWindowMeasures: features.hasWindowMeasures,
          hasMaterialization: features.hasMaterialization,
          validationStatus: validation.status,
          validationIssues: validation.issues,
        };
      })
      .filter((p) => p.name.length > 0 && p.ddl.length > 0);

    // Repair loop: re-prompt the LLM once for proposals with column/alias errors
    for (let i = 0; i < proposals.length; i++) {
      const proposal = proposals[i];
      if (proposal.validationStatus !== "error" || !hasColumnErrors(proposal.validationIssues)) {
        continue;
      }

      logger.info("Attempting LLM repair for metric view with column errors", {
        domain,
        name: proposal.name,
        issues: proposal.validationIssues,
      });

      const repaired = await repairProposal(proposal, schemaBlock, columnsBlock, endpoint, signal);

      if (!repaired) continue;

      // Strip FQN prefixes from repaired DDL expr/on lines
      repaired.ddl = repaired.ddl.replace(
        /^(\s*(?:expr|on):\s*)(.+)$/gm,
        (_match, prefix: string, rest: string) => prefix + stripFqnPrefixes(rest),
      );

      const { yaml: reFixedYaml, ddl: reFixedDdl } = autoRenameShadowedMeasures(
        repaired.yaml,
        repaired.ddl,
        allowlist,
      );
      repaired.yaml = reFixedYaml;
      repaired.ddl = reFixedDdl;

      const revalidation = validateMetricViewYaml(repaired.yaml, repaired.ddl, allowlist);
      const reFeatures = detectFeatures(repaired.yaml);

      proposals[i] = {
        ...repaired,
        hasJoins: reFeatures.hasJoins,
        hasFilteredMeasures: reFeatures.hasFilteredMeasures,
        hasWindowMeasures: reFeatures.hasWindowMeasures,
        hasMaterialization: reFeatures.hasMaterialization,
        validationStatus: revalidation.status,
        validationIssues: revalidation.issues,
      };

      if (revalidation.status !== "error") {
        logger.info("LLM repair succeeded for metric view", {
          domain,
          name: proposal.name,
        });
      } else {
        logger.warn("LLM repair did not resolve column errors", {
          domain,
          name: proposal.name,
          issues: revalidation.issues,
        });
      }
    }

    // Dry-run: execute DDL for proposals that passed static validation to
    // catch SQL-level errors before the user ever sees the proposal.
    // Permission errors are treated as warnings (user can deploy to a
    // different schema), not hard failures.
    const PERMISSION_PATTERNS = [
      "PERMISSION_DENIED",
      "does not have CREATE",
      "Access denied",
      "INSUFFICIENT_PRIVILEGES",
    ];

    for (const proposal of proposals) {
      if (proposal.validationStatus === "error") continue;
      try {
        await executeSQL(proposal.ddl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isPermissionError = PERMISSION_PATTERNS.some((p) => msg.includes(p));

        if (isPermissionError) {
          if (proposal.validationStatus !== "warning") {
            proposal.validationStatus = "warning";
          }
          proposal.validationIssues.push(
            `Could not pre-validate — no CREATE permission on source schema. Deploy to a schema you own.`,
          );
          logger.info("Metric view dry-run skipped (permission)", {
            domain,
            name: proposal.name,
          });
        } else {
          proposal.validationStatus = "error";
          proposal.validationIssues.push(`SQL validation failed: ${msg}`);
          logger.warn("Metric view dry-run failed", {
            domain,
            name: proposal.name,
            error: msg,
          });
        }
      }
    }

    // LLM review gate: review DDL for proposals that passed validation
    if (isReviewEnabled("genie-metric-views")) {
      for (const proposal of proposals) {
        if (proposal.validationStatus === "error" || !proposal.ddl) continue;
        try {
          const review = await reviewAndFixSql(proposal.ddl, {
            schemaContext: schemaBlock,
            surface: "genie-metric-views",
          });
          if (review.fixedSql) {
            const revalidation = validateMetricViewYaml(proposal.yaml, review.fixedSql, allowlist);
            if (revalidation.status !== "error") {
              proposal.ddl = review.fixedSql;
              logger.info("Metric view: review applied DDL fix", {
                name: proposal.name,
                qualityScore: review.qualityScore,
              });
            }
          } else if (review.verdict === "fail") {
            proposal.validationIssues.push(...review.issues.map((i) => `Review: ${i.message}`));
            if (proposal.validationStatus === "valid") {
              proposal.validationStatus = "warning";
            }
          }
        } catch (err) {
          logger.warn("Metric view review failed, keeping original", {
            name: proposal.name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    logger.info("Metric view proposals generated", {
      domain,
      count: proposals.length,
      features: proposals.map((p) => ({
        name: p.name,
        joins: p.hasJoins,
        filtered: p.hasFilteredMeasures,
        window: p.hasWindowMeasures,
        materialized: p.hasMaterialization,
        validation: p.validationStatus,
      })),
    });

    return { proposals };
  } catch (err) {
    logger.warn("Metric view proposal generation failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { proposals: [] };
  }
}

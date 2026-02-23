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
import { logger } from "@/lib/logger";
import { parseLLMJson } from "./parse-llm-json";
import type { MetadataSnapshot, UseCase } from "@/lib/domain/types";
import type {
  MetricViewProposal,
  EnrichedSqlSnippetMeasure,
  EnrichedSqlSnippetDimension,
  ColumnEnrichment,
} from "../types";
import {
  buildSchemaContextBlock,
  isValidTable,
  type SchemaAllowlist,
} from "../schema-allowlist";

const TEMPERATURE = 0.2;

/**
 * Strip fully-qualified table prefixes (catalog.schema.table.column) from
 * SQL expressions, leaving bare column names. Metric view YAML expects
 * bare column references or join-alias prefixes, not FQN table prefixes.
 */
function stripFqnPrefixes(sql: string): string {
  // Match `catalog.schema.table.column` and replace with just `column`
  return sql.replace(
    /\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.([a-zA-Z_]\w*)\b/g,
    "$1"
  );
}

export interface JoinSpecInput {
  leftTable: string;
  rightTable: string;
  sql: string;
  relationshipType: "many_to_one" | "one_to_many" | "one_to_one";
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
  - name: Display Name (backtick-quoted in queries)
  - expr: SQL expression (column ref or transformation)
- measures: list (required, at least one)
  - name: Display Name (queried via MEASURE(\`name\`))
  - expr: aggregate expression (SUM, COUNT, AVG, MIN, MAX)

IMPORTANT: Dimension and measure entries only support "name" and "expr". Do NOT add "comment", "window", or any other fields -- the YAML parser will reject them.
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
  const topDims = dimensions
    .filter((d) => !d.isTimePeriod)
    .slice(0, 4);
  const timeDims = dimensions
    .filter((d) => d.isTimePeriod)
    .slice(0, 2);
  const allDims = [...topDims, ...timeDims];

  if (topMeasures.length === 0 || allDims.length === 0) return "";

  const dimLines = allDims.map((d) => {
    return `    - name: ${d.name}\n      expr: ${stripFqnPrefixes(d.sql)}`;
  });

  const measureLines = topMeasures.map((m) => {
    return `    - name: ${m.name}\n      expr: ${stripFqnPrefixes(m.sql)}`;
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

function validateMetricViewYaml(
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
      issues.push(`Window function (OVER) in measure expr is not supported in metric views: ${exprLine.trim()}`);
    }
  }

  const joinSourceMatches = yaml.matchAll(/joins:[\s\S]*?source:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/g);
  for (const m of joinSourceMatches) {
    const joinFqn = m[1];
    if (!isValidTable(allowlist, joinFqn)) {
      issues.push(`Join table not found in schema: ${joinFqn}`);
    }
  }

  if (!ddl.includes("WITH METRICS")) {
    issues.push("DDL missing WITH METRICS clause");
  }
  if (!ddl.includes("LANGUAGE YAML")) {
    issues.push("DDL missing LANGUAGE YAML clause");
  }
  if (!ddl.includes("$$")) {
    issues.push("DDL missing $$ delimiters");
  }

  const hasCritical = issues.some((i) =>
    i.startsWith("Missing required") || i.includes("not found in schema") || i.includes("Window function")
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
// Main pass
// ---------------------------------------------------------------------------

export async function runMetricViewProposals(
  input: MetricViewProposalsInput,
): Promise<MetricViewProposalsOutput> {
  const {
    domain, tableFqns, metadata, allowlist, useCases,
    measures, dimensions, joinSpecs, columnEnrichments, endpoint, signal,
  } = input;

  if (tableFqns.length === 0 || measures.length === 0) {
    return { proposals: [] };
  }

  const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);

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
    .map((m) => `- ${m.name}: ${stripFqnPrefixes(m.sql)}${m.instructions ? ` — ${m.instructions}` : ""}`)
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
  const joinBlock = joinSpecs.length > 0
    ? joinSpecs.map((j) =>
        `- ${j.leftTable} → ${j.rightTable} ON ${j.sql} (${j.relationshipType})`
      ).join("\n")
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

${YAML_SPEC_REFERENCE}

---

## Your Task

Create 1-3 metric view proposals for the "${domain}" domain. Each proposal MUST:

1. Follow the YAML v1.1 spec exactly (version, source, dimensions, measures)
2. Use a central fact table as the source
${joinSpecs.length > 0 ? "3. When joins are available, create star-schema metric views using the joins: block to pull dimensions from dimension tables" : "3. Define meaningful dimensions from the source table columns"}
4. Include time-based dimensions using DATE_TRUNC for any date/timestamp columns
5. Include a mix of measure types:
   - Basic aggregates (SUM, COUNT, AVG)
   - FILTER clause measures for status/category breakdowns, e.g. \`SUM(amount) FILTER (WHERE status = 'OPEN')\`
   - Ratio measures that safely re-aggregate, e.g. \`SUM(revenue) / COUNT(DISTINCT customer_id)\`
   - COUNT DISTINCT measures for cardinality metrics
6. Use descriptive dimension/measure \`name\` values informed by the column descriptions provided
${suggestMaterialization ? `7. For the most complex proposal, include a materialization: block (schedule: every 6 hours, mode: relaxed) with at least one aggregated materialized view` : ""}

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
${useCases.slice(0, 5).map((uc) => `- ${uc.name}: ${uc.statement}`).join("\n")}

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
      responseFormat: "json_object",
      signal,
    });

    const content = result.content ?? "";
    const parsed = parseLLMJson(content) as Record<string, unknown>;
    const items: Record<string, unknown>[] = Array.isArray(parsed.proposals)
      ? parsed.proposals
      : Array.isArray(parsed) ? parsed : [];

    const proposals: MetricViewProposal[] = items
      .map((p) => {
        const yamlStr = String(p.yaml ?? "");
        let ddlStr = String(p.ddl ?? "");

        // Safety net: strip FQN column prefixes from YAML expr/on lines in the DDL.
        // Preserve CREATE VIEW and source: lines (those need FQN).
        ddlStr = ddlStr.replace(
          /^(\s*(?:expr|on):\s*)(.+)$/gm,
          (_match, prefix: string, rest: string) => prefix + stripFqnPrefixes(rest)
        );

        const validation = validateMetricViewYaml(yamlStr, ddlStr, allowlist);
        const features = detectFeatures(yamlStr);

        return {
          name: String(p.name ?? ""),
          description: String(p.description ?? ""),
          yaml: yamlStr,
          ddl: ddlStr,
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

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
import { cachedChatCompletion } from "@/lib/toolkit/llm-cache";
import { executeSQL } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";
import { parseLLMJson } from "@/lib/toolkit/parse-llm-json";
import { reviewAndFixSql } from "@/lib/ai/sql-reviewer";
import { isReviewEnabled } from "@/lib/dbx/client";
import { resolveForGeniePass, formatSystemOverlay } from "@/lib/skills";
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

// ---------------------------------------------------------------------------
// Snowflake join nesting auto-fix
// ---------------------------------------------------------------------------

interface ParsedJoin {
  name: string;
  source: string;
  on: string;
  children: ParsedJoin[];
  extraLines: string[];
}

/**
 * Parse a flat YAML joins block into structured join objects.
 * Handles `name:`, `source:`, `on:`, and any extra fields (type, etc.).
 */
function parseJoinsBlock(joinsText: string): ParsedJoin[] {
  const joins: ParsedJoin[] = [];
  const lines = joinsText.split("\n");
  let current: Partial<ParsedJoin> | null = null;

  for (const line of lines) {
    const itemMatch = line.match(/^(\s*)-\s*name:\s*(\w+)/);
    if (itemMatch) {
      if (current?.name) {
        joins.push({
          name: current.name,
          source: current.source ?? "",
          on: current.on ?? "",
          children: [],
          extraLines: current.extraLines ?? [],
        });
      }
      current = { name: itemMatch[2], extraLines: [] };
      continue;
    }

    if (!current) continue;

    const sourceMatch = line.match(/^\s*source:\s*(.+)/);
    if (sourceMatch) {
      current.source = sourceMatch[1].trim();
      continue;
    }

    const onMatch = line.match(/^\s*on:\s*(.+)/);
    if (onMatch) {
      current.on = onMatch[1].trim();
      continue;
    }

    if (/^\s*joins:\s*(?:#.*)?$/.test(line)) continue;

    if (line.trim()) {
      current.extraLines = current.extraLines ?? [];
      current.extraLines.push(line);
    }
  }

  if (current?.name) {
    joins.push({
      name: current.name,
      source: current.source ?? "",
      on: current.on ?? "",
      children: [],
      extraLines: current.extraLines ?? [],
    });
  }

  return joins;
}

/**
 * Determine the left-side alias referenced in an `on:` clause.
 * E.g. `source.member_id = member.member_id` → "source"
 *       `member.location_id = location.location_id` → "member"
 */
function getOnLeftAlias(onExpr: string): string {
  const match = onExpr.match(/^\s*(\w+)\./);
  return match ? match[1].toLowerCase() : "source";
}

/**
 * Serialize a join tree back to YAML text with proper indentation.
 */
function serializeJoins(joins: ParsedJoin[], indent: number): string {
  const pad = " ".repeat(indent);
  const lines: string[] = [];

  for (const j of joins) {
    lines.push(`${pad}- name: ${j.name}`);
    lines.push(`${pad}  source: ${j.source}`);
    lines.push(`${pad}  on: ${j.on}`);
    for (const extra of j.extraLines) {
      const trimmed = extra.replace(/^\s+/, "");
      lines.push(`${pad}  ${trimmed}`);
    }
    if (j.children.length > 0) {
      lines.push(`${pad}  joins:`);
      lines.push(serializeJoins(j.children, indent + 4));
    }
  }

  return lines.join("\n");
}

/**
 * Restructure flat top-level joins into nested joins for snowflake schemas.
 *
 * When a join's `on:` clause references another join alias (not `source`),
 * move it as a child of the referenced join. This converts:
 *
 *   joins:
 *     - name: member    on: source.member_id = member.member_id
 *     - name: location  on: member.location_id = location.location_id
 *
 * Into:
 *
 *   joins:
 *     - name: member    on: source.member_id = member.member_id
 *       joins:
 *         - name: location  on: member.location_id = location.location_id
 *
 * Operates on YAML text (the body between $$) or on DDL containing the YAML.
 */
export function nestSnowflakeJoins(text: string): string {
  const lines = text.split("\n");

  // Find the first top-level `joins:` line (not a nested `joins:` inside a join)
  let joinsLineIdx = -1;
  let joinsIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)joins:\s*$/);
    if (m) {
      joinsLineIdx = i;
      joinsIndent = m[1].length;
      break;
    }
  }
  if (joinsLineIdx === -1) return text;

  // Collect all lines belonging to this joins block (indented more than joins:)
  const blockStart = joinsLineIdx + 1;
  let blockEnd = blockStart;
  while (blockEnd < lines.length) {
    const line = lines[blockEnd];
    if (line.trim() === "") {
      blockEnd++;
      continue;
    }
    const lineIndent = line.search(/\S/);
    if (lineIndent <= joinsIndent) break;
    blockEnd++;
  }

  const joinsRawBlock = lines.slice(blockStart, blockEnd).join("\n");
  const joins = parseJoinsBlock(joinsRawBlock);
  if (joins.length <= 1) return text;

  // Build a name->join index for reparenting
  const joinByName = new Map<string, ParsedJoin>();
  for (const j of joins) {
    joinByName.set(j.name.toLowerCase(), j);
  }

  // Determine which joins are top-level (reference `source`) and which
  // must be nested (reference another join alias)
  const topLevel: ParsedJoin[] = [];
  const toNest: ParsedJoin[] = [];

  for (const j of joins) {
    const leftAlias = getOnLeftAlias(j.on);
    if (leftAlias === "source" || !joinByName.has(leftAlias)) {
      topLevel.push(j);
    } else {
      toNest.push(j);
    }
  }

  // Nothing to nest — all joins already reference source
  if (toNest.length === 0) return text;

  // Attach each nested join to its parent (supports multi-level chains)
  for (const j of toNest) {
    const parentAlias = getOnLeftAlias(j.on);
    const parent = joinByName.get(parentAlias);
    if (parent) {
      parent.children.push(j);
    } else {
      topLevel.push(j);
    }
  }

  // Rebuild the joins block with nesting
  const newJoinsLines = [
    " ".repeat(joinsIndent) + "joins:",
    serializeJoins(topLevel, joinsIndent + 2),
  ];

  // Reconstruct the full text
  const before = lines.slice(0, joinsLineIdx);
  const after = lines.slice(blockEnd);
  return [...before, ...newJoinsLines, ...after].join("\n");
}

// ---------------------------------------------------------------------------
// Qualify nested alias references with parent-chain prefixes
// ---------------------------------------------------------------------------

/**
 * Build a map of nested join alias → parent-chain prefix from the join tree.
 * E.g. if `investment_option` is nested under `account`, produces:
 *   { "investment_option" → "account.investment_option" }
 * For multi-level: `city` under `location` under `member` →
 *   { "location" → "member.location", "city" → "member.location.city" }
 * Top-level joins (direct children of `source`) are NOT included.
 */
function buildParentChainMap(text: string): Map<string, string> {
  const chainMap = new Map<string, string>();

  const lines = text.split("\n");
  let joinsLineIdx = -1;
  let joinsIndent = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)joins:\s*$/);
    if (m) {
      joinsLineIdx = i;
      joinsIndent = m[1].length;
      break;
    }
  }
  if (joinsLineIdx === -1) return chainMap;

  let blockEnd = joinsLineIdx + 1;
  while (blockEnd < lines.length) {
    const line = lines[blockEnd];
    if (line.trim() === "") {
      blockEnd++;
      continue;
    }
    const lineIndent = line.search(/\S/);
    if (lineIndent <= joinsIndent) break;
    blockEnd++;
  }

  const joinsRawBlock = lines.slice(joinsLineIdx + 1, blockEnd).join("\n");
  const joins = parseJoinsBlock(joinsRawBlock);
  if (joins.length <= 1) return chainMap;

  const joinByName = new Map<string, ParsedJoin>();
  for (const j of joins) {
    joinByName.set(j.name.toLowerCase(), j);
  }

  const topLevel: ParsedJoin[] = [];
  const toNest: ParsedJoin[] = [];

  for (const j of joins) {
    const leftAlias = getOnLeftAlias(j.on);
    if (leftAlias === "source" || !joinByName.has(leftAlias)) {
      topLevel.push(j);
    } else {
      toNest.push(j);
    }
  }

  for (const j of toNest) {
    const parentAlias = getOnLeftAlias(j.on);
    const parent = joinByName.get(parentAlias);
    if (parent) {
      parent.children.push(j);
    }
  }

  function walk(joins: ParsedJoin[], prefix: string): void {
    for (const j of joins) {
      if (j.children.length > 0) {
        for (const child of j.children) {
          const chain = prefix ? `${prefix}.${j.name}.${child.name}` : `${j.name}.${child.name}`;
          chainMap.set(child.name.toLowerCase(), chain);
          walk([child], prefix ? `${prefix}.${j.name}` : j.name);
        }
      }
    }
  }

  walk(topLevel, "");
  return chainMap;
}

/**
 * Rewrite nested join alias references in `expr:` and `filter:` fields to use
 * parent-chain syntax as required by Databricks metric view YAML v1.1.
 *
 * Databricks requires nested join column references to traverse the parent
 * chain: `account.investment_option.col` instead of `investment_option.col`.
 * The `on:` clauses are NOT rewritten — they correctly reference the immediate
 * parent per the Databricks spec.
 */
export function qualifyNestedAliasRefs(text: string): string {
  const chainMap = buildParentChainMap(text);
  if (chainMap.size === 0) return text;

  return text.replace(
    /^(\s*(?:expr|filter):\s*)(.+)$/gm,
    (_match, prefix: string, rest: string) => {
      let result = rest;
      for (const [alias, chain] of chainMap) {
        // Replace `alias.column` with `chain.column`, avoiding already-qualified refs.
        // Use word-boundary matching and negative lookbehind for dot (already part of chain).
        const pattern = new RegExp(
          `(?<![.\\w])${escapeRegExp(alias)}\\.(?!${escapeRegExp(alias)}\\.)`,
          "gi",
        );
        result = result.replace(pattern, `${chain}.`);
      }
      return prefix + result;
    },
  );
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toSnakeCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Build the DDL wrapper around a metric view YAML body.
 * The DDL is deterministic -- no need for the LLM to produce it.
 */
export function buildMetricViewDdl(scope: string, viewName: string, yamlBody: string): string {
  const snakeName = toSnakeCase(viewName);
  const [catalog, schema] = scope.split(".");
  return `CREATE OR REPLACE VIEW \`${catalog}\`.\`${schema}\`.\`${snakeName}\`\nWITH METRICS\nLANGUAGE YAML\nAS $$\n${yamlBody}\n$$`;
}

// ---------------------------------------------------------------------------
// Hierarchical join context builder
// ---------------------------------------------------------------------------

/**
 * Present join specs hierarchically so the LLM understands snowflake nesting.
 * Joins whose leftTable is in `factTables` are top-level; others are indented
 * under the join they depend on.
 */
function buildHierarchicalJoinBlock(joinSpecs: JoinSpecInput[], factTables: string[]): string {
  if (joinSpecs.length === 0) return "";

  const factSet = new Set(factTables.map((t) => t.toLowerCase()));

  // Partition: direct joins (left side is a fact/source table) vs transitive
  const directJoins: JoinSpecInput[] = [];
  const transitiveJoins: JoinSpecInput[] = [];

  for (const j of joinSpecs) {
    if (factSet.has(j.leftTable.toLowerCase())) {
      directJoins.push(j);
    } else {
      transitiveJoins.push(j);
    }
  }

  // Index transitive joins by their leftTable (the parent dim they depend on)
  const childrenByParent = new Map<string, JoinSpecInput[]>();
  for (const j of transitiveJoins) {
    const key = j.leftTable.toLowerCase();
    const list = childrenByParent.get(key) ?? [];
    list.push(j);
    childrenByParent.set(key, list);
  }

  const lines: string[] = [];

  for (const j of directJoins) {
    lines.push(`- source → ${j.rightTable} ON ${j.sql} (${j.relationshipType})`);
    // Append any transitive children indented under this join
    const children = childrenByParent.get(j.rightTable.toLowerCase());
    if (children) {
      for (const c of children) {
        lines.push(
          `  - ${c.leftTable} → ${c.rightTable} ON ${c.sql} (${c.relationshipType}) [MUST NEST under ${c.leftTable}]`,
        );
      }
    }
  }

  // Any remaining transitive joins whose parent isn't a direct join
  for (const j of transitiveJoins) {
    const parentIsDirect = directJoins.some(
      (d) => d.rightTable.toLowerCase() === j.leftTable.toLowerCase(),
    );
    if (!parentIsDirect) {
      lines.push(
        `- ${j.leftTable} → ${j.rightTable} ON ${j.sql} (${j.relationshipType}) [TRANSITIVE — nest under parent join]`,
      );
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

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

Measures are queried via MEASURE(\`name\`) and re-aggregate safely at any granularity.

### YAML fields:
- version: "1.1" (required)
- source: catalog.schema.table (required, primary fact table)
- filter: SQL boolean (optional, global WHERE)
- dimensions: list (required)
  - name: snake_case identifier (e.g. order_month) | expr: SQL expression | display_name: label | synonyms: list
- measures: list (required)
  - name: snake_case identifier (e.g. total_revenue) | expr: aggregate (SUM, COUNT, AVG, MIN, MAX) | display_name: label | synonyms: list
- joins: list (optional, star/snowflake)
  - name: alias | source: catalog.schema.dim_table | on: \`source.col = alias.col\` (MUST qualify BOTH sides)
  - joins: nested list for snowflake schemas

### Join rules:
- Top-level joins ONLY reference \`source.\` in \`on:\`. If a join references another alias, NEST it under that parent join.
- Nested join column refs use parent-chain: \`customer.nation.n_name\` NOT \`nation.n_name\`
- Join alias MUST NOT match a source column name (use \`_dim\` suffix if needed)
- Dimension name MUST NOT match a join alias (use \`_name\` suffix)

### Measure rules:
- Patterns: \`SUM(amount)\`, \`COUNT(DISTINCT id)\`, \`SUM(amt) FILTER (WHERE status = 'OPEN')\`, \`SUM(revenue) / COUNT(DISTINCT cust_id)\`
- Measure name MUST NOT match a source column name (causes NESTED_AGGREGATE_FUNCTION)
- No OVER() / window functions. No MEDIAN() (use PERCENTILE_APPROX). No AI functions.
- Backtick-quote column names with spaces: \`\\\`Defaulted Loans\\\`\`
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

  const sourceMatch = yaml.match(/^\s*source:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/m);
  if (!sourceMatch) return issues;
  const sourceFqn = sourceMatch[1];

  const aliasToTable = new Map<string, string>();
  aliasToTable.set("source", sourceFqn);

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

  const fieldPattern = /\b(?:expr|on):\s*(.+)/g;
  const expressions: string[] = [];
  let fm: RegExpExecArray | null;
  while ((fm = fieldPattern.exec(yaml)) !== null) {
    expressions.push(fm[1]);
  }

  const reported = new Set<string>();
  const SKIP_ALIASES = new Set(["version", "catalog", "schema", "language", "yaml"]);

  // Match dotted identifier chains (2+ segments) — handles parent-chain
  // nested join syntax like member.employer_dim.industry and deeper chains
  // like customer.nation.region.r_name.
  const unquotedChainRe = /\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)+)\b/g;
  const quotedChainRe = /\b([a-zA-Z_]\w*(?:\.[a-zA-Z_]\w*)*)\.`([^`]+)`/g;

  function validateChain(segments: string[], display: string): void {
    if (segments.length < 2) return;
    const rootAlias = segments[0];
    if (SKIP_ALIASES.has(rootAlias.toLowerCase())) return;

    const rootTable = aliasToTable.get(rootAlias.toLowerCase());
    if (!rootTable) {
      if (!reported.has(display)) {
        reported.add(display);
        issues.push(
          `Unknown alias \`${rootAlias}\` in \`${display}\` — only \`source\` and declared join names are valid`,
        );
      }
      return;
    }

    let currentAlias = rootAlias.toLowerCase();
    for (let i = 1; i < segments.length - 1; i++) {
      const seg = segments[i].toLowerCase();
      if (aliasToTable.has(seg)) {
        currentAlias = seg;
      } else {
        return;
      }
    }

    const column = segments[segments.length - 1];
    const tableFqn = aliasToTable.get(currentAlias);
    if (!tableFqn) return;

    if (!isValidColumn(allowlist, tableFqn, column)) {
      if (!reported.has(display)) {
        reported.add(display);
        issues.push(`Column \`${display}\` not found in table ${tableFqn}`);
      }
    }
  }

  for (const expr of expressions) {
    let cm: RegExpExecArray | null;

    while ((cm = quotedChainRe.exec(expr)) !== null) {
      const prefix = cm[1];
      const quotedCol = cm[2];
      const segments = [...prefix.split("."), quotedCol];
      const display = `${prefix}.\`${quotedCol}\``;
      reported.add(prefix);
      validateChain(segments, display);
    }

    while ((cm = unquotedChainRe.exec(expr)) !== null) {
      const chain = cm[1];
      if (reported.has(chain)) continue;
      const segments = chain.split(".");
      validateChain(segments, chain);
    }
  }

  return issues;
}

/**
 * Detect top-level joins whose `on:` clause references a sibling join alias
 * instead of `source`. This indicates a snowflake pattern that requires nesting.
 */
export function detectFlatSnowflakeJoins(yaml: string): string[] {
  const issues: string[] = [];

  // Only inspect top-level joins (indented exactly one level under `joins:`)
  const topJoinsSectionMatch = yaml.match(
    /^(\s*)joins:\s*\n((?:\s+-\s*name:.*\n(?:\s+\w+:.*\n?)*)*)/m,
  );
  if (!topJoinsSectionMatch) return issues;

  const baseIndent = topJoinsSectionMatch[1].length;
  const joinsBlock = topJoinsSectionMatch[2];

  // Parse top-level join names and their on: clauses
  const joinNames = new Set<string>();
  const entries: { name: string; on: string }[] = [];

  const lines = joinsBlock.split("\n");
  let currentName = "";
  let currentOn = "";
  let insideNested = false;

  for (const line of lines) {
    const nameMatch = line.match(/^(\s*)-\s*name:\s*(\w+)/);
    if (nameMatch) {
      const indent = nameMatch[1].length;
      // Only capture top-level joins (indented by baseIndent + 2)
      if (indent <= baseIndent + 4) {
        if (currentName) {
          entries.push({ name: currentName, on: currentOn });
        }
        currentName = nameMatch[2];
        currentOn = "";
        joinNames.add(currentName.toLowerCase());
        insideNested = false;
      } else {
        insideNested = true;
      }
      continue;
    }

    if (insideNested) continue;

    const onMatch = line.match(/^\s*on:\s*(.+)/);
    if (onMatch && currentName) {
      currentOn = onMatch[1].trim();
    }
  }
  if (currentName) {
    entries.push({ name: currentName, on: currentOn });
  }

  // Check if any top-level join's `on:` references a sibling alias
  for (const entry of entries) {
    if (!entry.on) continue;
    const leftAlias = entry.on.match(/^\s*(\w+)\./)?.[1]?.toLowerCase();
    if (leftAlias && leftAlias !== "source" && joinNames.has(leftAlias)) {
      issues.push(
        `Join \`${entry.name}\` references alias \`${leftAlias}\` in its \`on:\` clause but is defined as a top-level sibling — it must be nested under the \`${leftAlias}\` join (snowflake schema pattern)`,
      );
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

  // Detect dimension names that shadow join alias names — the dimension
  // takes priority and Databricks treats `alias.col` as struct field
  // extraction on the scalar dimension, causing INVALID_EXTRACT_BASE_FIELD_TYPE.
  {
    const joinsIdx = yaml.indexOf("joins:");
    if (joinsIdx !== -1) {
      const joinAliasNames = new Set<string>();
      const jnRe = /^\s*-\s*name:\s*(\w+)/gm;
      const jBlockEnd = Math.min(
        ...[yaml.indexOf("dimensions:", joinsIdx), yaml.indexOf("measures:", joinsIdx)].filter(
          (i) => i > joinsIdx,
        ),
      );
      const jBlock =
        Number.isFinite(jBlockEnd) && jBlockEnd > joinsIdx
          ? yaml.slice(joinsIdx, jBlockEnd)
          : yaml.slice(joinsIdx);
      let jnm: RegExpExecArray | null;
      while ((jnm = jnRe.exec(jBlock)) !== null) {
        joinAliasNames.add(jnm[1].toLowerCase());
      }

      const dimsIdx = yaml.indexOf("dimensions:");
      if (dimsIdx !== -1) {
        const dEnd = yaml.indexOf("measures:", dimsIdx);
        const dBlock = dEnd > dimsIdx ? yaml.slice(dimsIdx, dEnd) : yaml.slice(dimsIdx, joinsIdx);
        const dimNameRe = /^\s*-\s*name:\s*(\w+)/gm;
        let dnm: RegExpExecArray | null;
        while ((dnm = dimNameRe.exec(dBlock)) !== null) {
          const dName = dnm[1];
          if (joinAliasNames.has(dName.toLowerCase())) {
            issues.push(
              `Dimension name "${dName}" shadows join alias "${dName}" — Databricks resolves alias.column as struct extraction on the dimension scalar, causing INVALID_EXTRACT_BASE_FIELD_TYPE. Rename the dimension (e.g. "${toSnakeCase(dName)}_name").`,
            );
          }
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

  // SQL ref spec: measure expr must contain an aggregate function (except for
  // MEASURE() composability references which are derived measures)
  const aggFnPattern = new RegExp(`\\b(${AGG_FNS}|MEASURE)\\s*\\(`, "i");
  for (const exprLine of measureExprs) {
    const exprValue = exprLine.replace(/^\s*expr:\s*/, "").trim();
    if (exprValue && !aggFnPattern.test(exprValue)) {
      issues.push(
        `Measure expr must contain an aggregate function (SUM, COUNT, AVG, etc.) or MEASURE() reference: ${exprLine.trim()}`,
      );
    }
  }

  // SQL ref spec: measure expr must not contain prohibited SQL clauses
  const PROHIBITED_MEASURE_PATTERNS = [
    { re: /\bJOIN\b/i, label: "JOIN" },
    { re: /\bGROUP\s+BY\b/i, label: "GROUP BY" },
    { re: /\bHAVING\b/i, label: "HAVING" },
    { re: /\bQUALIFY\b/i, label: "QUALIFY" },
    { re: /\bORDER\s+BY\b/i, label: "ORDER BY" },
    { re: /\bLIMIT\b/i, label: "LIMIT" },
  ];
  for (const exprLine of measureExprs) {
    for (const { re, label } of PROHIBITED_MEASURE_PATTERNS) {
      if (re.test(exprLine)) {
        issues.push(`Measure expr must not contain ${label}: ${exprLine.trim()}`);
      }
    }
  }

  // SQL ref spec: dimension expr must not contain aggregate functions
  const dimsIdx2 = yaml.indexOf("dimensions:");
  const dimsEnd2 = yaml.indexOf("measures:");
  if (dimsIdx2 !== -1) {
    const dimBlock2 = dimsEnd2 > dimsIdx2 ? yaml.slice(dimsIdx2, dimsEnd2) : yaml.slice(dimsIdx2);
    const dimExprs = dimBlock2.match(/expr:\s*.+/g) ?? [];
    const aggOnlyPattern = new RegExp(`\\b(${AGG_FNS})\\s*\\(`, "i");
    for (const exprLine of dimExprs) {
      const exprValue = exprLine.replace(/^\s*expr:\s*/, "").trim();
      if (aggOnlyPattern.test(exprValue)) {
        issues.push(
          `Dimension expr must not contain aggregate functions (those belong in measures): ${exprLine.trim()}`,
        );
      }
    }
  }

  // SQL ref spec: validate format: values on measures
  const formatMatches = yaml.matchAll(/format:\s*["']?([^"'\n]+)["']?/g);
  const VALID_FORMATS = new Set(["percent", "currency", "number"]);
  for (const fm of formatMatches) {
    const fmt = fm[1].trim().toLowerCase();
    if (!VALID_FORMATS.has(fmt) && !/^decimal\(\d+\)$/.test(fmt)) {
      issues.push(
        `Invalid format: "${fm[1].trim()}" — must be one of: percent, currency, number, decimal(N)`,
      );
    }
  }

  // SQL ref spec: version must be string "1.1"
  const versionMatch = yaml.match(/version:\s*(.+)/);
  if (versionMatch) {
    const vVal = versionMatch[1].trim().replace(/^["']|["']$/g, "");
    if (vVal !== "1.1") {
      issues.push(`version must be "1.1", found "${vVal}"`);
    }
  }

  // SQL ref spec: source must be three-part FQN
  if (sourceMatch) {
    const parts = sourceMatch[1].split(".");
    if (parts.length !== 3) {
      issues.push(
        `source must be a fully qualified three-part name (catalog.schema.table), found "${sourceMatch[1]}"`,
      );
    }
  }

  // Detect flat joins that reference sibling join aliases (snowflake nesting issue).
  // Top-level joins must only reference `source` in their `on:` clause.
  issues.push(...detectFlatSnowflakeJoins(yaml));

  // Validate alias.column references (e.g. source.amount, supplier.name)
  // against actual table schemas in the allowlist
  issues.push(...validateColumnReferences(yaml, allowlist));

  // Validate materialization block references declared dimension/measure names
  {
    const matIdx = yaml.indexOf("materialization:");
    if (matIdx !== -1) {
      const declaredDims = new Set<string>();
      const declaredMeasures = new Set<string>();

      const dimsIdx = yaml.indexOf("dimensions:");
      const measIdx = yaml.indexOf("measures:");

      if (dimsIdx !== -1) {
        const dEnd = measIdx > dimsIdx ? measIdx : matIdx;
        const dBlock = yaml.slice(dimsIdx, dEnd);
        const dnRe = /^\s*-\s*name:\s*(\w+)/gm;
        let dnm: RegExpExecArray | null;
        while ((dnm = dnRe.exec(dBlock)) !== null) declaredDims.add(dnm[1].toLowerCase());
      }
      if (measIdx !== -1) {
        const mEnd = matIdx > measIdx ? matIdx : yaml.indexOf("joins:", measIdx);
        const mBlock = yaml.slice(measIdx, mEnd > measIdx ? mEnd : undefined);
        const mnRe = /^\s*-\s*name:\s*(\w+)/gm;
        let mnm: RegExpExecArray | null;
        while ((mnm = mnRe.exec(mBlock)) !== null) declaredMeasures.add(mnm[1].toLowerCase());
      }

      const matBlock = yaml.slice(matIdx);
      const matListRe = /\b(dimensions|measures):\s*\[([^\]]*)\]/g;
      let mlm: RegExpExecArray | null;
      while ((mlm = matListRe.exec(matBlock)) !== null) {
        const kind = mlm[1];
        const declared = kind === "dimensions" ? declaredDims : declaredMeasures;
        const items = mlm[2]
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter(Boolean);
        for (const item of items) {
          if (!declared.has(item.toLowerCase())) {
            issues.push(
              `Materialization references undeclared ${kind.slice(0, -1)} "${item}" — only declared ${kind} names are valid in materialized_views.`,
            );
          }
        }
      }
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

  const hasCritical = issues.some(
    (i) =>
      i.startsWith("Missing required") ||
      i.includes("not found in schema") ||
      i.includes("not found in table") ||
      i.includes("Unknown alias") ||
      i.includes("Window function") ||
      i.includes("AI function") ||
      i.includes("shadows source column") ||
      i.includes("shadows join alias") ||
      i.includes("Nested aggregate"),
  );

  return {
    status: issues.length === 0 ? "valid" : hasCritical ? "error" : "warning",
    issues,
  };
}

// ---------------------------------------------------------------------------
// Dry-run: validate DDL via temp view to avoid leaving artifacts
// ---------------------------------------------------------------------------

const PERMISSION_PATTERNS = [
  "PERMISSION_DENIED",
  "does not have CREATE",
  "Access denied",
  "INSUFFICIENT_PRIVILEGES",
];

const VIEW_FQN_RE =
  /(?:CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+)(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i;

/**
 * Validate metric view DDL by creating a temporary view and immediately
 * dropping it. Returns the error message if validation fails, or null on
 * success. The temp view uses a `__<prefix>validate_` prefix so it is
 * distinguishable from real views and is always cleaned up in a finally block.
 */
const DRY_RUN_TIMEOUT: { waitTimeout: string; submitTimeoutMs: number } = {
  waitTimeout: "30s",
  submitTimeoutMs: 35_000,
};

export async function dryRunMetricViewDdl(
  ddl: string,
  resourcePrefix?: string,
): Promise<string | null> {
  const fqnMatch = ddl.match(VIEW_FQN_RE);
  if (!fqnMatch) return "Could not extract view FQN from DDL";

  const originalFqn = fqnMatch[1].replace(/`/g, "");
  const parts = originalFqn.split(".");
  const pfx = resourcePrefix || "forge_";
  const tempName = `__${pfx}validate_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const tempFqn = `${parts[0]}.${parts[1]}.${tempName}`;
  const tempDdl = ddl.replace(VIEW_FQN_RE, (match) =>
    match.replace(fqnMatch[1], `\`${parts[0]}\`.\`${parts[1]}\`.\`${tempName}\``),
  );

  try {
    await executeSQL(tempDdl, undefined, undefined, DRY_RUN_TIMEOUT);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    try {
      await executeSQL(
        `DROP VIEW IF EXISTS \`${parts[0]}\`.\`${parts[1]}\`.\`${tempName}\``,
        undefined,
        undefined,
        DRY_RUN_TIMEOUT,
      );
    } catch {
      logger.warn("Failed to drop temp validation view", { tempFqn });
    }
  }
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
// Auto-rename: fix join aliases that collide with source table column names
// ---------------------------------------------------------------------------

/**
 * Detect join aliases that collide with source table column names and rename
 * them to `{alias}_dim`. When a join alias matches a source column name,
 * Databricks treats `alias.col` as a struct field extraction on the source
 * column instead of a join-alias reference, causing INVALID_EXTRACT_BASE_FIELD_TYPE.
 */
export function autoRenameCollidingJoinAliases(
  yaml: string,
  ddl: string,
  allowlist: SchemaAllowlist,
): { yaml: string; ddl: string; renamed: number } {
  const sourceMatch = yaml.match(/^\s*source:\s*([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)/m);
  if (!sourceMatch) return { yaml, ddl, renamed: 0 };

  const sourceCols = allowlist.columns.get(sourceMatch[1].toLowerCase());
  if (!sourceCols || sourceCols.size === 0) return { yaml, ddl, renamed: 0 };

  // Extract join alias names from the YAML
  const joinNamePattern = /^\s*-\s*name:\s*(\w+)/gm;
  const aliasRenames = new Map<string, string>();
  let nm: RegExpExecArray | null;

  const joinsIdx = yaml.indexOf("joins:");
  if (joinsIdx === -1) return { yaml, ddl, renamed: 0 };
  const joinsSection = yaml.slice(joinsIdx);

  while ((nm = joinNamePattern.exec(joinsSection)) !== null) {
    const alias = nm[1];
    if (sourceCols.has(alias.toLowerCase()) && !aliasRenames.has(alias)) {
      aliasRenames.set(alias, `${alias}_dim`);
    }
  }

  if (aliasRenames.size === 0) return { yaml, ddl, renamed: 0 };

  let modYaml = yaml;
  let modDdl = ddl;

  for (const [oldAlias, newAlias] of aliasRenames) {
    const escaped = escapeRegExp(oldAlias);
    // Rename in `- name:` declarations
    const namePattern = new RegExp(`(-\\s*name:\\s*)${escaped}(\\s*(?:\\n|$))`, "gm");
    modYaml = modYaml.replace(namePattern, `$1${newAlias}$2`);
    modDdl = modDdl.replace(namePattern, `$1${newAlias}$2`);
    // Rename in `on:` clauses (both sides) and `expr:` / `filter:` fields
    const refPattern = new RegExp(`\\b${escaped}\\b(?=\\.)`, "g");
    modYaml = modYaml.replace(refPattern, newAlias);
    modDdl = modDdl.replace(refPattern, newAlias);
  }

  return { yaml: modYaml, ddl: modDdl, renamed: aliasRenames.size };
}

// ---------------------------------------------------------------------------
// Auto-rename: fix dimension names that shadow join aliases
// ---------------------------------------------------------------------------

/**
 * Detect dimension names that collide with join alias names and rename
 * them using the rightmost column from their `expr`. When a dimension
 * name matches a join alias, Databricks resolves `alias.col` against the
 * dimension (a scalar) instead of the join, causing
 * INVALID_EXTRACT_BASE_FIELD_TYPE.
 */
export function autoRenameShadowedDimensions(
  yaml: string,
  ddl: string,
): { yaml: string; ddl: string; renamed: number } {
  const joinsIdx = yaml.indexOf("joins:");
  if (joinsIdx === -1) return { yaml, ddl, renamed: 0 };

  const joinAliases = new Set<string>();
  const joinNameRe = /^\s*-\s*name:\s*(\w+)/gm;
  const joinsEnd = Math.min(
    ...[yaml.indexOf("dimensions:", joinsIdx), yaml.indexOf("measures:", joinsIdx)].filter(
      (i) => i > joinsIdx,
    ),
  );
  const joinsSection =
    Number.isFinite(joinsEnd) && joinsEnd > joinsIdx
      ? yaml.slice(joinsIdx, joinsEnd)
      : yaml.slice(joinsIdx);
  let jm: RegExpExecArray | null;
  while ((jm = joinNameRe.exec(joinsSection)) !== null) {
    joinAliases.add(jm[1].toLowerCase());
  }
  if (joinAliases.size === 0) return { yaml, ddl, renamed: 0 };

  const dimsIdx = yaml.indexOf("dimensions:");
  if (dimsIdx === -1) return { yaml, ddl, renamed: 0 };
  const measuresIdx = yaml.indexOf("measures:");
  const dimsBlock =
    measuresIdx > dimsIdx ? yaml.slice(dimsIdx, measuresIdx) : yaml.slice(dimsIdx, joinsIdx);

  const dimEntryRe = /-\s*name:\s*(\w+)\s*\n\s*expr:\s*(.+)/g;
  const renames = new Map<string, string>();
  const existingDimNames = new Set<string>();

  const allDimNamesRe = /^\s*-\s*name:\s*(\w+)/gm;
  let dn: RegExpExecArray | null;
  while ((dn = allDimNamesRe.exec(dimsBlock)) !== null) {
    existingDimNames.add(dn[1].toLowerCase());
  }

  let dm: RegExpExecArray | null;
  while ((dm = dimEntryRe.exec(dimsBlock)) !== null) {
    const dimName = dm[1];
    if (!joinAliases.has(dimName.toLowerCase())) continue;

    const expr = dm[2].trim().replace(/^["']|["']$/g, "");
    const dotParts = expr.split(".");
    let candidate = dotParts[dotParts.length - 1].replace(/`/g, "").replace(/\W/g, "_");
    candidate = toSnakeCase(candidate);

    if (existingDimNames.has(candidate.toLowerCase()) || joinAliases.has(candidate.toLowerCase())) {
      candidate = `${candidate}_val`;
    }

    renames.set(dimName, candidate);
    existingDimNames.add(candidate.toLowerCase());
  }

  if (renames.size === 0) return { yaml, ddl, renamed: 0 };

  let modYaml = yaml;
  let modDdl = ddl;

  for (const [oldName, newName] of renames) {
    const escaped = escapeRegExp(oldName);
    const pattern = new RegExp(`(-\\s*name:\\s*)${escaped}(\\s*(?:\\n|$))`, "g");
    modYaml = applyInDimensionsBlock(modYaml, pattern, `$1${newName}$2`);
    modDdl = applyInDimensionsBlock(modDdl, pattern, `$1${newName}$2`);
  }

  return { yaml: modYaml, ddl: modDdl, renamed: renames.size };
}

function applyInDimensionsBlock(text: string, pattern: RegExp, replacement: string): string {
  const idx = text.indexOf("dimensions:");
  if (idx === -1) return text;
  const measIdx = text.indexOf("measures:", idx);
  if (measIdx === -1) {
    return text.slice(0, idx) + text.slice(idx).replace(pattern, replacement);
  }
  return (
    text.slice(0, idx) +
    text.slice(idx, measIdx).replace(pattern, replacement) +
    text.slice(measIdx)
  );
}

// ---------------------------------------------------------------------------
// Auto-fix: materialization refs that use join aliases instead of dim/measure names
// ---------------------------------------------------------------------------

/**
 * Fix materialization blocks that reference join aliases, column names, or
 * other invalid identifiers instead of declared dimension/measure `name` values.
 * Attempts to map each invalid ref to the correct declared name by checking
 * if a dimension's `expr` starts with `{ref}.` (join-alias-to-dimension mapping).
 * Unresolvable refs are removed from the list.
 */
export function autoFixMaterializationRefs(
  yaml: string,
  ddl: string,
): { yaml: string; ddl: string; fixed: number } {
  const matIdx = yaml.indexOf("materialization:");
  if (matIdx === -1) return { yaml, ddl, fixed: 0 };

  const dimNames = new Set<string>();
  const measureNames = new Set<string>();
  const exprByJoinAlias = new Map<string, string>();

  const dimsIdx = yaml.indexOf("dimensions:");
  const measIdx = yaml.indexOf("measures:");

  if (dimsIdx !== -1) {
    const dEnd = measIdx > dimsIdx ? measIdx : matIdx;
    const dBlock = yaml.slice(dimsIdx, dEnd);
    const entryRe = /-\s*name:\s*(\w+)\s*\n\s*expr:\s*(.+)/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(dBlock)) !== null) {
      const name = m[1];
      dimNames.add(name.toLowerCase());
      const expr = m[2].trim().replace(/^["']|["']$/g, "");
      const aliasPart = expr.split(".")[0].replace(/`/g, "");
      if (expr.includes(".")) {
        exprByJoinAlias.set(aliasPart.toLowerCase(), name);
      }
    }
  }

  if (measIdx !== -1) {
    const joinsAfterMeas = yaml.indexOf("joins:", measIdx);
    const mEnd = joinsAfterMeas > measIdx ? joinsAfterMeas : matIdx > measIdx ? matIdx : -1;
    const mBlock = yaml.slice(measIdx, mEnd > measIdx ? mEnd : undefined);
    const nameRe = /^\s*-\s*name:\s*(\w+)/gm;
    let m: RegExpExecArray | null;
    while ((m = nameRe.exec(mBlock)) !== null) {
      measureNames.add(m[1].toLowerCase());
    }
  }

  const allDeclared = new Set([...dimNames, ...measureNames]);

  const matListRe = /(\b(?:dimensions|measures):\s*\[)([^\]]*)\]/g;
  let fixed = 0;

  function fixList(listContent: string): string {
    const items = listContent
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const fixedItems: string[] = [];

    for (const item of items) {
      const clean = item.replace(/^["']|["']$/g, "").trim();
      if (allDeclared.has(clean.toLowerCase())) {
        fixedItems.push(clean);
      } else {
        const mapped = exprByJoinAlias.get(clean.toLowerCase());
        if (mapped) {
          fixedItems.push(mapped);
          fixed++;
        } else {
          fixed++;
        }
      }
    }

    return fixedItems.join(", ");
  }

  const matBlock = yaml.slice(matIdx);
  const fixedMatBlock = matBlock.replace(matListRe, (_match, prefix: string, list: string) => {
    return `${prefix}${fixList(list)}]`;
  });

  if (fixed === 0) return { yaml, ddl, fixed: 0 };

  const modYaml = yaml.slice(0, matIdx) + fixedMatBlock;

  let modDdl = ddl;
  const ddlMatIdx = ddl.indexOf("materialization:");
  if (ddlMatIdx !== -1) {
    const ddlMatBlock = ddl.slice(ddlMatIdx);
    const fixedDdlMatBlock = ddlMatBlock.replace(
      matListRe,
      (_match, prefix: string, list: string) => {
        return `${prefix}${fixList(list)}]`;
      },
    );
    modDdl = ddl.slice(0, ddlMatIdx) + fixedDdlMatBlock;
  }

  return { yaml: modYaml, ddl: modDdl, fixed };
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
  "INVALID_EXTRACT_BASE_FIELD_TYPE",
  "shadows source column",
  "shadows join alias",
  "Nested aggregate",
];

const DRY_RUN_REPAIRABLE_PATTERNS = [
  "METRIC_VIEW_INVALID_VIEW_DEFINITION",
  "UNRESOLVED_COLUMN",
  "FIELD_NOT_FOUND",
  "TABLE_OR_VIEW_NOT_FOUND",
];

function hasDryRunRepairableError(issues: string[]): boolean {
  return issues.some((i) => DRY_RUN_REPAIRABLE_PATTERNS.some((p) => i.includes(p)));
}

export function hasColumnErrors(issues: string[]): boolean {
  return issues.some((i) => COLUMN_ERROR_PATTERNS.some((p) => i.includes(p)));
}

export async function repairProposal(
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
- SNOWFLAKE JOINS: If a join's \`on:\` clause references another join alias (NOT \`source\`), that join MUST be nested under the referenced parent join using a \`joins:\` sub-list. Top-level joins may ONLY reference \`source.\` in their \`on:\` clause. For example, if \`location\` joins on \`member.location_id\`, the \`location\` join must be nested under the \`member\` join.
- PARENT-CHAIN COLUMN REFERENCES: Column references to nested join aliases MUST use the parent-chain prefix. If \`nation\` is nested under \`customer\`, use \`customer.nation.n_name\` NOT \`nation.n_name\`. Direct nested-alias refs cause UNRESOLVED_COLUMN.
- JOIN ALIAS COLLISION: A join alias MUST NOT match a column name on the source table. If the source has column \`claim_type\`, name the join alias \`claim_type_dim\`. Matching names cause INVALID_EXTRACT_BASE_FIELD_TYPE.
- DIMENSION NAME COLLISION: A dimension \`name\` MUST NOT match a join alias \`name\`. If a join alias is \`claim_type\`, rename the dimension to \`claim_type_name\` or similar. Matching names cause INVALID_EXTRACT_BASE_FIELD_TYPE because the dimension shadows the join alias.
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
      maxTokens: 6144,
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

  // Build join context with hierarchical structure for snowflake schemas.
  // Top-level joins reference the source fact table; transitive joins
  // (dim → dim2) are indented under their parent to signal nesting.
  const joinBlock = buildHierarchicalJoinBlock(joinSpecs, tableFqns);

  // Build column enrichments context
  const enrichmentBlock = columnEnrichments
    .filter((e) => e.description)
    .slice(0, 20)
    .map((e) => `- ${e.tableFqn}.${e.columnName}: ${e.description}`)
    .join("\n");

  // Build seed YAML from existing measures/dimensions
  const primaryTable = tableFqns[0];
  const scope = primaryTable.split(".").slice(0, 2).join(".");
  const seedYaml = buildSeedYaml(primaryTable, measures, dimensions);

  // Determine if materialization should be suggested
  const suggestMaterialization = tableFqns.length > 10 || joinSpecs.length > 3;

  const systemMessage =
    `You are a Databricks SQL expert creating Unity Catalog metric view definitions.

You MUST only use table and column identifiers from the SCHEMA CONTEXT below. Do NOT invent identifiers.

${columnsBlock}

${YAML_SPEC_REFERENCE}

---

## Your Task

Create 1-2 metric view proposals for the "${domain}" domain. Each proposal MUST:

1. Follow the YAML v1.1 spec exactly (version, source, dimensions, measures)
2. Use a central fact table as the source
${joinSpecs.length > 0 ? "3. When joins are available, create star/snowflake-schema metric views using the joins: block to pull dimensions from dimension tables. For snowflake schemas where a dimension table joins through another dimension table (not through `source`), you MUST nest the dependent join under the parent join's `joins:` sub-list. NEVER reference a sibling join alias in a top-level `on:` clause. Column references to nested join aliases MUST use the parent-chain prefix (e.g. `customer.nation.n_name` NOT `nation.n_name`). Join alias names MUST NOT match any source table column name — use a `_dim` suffix if needed." : "3. Define meaningful dimensions from the source table columns. Do NOT create a joins: block — no join relationships are available."}
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
      "yaml": "version: 1.1\\nsource: ${scope}.table\\n...",
      "sourceTables": ["${scope}.table", "${scope}.dim_table"]
    }
  ]
}

IMPORTANT:
- Use the REAL catalog and schema (${scope}) in source and sourceTables. Do NOT use placeholders.
- The "yaml" field contains ONLY the YAML body (version, source, dimensions, measures, joins). Do NOT include DDL wrappers.
- Column refs in expr fields use BARE column names or JOIN ALIAS prefixes. NEVER use 4-part FQN column prefixes.` +
    formatSystemOverlay(resolveForGeniePass("metricViews").systemOverlay);

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
      maxTokens: 6144,
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
        let yamlStr = String(p.yaml ?? "");

        // Replace literal placeholder catalog.schema with real scope
        yamlStr = yamlStr.replace(/\bcatalog\.schema\b/g, scope);

        // Build DDL from YAML (or use LLM-provided DDL as fallback for backward compat)
        let ddlStr = p.ddl
          ? String(p.ddl).replace(/\bcatalog\.schema\b/g, scope)
          : buildMetricViewDdl(scope, String(p.name ?? ""), yamlStr);

        // Safety net: strip FQN column prefixes from YAML expr/on lines in the DDL.
        ddlStr = ddlStr.replace(
          /^(\s*(?:expr|on):\s*)(.+)$/gm,
          (_match, prefix: string, rest: string) => prefix + stripFqnPrefixes(rest),
        );

        // Auto-fix snowflake joins: restructure flat sibling joins into
        // nested joins when `on:` references another join alias.
        yamlStr = nestSnowflakeJoins(yamlStr);
        ddlStr = nestSnowflakeJoins(ddlStr);

        // Rewrite nested join alias references to use parent-chain syntax
        // (e.g. `investment_option.col` → `account.investment_option.col`)
        yamlStr = qualifyNestedAliasRefs(yamlStr);
        ddlStr = qualifyNestedAliasRefs(ddlStr);

        // Rename join aliases that collide with source column names
        const aliasCollision = autoRenameCollidingJoinAliases(yamlStr, ddlStr, allowlist);
        yamlStr = aliasCollision.yaml;
        ddlStr = aliasCollision.ddl;
        if (aliasCollision.renamed > 0) {
          logger.info("Auto-renamed colliding join aliases", {
            domain,
            name: String(p.name ?? ""),
            renamed: aliasCollision.renamed,
          });
        }

        // Rename dimension names that shadow join aliases
        const dimCollision = autoRenameShadowedDimensions(yamlStr, ddlStr);
        yamlStr = dimCollision.yaml;
        ddlStr = dimCollision.ddl;
        if (dimCollision.renamed > 0) {
          logger.info("Auto-renamed dimension names shadowing join aliases", {
            domain,
            name: String(p.name ?? ""),
            renamed: dimCollision.renamed,
          });
        }

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

        // Fix materialization refs that use join aliases instead of dim/measure names
        const matFix = autoFixMaterializationRefs(fixedYaml, fixedDdl);
        const finalYaml = matFix.yaml;
        const finalDdl = matFix.ddl;
        if (matFix.fixed > 0) {
          logger.info("Auto-fixed materialization refs", {
            domain,
            name: String(p.name ?? ""),
            fixed: matFix.fixed,
          });
        }

        const validation = validateMetricViewYaml(finalYaml, finalDdl, allowlist);
        const features = detectFeatures(finalYaml);

        return {
          name: String(p.name ?? ""),
          description: String(p.description ?? ""),
          yaml: finalYaml,
          ddl: finalDdl,
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

      // Auto-fix snowflake joins in repaired YAML + DDL
      repaired.yaml = nestSnowflakeJoins(repaired.yaml);
      repaired.ddl = nestSnowflakeJoins(repaired.ddl);

      // Qualify nested alias refs with parent-chain prefix
      repaired.yaml = qualifyNestedAliasRefs(repaired.yaml);
      repaired.ddl = qualifyNestedAliasRefs(repaired.ddl);

      // Rename colliding join aliases
      const repairAliasCollision = autoRenameCollidingJoinAliases(
        repaired.yaml,
        repaired.ddl,
        allowlist,
      );
      repaired.yaml = repairAliasCollision.yaml;
      repaired.ddl = repairAliasCollision.ddl;

      // Rename dimension names that shadow join aliases
      const repairDimCollision = autoRenameShadowedDimensions(repaired.yaml, repaired.ddl);
      repaired.yaml = repairDimCollision.yaml;
      repaired.ddl = repairDimCollision.ddl;

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

    await Promise.all(
      proposals.map(async (proposal) => {
        if (proposal.validationStatus === "error") return;
        const dryRunError = await dryRunMetricViewDdl(proposal.ddl);
        if (dryRunError) {
          const isPermissionError = PERMISSION_PATTERNS.some((p) => dryRunError.includes(p));
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
            proposal.validationIssues.push(`SQL validation failed: ${dryRunError}`);
            logger.warn("Metric view dry-run failed", {
              domain,
              name: proposal.name,
              error: dryRunError,
            });
          }
        }
      }),
    );

    // Post-dry-run repair: attempt LLM repair for proposals that failed dry-run
    // with repairable errors (e.g. METRIC_VIEW_INVALID_VIEW_DEFINITION)
    for (let i = 0; i < proposals.length; i++) {
      const proposal = proposals[i];
      if (
        proposal.validationStatus !== "error" ||
        !hasDryRunRepairableError(proposal.validationIssues)
      ) {
        continue;
      }

      logger.info("Attempting LLM repair for metric view with dry-run error", {
        domain,
        name: proposal.name,
        issues: proposal.validationIssues,
      });

      const repaired = await repairProposal(proposal, schemaBlock, columnsBlock, endpoint, signal);
      if (!repaired) continue;

      repaired.yaml = nestSnowflakeJoins(repaired.yaml);
      repaired.ddl = nestSnowflakeJoins(repaired.ddl);
      repaired.yaml = qualifyNestedAliasRefs(repaired.yaml);
      repaired.ddl = qualifyNestedAliasRefs(repaired.ddl);

      const revalidation = validateMetricViewYaml(repaired.yaml, repaired.ddl, allowlist);
      if (revalidation.status === "error") continue;

      const reDryRunError = await dryRunMetricViewDdl(repaired.ddl);
      if (reDryRunError) {
        logger.warn("Post-dry-run LLM repair still fails dry-run", {
          domain,
          name: proposal.name,
          error: reDryRunError,
        });
        continue;
      }

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

      logger.info("Post-dry-run LLM repair succeeded", {
        domain,
        name: proposal.name,
      });
    }

    // LLM review gate: review DDL for proposals that passed validation (parallel)
    if (isReviewEnabled("genie-metric-views")) {
      const reviewable = proposals.filter((p) => p.validationStatus !== "error" && p.ddl);
      await Promise.all(
        reviewable.map(async (proposal) => {
          try {
            const review = await reviewAndFixSql(proposal.ddl!, {
              schemaContext: schemaBlock,
              surface: "genie-metric-views",
            });
            if (review.fixedSql) {
              const revalidation = validateMetricViewYaml(
                proposal.yaml,
                review.fixedSql,
                allowlist,
              );
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
        }),
      );
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

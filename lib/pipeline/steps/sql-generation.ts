/**
 * Pipeline Step 7: SQL Generation
 *
 * Generates bespoke, runnable SQL for each use case by calling ai_query
 * with full business context, use case details, and actual table schemas.
 *
 * Processing order: domains sorted by size (smallest first), with controlled
 * concurrency within each domain. Matches the reference notebook approach.
 */

import { executeAIQuery } from "@/lib/ai/agent";
import { executeSQL } from "@/lib/dbx/sql";
import {
  generateAIFunctionsSummary,
  generateStatisticalFunctionsSummary,
} from "@/lib/ai/functions";
import {
  buildSchemaMarkdown,
  buildForeignKeyMarkdown,
} from "@/lib/queries/metadata";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { groupByDomain } from "@/lib/domain/scoring";
import type {
  PipelineContext,
  UseCase,
  ColumnInfo,
  ForeignKey,
  TableInfo,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_SQL = 3;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runSqlGeneration(
  ctx: PipelineContext,
  runId?: string
): Promise<UseCase[]> {
  const { run, metadata } = ctx;
  if (!metadata) throw new Error("Metadata not available");
  if (!run.businessContext) throw new Error("Business context not available");

  const bc = run.businessContext;
  const useCases = ctx.useCases;

  if (useCases.length === 0) return useCases;

  // Build a lookup index: table FQN -> columns
  const columnsByTable = new Map<string, ColumnInfo[]>();
  for (const col of metadata.columns) {
    const existing = columnsByTable.get(col.tableFqn) ?? [];
    existing.push(col);
    columnsByTable.set(col.tableFqn, existing);
  }

  // Build a lookup index: table FQN -> TableInfo
  const tableByFqn = new Map<string, TableInfo>();
  for (const t of metadata.tables) {
    tableByFqn.set(t.fqn, t);
  }

  // Group use cases by domain, smallest domains first
  const grouped = groupByDomain(useCases);
  const sortedDomains = Object.entries(grouped).sort(
    ([, a], [, b]) => a.length - b.length
  );

  const totalUseCases = useCases.length;
  let completed = 0;
  let failed = 0;

  // Shared prompt variables (business context -- same for all use cases)
  const businessVars = {
    business_name: run.config.businessName,
    business_context: JSON.stringify(bc),
    strategic_goals: bc.strategicGoals,
    business_priorities: bc.businessPriorities,
    strategic_initiative: bc.strategicInitiative,
    value_chain: bc.valueChain,
    revenue_model: bc.revenueModel,
    sql_model_serving: run.config.aiModel,
  };

  // Function reference docs (computed once)
  const aiFunctionsSummary = generateAIFunctionsSummary();
  const statisticalFunctionsSummary = generateStatisticalFunctionsSummary();

  const sampleRows = run.config.sampleRowsPerTable ?? 0;

  console.log(
    `[sql-generation] Generating SQL for ${totalUseCases} use cases across ${sortedDomains.length} domains` +
      (sampleRows > 0 ? ` (sampling ${sampleRows} rows/table)` : "")
  );

  for (const [domain, domainCases] of sortedDomains) {
    if (runId) {
      await updateRunMessage(
        runId,
        `Generating SQL for domain "${domain}" (${domainCases.length} use cases, ${completed}/${totalUseCases} done)...`
      );
    }

    // Process use cases within this domain in waves of MAX_CONCURRENT_SQL
    for (let i = 0; i < domainCases.length; i += MAX_CONCURRENT_SQL) {
      const wave = domainCases.slice(i, i + MAX_CONCURRENT_SQL);

      const results = await Promise.allSettled(
        wave.map((uc) =>
          generateSqlForUseCase(
            uc,
            businessVars,
            aiFunctionsSummary,
            statisticalFunctionsSummary,
            columnsByTable,
            tableByFqn,
            metadata.foreignKeys,
            run.config.aiModel,
            sampleRows
          )
        )
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const uc = wave[j];

        if (result.status === "fulfilled" && result.value) {
          uc.sqlCode = result.value;
          uc.sqlStatus = "generated";
        } else {
          const reason =
            result.status === "rejected"
              ? result.reason instanceof Error
                ? result.reason.message
                : String(result.reason)
              : "empty response";
          console.warn(
            `[sql-generation] Failed for ${uc.id} (${uc.name}): ${reason}`
          );
          uc.sqlCode = null;
          uc.sqlStatus = "failed";
          failed++;
        }
        completed++;
      }

      if (runId) {
        await updateRunMessage(
          runId,
          `SQL generation: ${completed}/${totalUseCases} complete (${failed} failed)`
        );
      }
    }
  }

  console.log(
    `[sql-generation] Completed: ${completed - failed} generated, ${failed} failed`
  );

  return useCases;
}

// ---------------------------------------------------------------------------
// Per-use-case SQL generation
// ---------------------------------------------------------------------------

async function generateSqlForUseCase(
  uc: UseCase,
  businessVars: Record<string, string>,
  aiFunctionsSummary: string,
  statisticalFunctionsSummary: string,
  columnsByTable: Map<string, ColumnInfo[]>,
  tableByFqn: Map<string, TableInfo>,
  allForeignKeys: ForeignKey[],
  aiModel: string,
  sampleRowsPerTable: number
): Promise<string | null> {
  // Resolve table schemas for this use case's involved tables
  const involvedTables: TableInfo[] = [];
  const involvedColumns: ColumnInfo[] = [];

  for (const fqn of uc.tablesInvolved) {
    // Try exact match, then try with backtick-stripped version
    const cleanFqn = fqn.replace(/`/g, "");
    const tableInfo = tableByFqn.get(fqn) ?? tableByFqn.get(cleanFqn);
    if (tableInfo) involvedTables.push(tableInfo);

    const cols = columnsByTable.get(fqn) ?? columnsByTable.get(cleanFqn) ?? [];
    involvedColumns.push(...cols);
  }

  // If we have no schema info at all, we can still try (the LLM may use table
  // names alone), but log a warning
  if (involvedColumns.length === 0) {
    console.warn(
      `[sql-generation] No column metadata for ${uc.id} (tables: ${uc.tablesInvolved.join(", ")})`
    );
  }

  // Build schema markdown scoped to this use case's tables
  const schemaMarkdown =
    involvedTables.length > 0
      ? buildSchemaMarkdown(involvedTables, involvedColumns)
      : uc.tablesInvolved.map((t) => `### ${t}\n  (schema not available)`).join("\n\n");

  // Filter foreign keys to only those involving this use case's tables
  const involvedFqns = new Set(
    uc.tablesInvolved.map((t) => t.replace(/`/g, ""))
  );
  const relevantFKs = allForeignKeys.filter(
    (fk) =>
      involvedFqns.has(fk.tableFqn.replace(/`/g, "")) ||
      involvedFqns.has(fk.referencedTableFqn.replace(/`/g, ""))
  );
  const fkMarkdown = buildForeignKeyMarkdown(relevantFKs);

  // Fetch sample data if enabled
  let sampleDataSection = "";
  if (sampleRowsPerTable > 0 && uc.tablesInvolved.length > 0) {
    sampleDataSection = await fetchSampleData(uc.tablesInvolved, sampleRowsPerTable);
  }

  // Build the per-use-case prompt variables
  const variables: Record<string, string> = {
    ...businessVars,
    use_case_id: uc.id,
    use_case_name: uc.name,
    business_domain: uc.domain,
    use_case_type: uc.type,
    analytics_technique: uc.analyticsTechnique,
    statement: uc.statement,
    solution: uc.solution,
    tables_involved: uc.tablesInvolved.join(", "),
    directly_involved_schema: schemaMarkdown,
    foreign_key_relationships: fkMarkdown,
    sample_data_section: sampleDataSection,
    ai_functions_summary:
      uc.type === "AI" ? aiFunctionsSummary : "",
    statistical_functions_detailed:
      uc.type === "Statistical" ? statisticalFunctionsSummary : "",
  };

  const result = await executeAIQuery({
    promptKey: "USE_CASE_SQL_GEN_PROMPT",
    variables,
    modelEndpoint: aiModel,
    maxTokens: 4096,
  });

  const sql = cleanSqlResponse(result.rawResponse);

  if (!sql || sql.length < 20) {
    return null;
  }

  return sql;
}

// ---------------------------------------------------------------------------
// Sample data fetching
// ---------------------------------------------------------------------------

/**
 * Fetch sample rows from each table and format as markdown tables for
 * prompt injection. Helps the LLM understand actual data values, formats,
 * and cardinality to write more precise SQL.
 */
async function fetchSampleData(
  tableFqns: string[],
  rowLimit: number
): Promise<string> {
  const sections: string[] = [
    "### SAMPLE DATA (real rows from the tables -- use this to understand data formats, values, and join keys)\n",
  ];

  const results = await Promise.allSettled(
    tableFqns.map(async (fqn) => {
      const cleanFqn = fqn.replace(/`/g, "");
      const result = await executeSQL(
        `SELECT * FROM \`${cleanFqn.split(".").join("\`.\`")}\` LIMIT ${rowLimit}`
      );

      if (!result.columns || result.columns.length === 0 || result.rows.length === 0) {
        return { fqn: cleanFqn, markdown: `**${cleanFqn}**: (empty table)\n` };
      }

      const colNames = result.columns.map((c) => c.name);
      const header = `| ${colNames.join(" | ")} |`;
      const separator = `| ${colNames.map(() => "---").join(" | ")} |`;
      const rows = result.rows.map((row) => {
        const cells = row.map((val) => {
          if (val === null || val === undefined) return "NULL";
          const s = String(val);
          // Truncate long values to keep the prompt compact
          return s.length > 60 ? s.substring(0, 57) + "..." : s;
        });
        return `| ${cells.join(" | ")} |`;
      });

      const markdown = `**${cleanFqn}** (${result.rows.length} sample rows):\n${header}\n${separator}\n${rows.join("\n")}\n`;
      return { fqn: cleanFqn, markdown };
    })
  );

  for (const r of results) {
    if (r.status === "fulfilled") {
      sections.push(r.value.markdown);
    }
  }

  return sections.length > 1 ? sections.join("\n") : "";
}

// ---------------------------------------------------------------------------
// Response cleaning
// ---------------------------------------------------------------------------

/**
 * Strip markdown fences, preamble text, and JSON wrappers that the LLM
 * may have included despite instructions.
 */
function cleanSqlResponse(raw: string): string {
  let sql = raw.trim();

  // Strip markdown code fences
  if (sql.startsWith("```")) {
    const firstNewline = sql.indexOf("\n");
    sql = sql.substring(firstNewline + 1);
  }
  if (sql.endsWith("```")) {
    sql = sql.substring(0, sql.lastIndexOf("```"));
  }

  // Strip any leading text before the first SQL comment or keyword
  const sqlStart = sql.search(/^(--|WITH\b|SELECT\b|CREATE\b)/im);
  if (sqlStart > 0) {
    sql = sql.substring(sqlStart);
  }

  return sql.trim();
}

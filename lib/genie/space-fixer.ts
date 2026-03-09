/**
 * Space Fixer -- maps health check failures to Genie Engine passes,
 * builds MetadataSnapshot for off-platform spaces, and merges improvements.
 *
 * Every LLM-backed strategy receives synthesized business context from the
 * space itself (title, description, existing instructions) so fixes are
 * contextually relevant rather than generic.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { getServingEndpoint, getFastServingEndpoint } from "@/lib/dbx/client";
import { buildSchemaAllowlist } from "@/lib/genie/schema-allowlist";
import { extractEntityCandidatesFromSchema } from "@/lib/genie/entity-extraction";
import {
  defaultGenieEngineConfig,
  type SpaceJson,
  type JoinSpecInput,
  type BenchmarkInput,
  type ReferenceSqlExample,
} from "@/lib/genie/types";
import { resolveRegistry } from "@/lib/genie/health-checks/registry";
import { chatCompletion } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import type { MetadataSnapshot, TableInfo, ColumnInfo, BusinessContext } from "@/lib/domain/types";
import type { FixStrategy } from "@/lib/genie/health-checks/types";
import "@/lib/skills/content";
import { resolveForGeniePass, formatContextSections } from "@/lib/skills/resolver";

interface FixRequest {
  checkIds: string[];
  serializedSpace: string;
}

interface FixResult {
  updatedSpace: SpaceJson;
  changes: FixChange[];
  strategiesRun: FixStrategy[];
}

interface FixChange {
  section: string;
  description: string;
  added: number;
  modified: number;
}

/**
 * Context extracted from the serialized space JSON to feed into LLM passes.
 */
interface SpaceContext {
  title: string;
  description: string;
  domain: string;
  existingInstructions: string[];
  existingMeasureNames: string[];
  existingFilterNames: string[];
  existingExampleQuestions: string[];
  existingBenchmarkQuestions: string[];
  joinSpecs: JoinSpecInput[];
}

function extractSpaceContext(space: SpaceJson): SpaceContext {
  const title = String(space.display_name ?? space.title ?? "");
  const description = String(space.description ?? "");

  const textInstructions = ((space.instructions?.text_instructions ?? []) as SpaceJson[]).map(
    (i: SpaceJson) =>
      Array.isArray(i.content) ? (i.content as string[]).join(" ") : String(i.content ?? ""),
  );

  const measureNames = ((space.instructions?.sql_snippets?.measures ?? []) as SpaceJson[]).map(
    (m: SpaceJson) => String(m.display_name ?? m.alias ?? ""),
  );

  const filterNames = ((space.instructions?.sql_snippets?.filters ?? []) as SpaceJson[]).map(
    (f: SpaceJson) => String(f.display_name ?? ""),
  );

  const exampleQuestions = ((space.instructions?.example_question_sqls ?? []) as SpaceJson[]).map(
    (e: SpaceJson) =>
      Array.isArray(e.question) ? String(e.question[0] ?? "") : String(e.question ?? ""),
  );

  const benchmarkQuestions = ((space.benchmarks?.questions ?? []) as SpaceJson[]).map(
    (q: SpaceJson) =>
      Array.isArray(q.question) ? String(q.question[0] ?? "") : String(q.question ?? ""),
  );

  const joinSpecs: JoinSpecInput[] = ((space.instructions?.join_specs ?? []) as SpaceJson[]).map(
    (j: SpaceJson) => ({
      leftTable: String(j.left?.identifier ?? ""),
      rightTable: String(j.right?.identifier ?? ""),
      sql: Array.isArray(j.sql) ? (j.sql as string[]).join(" ") : String(j.sql ?? ""),
      relationshipType: "many_to_one",
    }),
  );

  const domain = title.toLowerCase().includes("retail")
    ? "retail"
    : title.toLowerCase().includes("finance") || title.toLowerCase().includes("bank")
      ? "finance"
      : title.toLowerCase().includes("health")
        ? "healthcare"
        : "general";

  return {
    title,
    description,
    domain,
    existingInstructions: textInstructions,
    existingMeasureNames: measureNames,
    existingFilterNames: filterNames,
    existingExampleQuestions: exampleQuestions,
    existingBenchmarkQuestions: benchmarkQuestions,
    joinSpecs,
  };
}

interface SpaceSqlContext {
  referenceSql: ReferenceSqlExample[];
  existingBenchmarks: BenchmarkInput[];
}

/**
 * Harvest validated SQL from an existing space to ground LLM passes.
 * Returns reference SQL examples (from trusted assets, measures, benchmarks)
 * and existing benchmarks in BenchmarkInput format.
 */
function extractSpaceSqlExamples(space: SpaceJson): SpaceSqlContext {
  const referenceSql: ReferenceSqlExample[] = [];
  const existingBenchmarks: BenchmarkInput[] = [];

  const exampleSqls = (space.instructions?.example_question_sqls ?? []) as SpaceJson[];
  for (const e of exampleSqls) {
    const question = Array.isArray(e.question)
      ? String(e.question[0] ?? "")
      : String(e.question ?? "");
    const sql = Array.isArray(e.sql) ? String(e.sql[0] ?? "") : String(e.sql ?? "");
    if (question && sql) {
      referenceSql.push({ name: question, question, sql });
    }
  }

  const measures = (space.instructions?.sql_snippets?.measures ?? []) as SpaceJson[];
  for (const m of measures) {
    const name = String(m.display_name ?? m.alias ?? "");
    const sql = Array.isArray(m.sql) ? String(m.sql[0] ?? "") : String(m.sql ?? "");
    if (name && sql) {
      referenceSql.push({ name, question: `Calculate ${name}`, sql });
    }
  }

  const benchmarkQuestions = (space.benchmarks?.questions ?? []) as SpaceJson[];
  for (const q of benchmarkQuestions) {
    const question = Array.isArray(q.question)
      ? String(q.question[0] ?? "")
      : String(q.question ?? "");
    if (!question) continue;

    const answers = (q.answer ?? []) as SpaceJson[];
    const sqlAnswer = answers.find((a: SpaceJson) => a.format === "sql");
    const sql = sqlAnswer
      ? Array.isArray(sqlAnswer.content)
        ? String(sqlAnswer.content[0] ?? "")
        : String(sqlAnswer.content ?? "")
      : "";

    existingBenchmarks.push({
      question,
      expectedSql: sql,
      alternatePhrasings: [],
    });

    if (sql) {
      referenceSql.push({ name: question, question, sql });
    }
  }

  return { referenceSql, existingBenchmarks };
}

function synthesizeBusinessContext(ctx: SpaceContext): BusinessContext | null {
  if (!ctx.title && !ctx.description) return null;
  return {
    industries: ctx.domain !== "general" ? ctx.domain : "",
    strategicGoals: ctx.description || `Analysis of ${ctx.title}`,
    businessPriorities: "",
    strategicInitiative: "",
    valueChain: "",
    revenueModel: "",
    additionalContext: ctx.existingInstructions.join(" ").slice(0, 500),
  };
}

/**
 * Given a list of failed check IDs, resolve the fix strategies needed
 * and group them to minimize redundant engine pass invocations.
 */
export function resolveFixStrategies(checkIds: string[]): Map<FixStrategy, string[]> {
  const registry = resolveRegistry();
  const strategyMap = new Map<FixStrategy, string[]>();

  for (const checkId of checkIds) {
    const check = registry.checks.find((c) => c.id === checkId);
    if (!check?.fix_strategy) continue;
    const strategy = check.fix_strategy;
    if (!strategyMap.has(strategy)) strategyMap.set(strategy, []);
    strategyMap.get(strategy)!.push(checkId);
  }

  return strategyMap;
}

/**
 * Extract table FQNs from a serialized space's data_sources.tables.
 */
export function extractTableFqns(space: SpaceJson): string[] {
  const tables = space?.data_sources?.tables;
  if (!Array.isArray(tables)) return [];
  return tables
    .map((t: { identifier?: string }) => t.identifier)
    .filter((id): id is string => typeof id === "string" && id.split(".").length === 3);
}

/**
 * Build a MetadataSnapshot for off-platform spaces by querying
 * information_schema for the space's tables.
 */
export async function buildMetadataForSpace(tableFqns: string[]): Promise<MetadataSnapshot> {
  const tables: TableInfo[] = [];
  const columns: ColumnInfo[] = [];

  for (const fqn of tableFqns) {
    const parts = fqn.split(".");
    if (parts.length !== 3) continue;
    const [catalog, schema, tableName] = parts;

    tables.push({
      catalog,
      schema,
      tableName,
      fqn,
      tableType: "TABLE",
      comment: null,
    });

    try {
      const sql = `
        SELECT column_name, data_type, ordinal_position, is_nullable, comment
        FROM ${catalog}.information_schema.columns
        WHERE table_catalog = '${catalog}'
          AND table_schema = '${schema}'
          AND table_name = '${tableName}'
        ORDER BY ordinal_position
      `;
      const result = await executeSQL(sql);
      if (Array.isArray(result)) {
        for (const row of result) {
          columns.push({
            tableFqn: fqn,
            columnName: String(row.column_name ?? row[0] ?? ""),
            dataType: String(row.data_type ?? row[1] ?? "STRING"),
            ordinalPosition: Number(row.ordinal_position ?? row[2] ?? 0),
            isNullable: String(row.is_nullable ?? row[3] ?? "YES") === "YES",
            comment: row.comment ?? row[4] ?? null,
          });
        }
      }
    } catch (err) {
      logger.warn("Failed to query columns for off-platform space table", {
        fqn,
        error: String(err),
      });
    }
  }

  return {
    cacheKey: `fixer-${Date.now()}`,
    ucPath: tableFqns.length > 0 ? tableFqns[0].split(".").slice(0, 2).join(".") : "",
    tables,
    columns,
    foreignKeys: [],
    metricViews: [],
    schemaMarkdown: "",
    tableCount: tables.length,
    columnCount: columns.length,
    cachedAt: new Date().toISOString(),
    lineageDiscoveredFqns: [],
  };
}

/**
 * Run the fix workflow: determine strategies, build metadata if needed,
 * run relevant passes, and merge results into the space.
 *
 * Each LLM-backed strategy receives synthesized business context extracted
 * from the space (title, description, existing instructions) so that
 * generated content is contextually relevant.
 */
export async function runFixes(request: FixRequest): Promise<FixResult> {
  const space = JSON.parse(request.serializedSpace) as SpaceJson;
  const strategies = resolveFixStrategies(request.checkIds);
  const changes: FixChange[] = [];
  const strategiesRun: FixStrategy[] = [];

  if (strategies.size === 0) {
    return { updatedSpace: space, changes, strategiesRun };
  }

  const tableFqns = extractTableFqns(space);
  const metadata = await buildMetadataForSpace(tableFqns);
  const allowlist = buildSchemaAllowlist(metadata);
  const config = defaultGenieEngineConfig();
  const endpoint = getServingEndpoint();
  const fastEndpoint = getFastServingEndpoint();
  const spaceCtx = extractSpaceContext(space);
  const businessContext = synthesizeBusinessContext(spaceCtx);
  const spaceSql = extractSpaceSqlExamples(space);

  const SQL_STRATEGIES: Set<FixStrategy> = new Set([
    "benchmark_generation",
    "trusted_assets",
    "semantic_expressions",
  ]);

  const tablesWithoutColumns = tableFqns.filter(
    (fqn) => !metadata.columns.some((c) => c.tableFqn.toLowerCase() === fqn.toLowerCase()),
  );
  if (tablesWithoutColumns.length > 0) {
    logger.warn("Tables with no columns in metadata -- SQL generation may be unreliable", {
      tablesWithoutColumns,
      totalTables: tableFqns.length,
    });
  }
  if (metadata.columns.length === 0 && tableFqns.length > 0) {
    logger.error("No columns retrieved for any table -- skipping SQL-generating strategies", {
      tables: tableFqns,
    });
    const skippedSqlStrategies = [...strategies.keys()].filter((s) => SQL_STRATEGIES.has(s));
    if (skippedSqlStrategies.length > 0) {
      changes.push({
        section: "metadata",
        description: `Skipped ${skippedSqlStrategies.join(", ")}: no column metadata available for ${tableFqns.length} table${tableFqns.length !== 1 ? "s" : ""}`,
        added: 0,
        modified: 0,
      });
      for (const s of skippedSqlStrategies) {
        strategies.delete(s);
        strategiesRun.push(s);
      }
    }
  }

  const entityCandidates = extractEntityCandidatesFromSchema(
    metadata.columns.map((c) => ({
      tableFqn: c.tableFqn,
      columnName: c.columnName,
      dataType: c.dataType,
    })),
    tableFqns,
  );
  const entityCandidateColumns = new Set(
    entityCandidates.map((c) => `${c.tableFqn.toLowerCase()}.${c.columnName.toLowerCase()}`),
  );

  for (const [strategy] of strategies) {
    try {
      switch (strategy) {
        case "column_intelligence": {
          const { runColumnIntelligence } = await import("@/lib/genie/passes/column-intelligence");
          const output = await runColumnIntelligence({
            tableFqns,
            metadata,
            allowlist,
            config,
            sampleData: null,
            endpoint: fastEndpoint,
          });

          let descriptionsAdded = 0;
          let synonymsAdded = 0;
          let tableDescriptionsAdded = 0;
          const tables = (space.data_sources?.tables ?? []) as SpaceJson[];

          // --- Table-level descriptions ---
          for (const table of tables) {
            const fqn = String(table.identifier ?? "").toLowerCase();
            if (!fqn) continue;
            const hasDesc =
              table.description &&
              (typeof table.description === "string"
                ? table.description.trim().length > 0
                : Array.isArray(table.description) &&
                  table.description.length > 0 &&
                  (table.description as string[]).some((d) => d && String(d).trim().length > 0));
            if (hasDesc) continue;
            const tableColumns = metadata.columns.filter((c) => c.tableFqn.toLowerCase() === fqn);
            if (tableColumns.length === 0) continue;
            const tableName = fqn.split(".").pop() ?? "";
            const colNames = tableColumns.slice(0, 20).map((c) => c.columnName);
            const desc = inferTableDescription(tableName, colNames);
            if (desc) {
              table.description = [desc];
              tableDescriptionsAdded++;
            }
          }

          // --- Column-level enrichments ---
          for (const enrichment of output.enrichments) {
            const hasDesc = enrichment.description && enrichment.description.trim().length > 0;
            const hasSynonyms = enrichment.synonyms && enrichment.synonyms.length > 0;
            if (!hasDesc && !hasSynonyms) continue;

            const table = tables.find(
              (t: SpaceJson) =>
                (t.identifier as string)?.toLowerCase() === enrichment.tableFqn?.toLowerCase(),
            );
            if (!table) continue;

            const colConfigs = (table.column_configs ?? []) as SpaceJson[];
            const col = colConfigs.find(
              (c: SpaceJson) =>
                ((c.column_name as string) ?? (c.name as string))?.toLowerCase() ===
                enrichment.columnName?.toLowerCase(),
            );

            if (!col) {
              const newCol: Record<string, unknown> = {
                column_name: enrichment.columnName,
                enable_format_assistance: true,
              };
              if (hasDesc) {
                newCol.description = [enrichment.description];
                descriptionsAdded++;
              }
              if (hasSynonyms) {
                newCol.synonyms = enrichment.synonyms;
                synonymsAdded++;
              }
              if (enrichment.entityMatchingCandidate) {
                newCol.enable_entity_matching = true;
              }
              colConfigs.push(newCol as SpaceJson);
              if (!table.column_configs) table.column_configs = colConfigs;
              continue;
            }

            const colDescEmpty =
              !col.description ||
              (Array.isArray(col.description) && col.description.length === 0) ||
              (Array.isArray(col.description) &&
                (col.description as string[]).every((d) => !d || String(d).trim() === ""));
            if (colDescEmpty && hasDesc) {
              col.description = [enrichment.description!];
              descriptionsAdded++;
            }
            const colSynEmpty =
              !col.synonyms || (Array.isArray(col.synonyms) && col.synonyms.length === 0);
            if (colSynEmpty && hasSynonyms) {
              col.synonyms = enrichment.synonyms;
              synonymsAdded++;
            }
          }

          const totalAdded = descriptionsAdded + synonymsAdded + tableDescriptionsAdded;
          if (totalAdded > 0) {
            changes.push({
              section: "data_sources.tables.column_configs",
              description: `Column intelligence: added ${descriptionsAdded} descriptions, ${synonymsAdded} synonyms, ${tableDescriptionsAdded} table descriptions`,
              added: totalAdded,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        case "semantic_expressions": {
          const { runSemanticExpressions } =
            await import("@/lib/genie/passes/semantic-expressions");
          const output = await runSemanticExpressions({
            tableFqns,
            metadata,
            allowlist,
            useCases: [],
            businessContext,
            config,
            endpoint,
          });

          const snippets = space.instructions?.sql_snippets ?? {};
          const existingMeasureIds = new Set(
            (snippets.measures ?? []).map((m: SpaceJson) =>
              String(m.alias ?? m.display_name ?? "").toLowerCase(),
            ),
          );
          const newMeasures = output.measures.filter(
            (m) => !existingMeasureIds.has(m.name.toLowerCase()),
          );
          if (newMeasures.length > 0) {
            snippets.measures = [
              ...(snippets.measures ?? []),
              ...newMeasures.map((m) => ({
                id: crypto.randomUUID().replace(/-/g, ""),
                alias: m.name,
                sql: [m.sql],
                display_name: m.name,
                synonyms: m.synonyms ?? [],
              })),
            ];
          }

          const existingFilterIds = new Set(
            (snippets.filters ?? []).map((f: SpaceJson) =>
              String(f.display_name ?? "").toLowerCase(),
            ),
          );
          const newFilters = output.filters.filter(
            (f) => !existingFilterIds.has(f.name.toLowerCase()),
          );
          if (newFilters.length > 0) {
            snippets.filters = [
              ...(snippets.filters ?? []),
              ...newFilters.map((f) => ({
                id: crypto.randomUUID().replace(/-/g, ""),
                sql: [f.sql],
                display_name: f.name,
                synonyms: f.synonyms ?? [],
              })),
            ];
          }

          const totalAdded = newMeasures.length + newFilters.length;
          if (totalAdded > 0) {
            space.instructions = space.instructions ?? {};
            space.instructions.sql_snippets = snippets;
            changes.push({
              section: "instructions.sql_snippets",
              description: `Semantic expressions: added ${newMeasures.length} measures and ${newFilters.length} filters`,
              added: totalAdded,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        case "join_inference": {
          const { runJoinInference } = await import("@/lib/genie/passes/join-inference");
          const existingJoins = (space.instructions?.join_specs ?? []) as SpaceJson[];
          const existingJoinKeys = new Set(
            existingJoins.map(
              (j: SpaceJson) =>
                `${(j.left?.identifier ?? "").toLowerCase()}|${(j.right?.identifier ?? "").toLowerCase()}`,
            ),
          );

          const output = await runJoinInference({
            tableFqns,
            metadata,
            allowlist,
            existingJoinKeys,
            endpoint: fastEndpoint,
          });

          const newJoins = output.joins.map((j) => ({
            id: crypto.randomUUID().replace(/-/g, ""),
            left: { identifier: j.leftTable, alias: j.leftTable.split(".").pop() },
            right: { identifier: j.rightTable, alias: j.rightTable.split(".").pop() },
            sql: [j.sql],
          }));

          if (newJoins.length > 0) {
            space.instructions = space.instructions ?? {};
            space.instructions.join_specs = [...existingJoins, ...newJoins];
            changes.push({
              section: "instructions.join_specs",
              description: `Join inference: added ${newJoins.length} join specification${newJoins.length !== 1 ? "s" : ""}`,
              added: newJoins.length,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        case "trusted_assets": {
          const { runTrustedAssetAuthoring } = await import("@/lib/genie/passes/trusted-assets");
          const output = await runTrustedAssetAuthoring({
            tableFqns,
            metadata,
            allowlist,
            useCases: [],
            entityCandidates,
            joinSpecs: spaceCtx.joinSpecs,
            endpoint,
            referenceSql: spaceSql.referenceSql,
          });

          const existingQuestions = new Set(
            spaceCtx.existingExampleQuestions.map((q) => q.toLowerCase()),
          );
          const newQueries = output.queries.filter(
            (q) => !existingQuestions.has(q.question.toLowerCase()),
          );

          if (newQueries.length > 0) {
            space.instructions = space.instructions ?? {};
            space.instructions.example_question_sqls = [
              ...(space.instructions.example_question_sqls ?? []),
              ...newQueries.map((q) => ({
                id: crypto.randomUUID().replace(/-/g, ""),
                question: [q.question],
                sql: [q.sql],
              })),
            ];
            changes.push({
              section: "instructions.example_question_sqls",
              description: `Trusted assets: added ${newQueries.length} example question-SQL pair${newQueries.length !== 1 ? "s" : ""}`,
              added: newQueries.length,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        case "instruction_generation": {
          const { runInstructionGeneration } =
            await import("@/lib/genie/passes/instruction-generation");
          const output = await runInstructionGeneration({
            domain: spaceCtx.domain,
            subdomains: [],
            businessName: spaceCtx.title,
            businessContext,
            config,
            entityCandidates,
            joinSpecs: spaceCtx.joinSpecs,
            endpoint: fastEndpoint,
            metadata,
            tableFqns,
          });

          if (output.instructions.length > 0) {
            space.instructions = space.instructions ?? {};
            space.instructions.text_instructions = [
              ...(space.instructions.text_instructions ?? []),
              ...output.instructions.map((text) => ({
                id: crypto.randomUUID().replace(/-/g, ""),
                content: [text],
              })),
            ];
            changes.push({
              section: "instructions.text_instructions",
              description: `Instruction generation: added ${output.instructions.length} text instruction${output.instructions.length !== 1 ? "s" : ""}`,
              added: output.instructions.length,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        case "benchmark_generation": {
          const { runBenchmarkGeneration } =
            await import("@/lib/genie/passes/benchmark-generation");
          const output = await runBenchmarkGeneration({
            tableFqns,
            metadata,
            allowlist,
            useCases: [],
            entityCandidates,
            customerBenchmarks: spaceSql.existingBenchmarks,
            joinSpecs: spaceCtx.joinSpecs,
            referenceSql: spaceSql.referenceSql,
            endpoint,
          });

          if (output.benchmarks.length > 0) {
            space.benchmarks = space.benchmarks ?? { questions: [] };
            const existing = new Set(
              spaceCtx.existingBenchmarkQuestions.map((q) => q.toLowerCase()),
            );
            const newBenchmarks = output.benchmarks.filter(
              (b) => !existing.has(b.question.toLowerCase()),
            );
            if (newBenchmarks.length > 0) {
              space.benchmarks.questions = [
                ...(space.benchmarks.questions ?? []),
                ...newBenchmarks.map((b) => ({
                  id: crypto.randomUUID().replace(/-/g, ""),
                  question: [b.question],
                  ...(b.expectedSql
                    ? { answer: [{ format: "sql", content: [b.expectedSql] }] }
                    : {}),
                })),
              ];
              const diag = output.diagnostics;
              const diagNote = diag?.fallbackUsed ? " (question-only fallback)" : "";
              changes.push({
                section: "benchmarks.questions",
                description: `Benchmark generation: added ${newBenchmarks.length} benchmark question${newBenchmarks.length !== 1 ? "s" : ""}${diagNote}`,
                added: newBenchmarks.length,
                modified: 0,
              });
            }
          }
          strategiesRun.push(strategy);
          break;
        }

        case "entity_matching": {
          const tables = (space.data_sources?.tables ?? []) as SpaceJson[];
          let enabled = 0;
          for (const table of tables) {
            const tableFqn = String(table.identifier ?? "").toLowerCase();
            const colConfigs = (table.column_configs ?? []) as SpaceJson[];
            for (const col of colConfigs) {
              const colName = String(col.column_name ?? col.name ?? "").toLowerCase();
              const key = `${tableFqn}.${colName}`;
              if (entityCandidateColumns.has(key) && !col.enable_entity_matching) {
                col.enable_entity_matching = true;
                enabled++;
              }
            }
          }

          if (enabled > 0) {
            changes.push({
              section: "data_sources.tables.column_configs",
              description: `Entity matching: enabled on ${enabled} candidate column${enabled !== 1 ? "s" : ""}`,
              added: enabled,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        case "sample_questions": {
          const existing = (space.config?.sample_questions ?? []) as SpaceJson[];
          const existingTexts = new Set(
            existing.map((q: SpaceJson) =>
              (Array.isArray(q.question)
                ? String(q.question[0] ?? "")
                : String(q.question ?? "")
              ).toLowerCase(),
            ),
          );
          const generated = await generateSmartSampleQuestions(spaceCtx, tableFqns, fastEndpoint);
          const newQuestions = generated.filter((q) => !existingTexts.has(q.toLowerCase()));

          if (newQuestions.length > 0) {
            space.config = space.config ?? {};
            space.config.sample_questions = [
              ...existing,
              ...newQuestions.map((q: string) => ({
                id: crypto.randomUUID().replace(/-/g, ""),
                question: [q],
              })),
            ];
            changes.push({
              section: "config.sample_questions",
              description: `Sample questions: generated ${newQuestions.length} contextual sample question${newQuestions.length !== 1 ? "s" : ""}`,
              added: newQuestions.length,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        default:
          logger.warn("Unknown fix strategy", { strategy });
      }
    } catch (err) {
      logger.error("Fix strategy execution failed", { strategy, error: String(err) });
      changes.push({
        section: strategy,
        description: `Failed: ${err instanceof Error ? err.message : String(err)}`,
        added: 0,
        modified: 0,
      });
    }
  }

  return { updatedSpace: space, changes, strategiesRun };
}

/**
 * Infer a brief table description from the table name and column names.
 * Deterministic heuristic -- no LLM call.
 */
function inferTableDescription(tableName: string, columnNames: string[]): string | null {
  const readable = tableName.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const colSummary = columnNames.slice(0, 8).join(", ");
  if (!colSummary) return null;
  return `${readable} table containing ${colSummary}`;
}

/**
 * Generate user-friendly sample questions using the fast LLM endpoint,
 * informed by the space's title, tables, and existing example SQLs.
 */
async function generateSmartSampleQuestions(
  ctx: SpaceContext,
  tableFqns: string[],
  endpoint: string,
): Promise<string[]> {
  const tableNames = tableFqns.map((f) => f.split(".").pop() ?? f).join(", ");
  const existingExamples = ctx.existingExampleQuestions.slice(0, 5).join("\n- ");

  const sqSkills = resolveForGeniePass("exampleQueries", { contextBudget: 1000 });
  const sqSkillBlock = formatContextSections(sqSkills.contextSections);

  const prompt = `Generate 3 short, user-friendly sample questions for a data exploration space.
Space: "${ctx.title || "Data Space"}"${ctx.description ? ` -- ${ctx.description}` : ""}
Tables: ${tableNames || "various tables"}
${existingExamples ? `Existing example questions (generate DIFFERENT ones):\n- ${existingExamples}` : ""}
${sqSkillBlock ? `\n### Question Style Guidelines\n${sqSkillBlock}\n` : ""}
Return ONLY a JSON array of 3 question strings. Keep them simple and conversational.`;

  try {
    const result = await chatCompletion({
      endpoint,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      maxTokens: 300,
      responseFormat: "json_object",
    });
    const parsed = JSON.parse(result.content ?? "[]");
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions ?? []);
    return questions
      .filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 5)
      .slice(0, 3);
  } catch (err) {
    logger.warn("Smart sample question generation failed, skipping", { error: String(err) });
    return [];
  }
}

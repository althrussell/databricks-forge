/**
 * Space Fixer -- maps health check failures to Genie Engine passes,
 * builds MetadataSnapshot for off-platform spaces, and merges improvements.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { getServingEndpoint, getFastServingEndpoint } from "@/lib/dbx/client";
import { buildSchemaAllowlist } from "@/lib/genie/schema-allowlist";
import { extractEntityCandidatesFromSchema } from "@/lib/genie/entity-extraction";
import { defaultGenieEngineConfig } from "@/lib/genie/types";
import { resolveRegistry } from "@/lib/genie/health-checks/registry";
import { logger } from "@/lib/logger";
import type { MetadataSnapshot, TableInfo, ColumnInfo } from "@/lib/domain/types";
import type { FixStrategy } from "@/lib/genie/health-checks/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SpaceJson = Record<string, any>;

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
      logger.warn({ fqn, error: String(err) }, "Failed to query columns for off-platform space table");
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

  for (const [strategy, checkIds] of strategies) {
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
          const tables = (space.data_sources?.tables ?? []) as SpaceJson[];
          for (const enrichment of output.enrichments) {
            const table = tables.find((t: SpaceJson) =>
              (t.identifier as string)?.toLowerCase() === enrichment.tableFqn?.toLowerCase(),
            );
            if (!table) continue;
            const colConfigs = (table.column_configs ?? []) as SpaceJson[];
            for (const col of colConfigs) {
              const matching = output.enrichments.find(
                (e) => e.tableFqn?.toLowerCase() === (table.identifier as string)?.toLowerCase(),
              );
              if (!matching) continue;
              if (!col.description || (Array.isArray(col.description) && col.description.length === 0)) {
                col.description = [enrichment.description ?? ""];
                descriptionsAdded++;
              }
              if (!col.synonyms || (Array.isArray(col.synonyms) && col.synonyms.length === 0)) {
                if (enrichment.synonyms && enrichment.synonyms.length > 0) {
                  col.synonyms = enrichment.synonyms;
                  synonymsAdded++;
                }
              }
            }
          }

          changes.push({
            section: "data_sources.tables.column_configs",
            description: "Column intelligence: added descriptions and synonyms",
            added: descriptionsAdded + synonymsAdded,
            modified: 0,
          });
          strategiesRun.push(strategy);
          break;
        }

        case "semantic_expressions": {
          const { runSemanticExpressions } = await import("@/lib/genie/passes/semantic-expressions");
          const output = await runSemanticExpressions({
            tableFqns,
            metadata,
            allowlist,
            useCases: [],
            businessContext: null,
            config,
            endpoint,
          });

          const snippets = space.instructions?.sql_snippets ?? {};
          const existingMeasureIds = new Set((snippets.measures ?? []).map((m: SpaceJson) => m.alias));
          const newMeasures = output.measures.filter((m) => !existingMeasureIds.has(m.alias));
          if (newMeasures.length > 0) {
            snippets.measures = [...(snippets.measures ?? []), ...newMeasures.map((m) => ({
              id: crypto.randomUUID().replace(/-/g, ""),
              alias: m.alias,
              sql: [m.sql],
              display_name: m.displayName ?? m.alias,
              synonyms: m.synonyms ?? [],
            }))];
          }

          const existingFilterIds = new Set((snippets.filters ?? []).map((f: SpaceJson) => f.display_name));
          const newFilters = output.filters.filter((f) => !existingFilterIds.has(f.displayName));
          if (newFilters.length > 0) {
            snippets.filters = [...(snippets.filters ?? []), ...newFilters.map((f) => ({
              id: crypto.randomUUID().replace(/-/g, ""),
              sql: [f.sql],
              display_name: f.displayName ?? "",
              synonyms: f.synonyms ?? [],
            }))];
          }

          space.instructions = space.instructions ?? {};
          space.instructions.sql_snippets = snippets;

          changes.push({
            section: "instructions.sql_snippets",
            description: "Semantic expressions: added measures, filters, and expressions",
            added: newMeasures.length + newFilters.length,
            modified: 0,
          });
          strategiesRun.push(strategy);
          break;
        }

        case "join_inference": {
          const { runJoinInference } = await import("@/lib/genie/passes/join-inference");
          const existingJoins = (space.instructions?.join_specs ?? []) as SpaceJson[];
          const existingJoinKeys = new Set(
            existingJoins.map((j: SpaceJson) =>
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

          space.instructions = space.instructions ?? {};
          space.instructions.join_specs = [...existingJoins, ...newJoins];

          changes.push({
            section: "instructions.join_specs",
            description: "Join inference: added join specifications",
            added: newJoins.length,
            modified: 0,
          });
          strategiesRun.push(strategy);
          break;
        }

        case "trusted_assets": {
          const entityCandidates = extractEntityCandidatesFromSchema(
            metadata.columns.map((c) => ({ tableFqn: c.tableFqn, columnName: c.columnName, dataType: c.dataType })),
            tableFqns,
          );
          const joinSpecs = ((space.instructions?.join_specs ?? []) as SpaceJson[]).map((j: SpaceJson) => ({
            leftTable: j.left?.identifier ?? "",
            rightTable: j.right?.identifier ?? "",
            sql: Array.isArray(j.sql) ? j.sql.join(" ") : String(j.sql ?? ""),
            relationshipType: "many_to_one",
          }));

          const { runTrustedAssetAuthoring } = await import("@/lib/genie/passes/trusted-assets");
          const output = await runTrustedAssetAuthoring({
            tableFqns,
            metadata,
            allowlist,
            useCases: [],
            entityCandidates,
            joinSpecs,
            endpoint,
          });

          const existingQuestions = new Set(
            ((space.instructions?.example_question_sqls ?? []) as SpaceJson[]).map(
              (e: SpaceJson) => (Array.isArray(e.question) ? e.question[0] : String(e.question ?? "")).toLowerCase(),
            ),
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
          }

          changes.push({
            section: "instructions.example_question_sqls",
            description: "Trusted assets: added example question-SQL pairs",
            added: newQueries.length,
            modified: 0,
          });
          strategiesRun.push(strategy);
          break;
        }

        case "instruction_generation": {
          const { runInstructionGeneration } = await import("@/lib/genie/passes/instruction-generation");
          const output = await runInstructionGeneration({
            domain: "general",
            subdomains: [],
            businessName: "",
            businessContext: null,
            config,
            entityCandidates: [],
            joinSpecs: [],
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
          }

          changes.push({
            section: "instructions.text_instructions",
            description: "Instruction generation: added text instructions",
            added: output.instructions.length,
            modified: 0,
          });
          strategiesRun.push(strategy);
          break;
        }

        case "benchmark_generation": {
          const entityCandidates = extractEntityCandidatesFromSchema(
            metadata.columns.map((c) => ({ tableFqn: c.tableFqn, columnName: c.columnName, dataType: c.dataType })),
            tableFqns,
          );
          const joinSpecs = ((space.instructions?.join_specs ?? []) as SpaceJson[]).map((j: SpaceJson) => ({
            leftTable: j.left?.identifier ?? "",
            rightTable: j.right?.identifier ?? "",
            sql: Array.isArray(j.sql) ? j.sql.join(" ") : String(j.sql ?? ""),
            relationshipType: "many_to_one",
          }));

          const { runBenchmarkGeneration } = await import("@/lib/genie/passes/benchmark-generation");
          const output = await runBenchmarkGeneration({
            tableFqns,
            metadata,
            allowlist,
            useCases: [],
            entityCandidates,
            customerBenchmarks: [],
            joinSpecs,
            endpoint,
          });

          if (output.benchmarks.length > 0) {
            space.benchmarks = space.benchmarks ?? { questions: [] };
            const existing = new Set(
              (space.benchmarks.questions ?? []).map(
                (q: SpaceJson) => (Array.isArray(q.question) ? q.question[0] : String(q.question ?? "")).toLowerCase(),
              ),
            );
            const newBenchmarks = output.benchmarks.filter(
              (b) => !existing.has(b.question.toLowerCase()),
            );
            space.benchmarks.questions = [
              ...(space.benchmarks.questions ?? []),
              ...newBenchmarks.map((b) => ({
                id: crypto.randomUUID().replace(/-/g, ""),
                question: [b.question],
                ...(b.expectedSql ? { answer: [{ format: "sql", content: [b.expectedSql] }] } : {}),
              })),
            ];
          }

          changes.push({
            section: "benchmarks.questions",
            description: "Benchmark generation: added benchmark questions",
            added: output.benchmarks.length,
            modified: 0,
          });
          strategiesRun.push(strategy);
          break;
        }

        case "entity_matching": {
          const tables = (space.data_sources?.tables ?? []) as SpaceJson[];
          let enabled = 0;
          for (const table of tables) {
            const colConfigs = (table.column_configs ?? []) as SpaceJson[];
            for (const col of colConfigs) {
              const dataType = String(col.data_type ?? col.type ?? "").toLowerCase();
              if (dataType.includes("string") || dataType.includes("varchar") || dataType.includes("char")) {
                if (!col.enable_entity_matching) {
                  col.enable_entity_matching = true;
                  enabled++;
                }
              }
            }
          }

          changes.push({
            section: "data_sources.tables.column_configs",
            description: "Entity matching: enabled on string columns",
            added: enabled,
            modified: 0,
          });
          strategiesRun.push(strategy);
          break;
        }

        case "sample_questions": {
          const existingExamples = (space.instructions?.example_question_sqls ?? []) as SpaceJson[];
          if (existingExamples.length > 0) {
            const questions = existingExamples.slice(0, 3).map((e: SpaceJson) =>
              Array.isArray(e.question) ? e.question[0] : String(e.question ?? ""),
            );
            space.config = space.config ?? {};
            space.config.sample_questions = [
              ...(space.config.sample_questions ?? []),
              ...questions.map((q: string) => ({
                id: crypto.randomUUID().replace(/-/g, ""),
                question: [q],
              })),
            ];
            changes.push({
              section: "config.sample_questions",
              description: "Sample questions: generated from existing example SQLs",
              added: questions.length,
              modified: 0,
            });
          }
          strategiesRun.push(strategy);
          break;
        }

        default:
          logger.warn({ strategy, checkIds }, "Unknown fix strategy");
      }
    } catch (err) {
      logger.error({ strategy, error: String(err) }, "Fix strategy execution failed");
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

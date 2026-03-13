/**
 * Data Engine -- generates demo data in Unity Catalog.
 *
 * Orchestrates 5 passes: narrative design, schema design, seed generation,
 * fact generation, and validation. Tables are written directly to managed
 * Delta tables via the SQL Statement Execution API.
 */

import { createScopedLogger } from "@/lib/logger";
import { databricksLLMClient } from "@/lib/ports/defaults/databricks-llm-client";
import { databricksSqlExecutor } from "@/lib/ports/defaults/databricks-sql-executor";
import { reviewAndFixSql as sqlReviewerReviewAndFix } from "@/lib/ai/sql-reviewer";
import { mapWithConcurrency } from "@/lib/toolkit/concurrency";
import type { DataEngineInput, DataEngineResult, TableResult } from "./types";
import type { TableDesign, DataNarrative, TablePhase } from "../types";

/** Adapter: sql-reviewer returns ReviewResult; seed/fact passes expect (sql, error, context) => Promise<string>. */
function adaptReviewAndFixSql(
  sql: string,
  error: string,
  context?: string,
): Promise<string> {
  return sqlReviewerReviewAndFix(sql, { schemaContext: context }).then(
    (r) => r.fixedSql ?? sql,
  );
}

import { runNarrativeDesign } from "./passes/narrative-design";
import { runSchemaDesign } from "./passes/schema-design";
import { runSeedGeneration } from "./passes/seed-generation";
import { runFactGeneration } from "./passes/fact-generation";
import { runValidation } from "./passes/validation";

export class DataEngineCancelledError extends Error {
  constructor() {
    super("Data generation was cancelled");
    this.name = "DataEngineCancelledError";
  }
}

const TABLE_CONCURRENCY = 2;

export async function runDataEngine(
  input: DataEngineInput,
): Promise<DataEngineResult> {
  const startTime = Date.now();
  const llm = input.deps?.llm ?? databricksLLMClient;
  const sql = input.deps?.sql ?? databricksSqlExecutor;
  const log = input.deps?.logger ?? createScopedLogger({ origin: "DataEngine", module: "demo/data-engine" });
  const reviewFn = input.deps?.reviewAndFixSql ?? adaptReviewAndFixSql;
  const signal = input.signal;

  const progress = (msg: string, pct: number) => input.onProgress?.(msg, pct);

  log.info("Starting data engine", {
    sessionId: input.sessionId,
    catalog: input.catalog,
    schema: input.schema,
    targetRows: input.targetRowCount,
  });

  // =======================================================================
  // Pass 0: Narrative Design
  // =======================================================================
  progress("Designing data narratives...", 5);
  checkCancelled(signal);

  const narrativeResult = await runNarrativeDesign(
    input.research,
    input.targetRowCount,
    { llm, logger: log, signal },
  );

  const narratives: DataNarrative[] = narrativeResult.narratives.map((n) => ({
    title: n.title,
    description: n.description,
    affectedTables: n.affectedTables,
    pattern: n.pattern,
  }));

  // =======================================================================
  // Pass 1: Schema Design
  // =======================================================================
  progress("Designing table schema...", 15);
  checkCancelled(signal);

  const tables = await runSchemaDesign(
    input.research,
    narratives,
    input.targetRowCount,
    { llm, logger: log, signal },
  );

  input.onTablesReady?.(tables);

  // Create schema if it doesn't exist
  try {
    await sql.execute(
      `CREATE SCHEMA IF NOT EXISTS \`${input.catalog}\`.\`${input.schema}\``,
    );
  } catch (err) {
    log.error("Failed to create schema", { error: String(err) });
    throw err;
  }

  // =======================================================================
  // Pass 2: Seed Generation (dimension tables)
  // =======================================================================
  const dimensionTables = tables.filter((t) => t.tableType === "dimension");
  const factTables = tables.filter((t) => t.tableType === "fact");
  const tableResults: TableResult[] = [];
  const tableFqns: string[] = [];

  progress(`Generating ${dimensionTables.length} dimension tables...`, 25);

  for (const table of dimensionTables) {
    checkCancelled(signal);

    const onPhase = (phase: TablePhase) => input.onTablePhase?.(table.name, phase);
    const result = await runSeedGeneration(
      table,
      input.catalog,
      input.schema,
      {
        customerName: input.research.customerName,
        industryId: input.research.industryId,
        nomenclature: input.research.nomenclature,
        scope: input.research.scope,
      },
      { llm, sql, logger: log, signal, onPhase, reviewAndFixSql: reviewFn },
    );

    const fqn = `\`${input.catalog}\`.\`${input.schema}\`.\`${table.name}\``;
    tableFqns.push(fqn);
    tableResults.push({
      name: table.name,
      fqn,
      rowCount: result.rowCount,
      status: result.error ? "failed" : "completed",
      error: result.error,
      retryCount: 0,
    });
  }

  // =======================================================================
  // Pass 3: Fact Generation (fact/transaction tables -- bounded concurrency)
  // =======================================================================
  const completedDims = tableResults.filter((r) => r.status === "completed").length;
  progress(`Generating ${factTables.length} fact tables...`, 50);

  const factTasks = factTables.map((table: TableDesign) => async (): Promise<TableResult> => {
    checkCancelled(signal);

    const onPhase = (phase: TablePhase) => input.onTablePhase?.(table.name, phase);
    const result = await runFactGeneration(
      table,
      input.catalog,
      input.schema,
      dimensionTables,
      narratives,
      {
        customerName: input.research.customerName,
        industryId: input.research.industryId,
        nomenclature: input.research.nomenclature,
      },
      { llm, sql, logger: log, signal, onPhase, reviewAndFixSql: reviewFn },
    );

    const fqn = `\`${input.catalog}\`.\`${input.schema}\`.\`${table.name}\``;
    tableFqns.push(fqn);
    return {
      name: table.name,
      fqn,
      rowCount: result.rowCount,
      status: result.error ? "failed" : "completed",
      error: result.error,
      retryCount: 0,
    };
  });

  const factResults = await mapWithConcurrency(factTasks, TABLE_CONCURRENCY);
  tableResults.push(...factResults);

  // =======================================================================
  // Pass 4: Validation
  // =======================================================================
  progress("Validating generated data...", 90);

  const validationSummary = await runValidation(
    tables,
    input.catalog,
    input.schema,
    { sql, logger: log },
  );

  // =======================================================================
  // Result
  // =======================================================================
  const durationMs = Date.now() - startTime;

  const result: DataEngineResult = {
    sessionId: input.sessionId,
    catalog: input.catalog,
    schema: input.schema,
    tables: tableResults,
    narratives,
    designs: tables,
    totalRows: tableResults.reduce((sum, t) => sum + t.rowCount, 0),
    totalTables: tables.length,
    validationSummary,
    durationMs,
  };

  log.info("Data engine complete", {
    tables: result.totalTables,
    rows: result.totalRows,
    durationMs,
    failed: tableResults.filter((t) => t.status === "failed").length,
  });

  progress("Complete", 100);
  return result;
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DataEngineCancelledError();
}

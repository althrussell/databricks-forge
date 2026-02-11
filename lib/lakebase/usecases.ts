/**
 * CRUD operations for the inspire_use_cases Lakebase table.
 */

import { executeSQL, executeSQLMapped, type SqlColumn } from "@/lib/dbx/sql";
import { LAKEBASE_SCHEMA } from "./schema";
import type { UseCase, UseCaseType } from "@/lib/domain/types";

const TABLE = `${LAKEBASE_SCHEMA}.inspire_use_cases`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeSQL(value: string): string {
  return value.replace(/'/g, "''");
}

function rowToUseCase(row: string[], columns: SqlColumn[]): UseCase {
  const col = (name: string) => {
    const idx = columns.findIndex((c) => c.name === name);
    return idx >= 0 ? row[idx] : null;
  };

  let tablesInvolved: string[] = [];
  const tiRaw = col("tables_involved");
  if (tiRaw) {
    try {
      tablesInvolved = JSON.parse(tiRaw);
    } catch {
      tablesInvolved = tiRaw.split(",").map((s) => s.trim());
    }
  }

  return {
    id: col("id") ?? "",
    runId: col("run_id") ?? "",
    useCaseNo: parseInt(col("use_case_no") ?? "0", 10),
    name: col("name") ?? "",
    type: (col("type") as UseCaseType) ?? "AI",
    analyticsTechnique: col("analytics_technique") ?? "",
    statement: col("statement") ?? "",
    solution: col("solution") ?? "",
    businessValue: col("business_value") ?? "",
    beneficiary: col("beneficiary") ?? "",
    sponsor: col("sponsor") ?? "",
    domain: col("domain") ?? "",
    subdomain: col("subdomain") ?? "",
    tablesInvolved,
    priorityScore: parseFloat(col("priority_score") ?? "0"),
    feasibilityScore: parseFloat(col("feasibility_score") ?? "0"),
    impactScore: parseFloat(col("impact_score") ?? "0"),
    overallScore: parseFloat(col("overall_score") ?? "0"),
    sqlCode: col("sql_code") ?? null,
    sqlStatus: col("sql_status") ?? null,
  };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a batch of use cases for a given run.
 * Uses multi-row INSERT for efficiency.
 */
export async function insertUseCases(useCases: UseCase[]): Promise<void> {
  if (useCases.length === 0) return;

  // Batch in groups of 50 to stay within SQL size limits
  const BATCH_SIZE = 50;
  for (let i = 0; i < useCases.length; i += BATCH_SIZE) {
    const batch = useCases.slice(i, i + BATCH_SIZE);

    const values = batch
      .map(
        (uc) => `(
          '${escapeSQL(uc.id)}',
          '${escapeSQL(uc.runId)}',
          ${uc.useCaseNo},
          '${escapeSQL(uc.name)}',
          '${escapeSQL(uc.type)}',
          '${escapeSQL(uc.analyticsTechnique)}',
          '${escapeSQL(uc.statement)}',
          '${escapeSQL(uc.solution)}',
          '${escapeSQL(uc.businessValue)}',
          '${escapeSQL(uc.beneficiary)}',
          '${escapeSQL(uc.sponsor)}',
          '${escapeSQL(uc.domain)}',
          '${escapeSQL(uc.subdomain)}',
          '${escapeSQL(JSON.stringify(uc.tablesInvolved))}',
          ${uc.priorityScore},
          ${uc.feasibilityScore},
          ${uc.impactScore},
          ${uc.overallScore},
          ${uc.sqlCode ? `'${escapeSQL(uc.sqlCode)}'` : "NULL"},
          ${uc.sqlStatus ? `'${escapeSQL(uc.sqlStatus)}'` : "NULL"}
        )`
      )
      .join(",\n");

    const sql = `
      INSERT INTO ${TABLE}
        (id, run_id, use_case_no, name, type, analytics_technique,
         statement, solution, business_value, beneficiary, sponsor,
         domain, subdomain, tables_involved,
         priority_score, feasibility_score, impact_score, overall_score,
         sql_code, sql_status)
      VALUES ${values}
    `;

    await executeSQL(sql);
  }
}

/**
 * Get all use cases for a run, ordered by overall_score descending.
 */
export async function getUseCasesByRunId(runId: string): Promise<UseCase[]> {
  const sql = `
    SELECT * FROM ${TABLE}
    WHERE run_id = '${escapeSQL(runId)}'
    ORDER BY overall_score DESC, use_case_no ASC
  `;
  return executeSQLMapped(sql, rowToUseCase);
}

/**
 * Get use cases for a run filtered by domain.
 */
export async function getUseCasesByDomain(
  runId: string,
  domain: string
): Promise<UseCase[]> {
  const sql = `
    SELECT * FROM ${TABLE}
    WHERE run_id = '${escapeSQL(runId)}' AND domain = '${escapeSQL(domain)}'
    ORDER BY overall_score DESC
  `;
  return executeSQLMapped(sql, rowToUseCase);
}

/**
 * Get distinct domains for a run.
 */
export async function getDomainsForRun(runId: string): Promise<string[]> {
  const sql = `
    SELECT DISTINCT domain FROM ${TABLE}
    WHERE run_id = '${escapeSQL(runId)}'
    ORDER BY domain
  `;
  const result = await executeSQL(sql);
  return result.rows.map((r) => r[0]);
}

/**
 * Delete all use cases for a run (used when re-running).
 */
export async function deleteUseCasesForRun(runId: string): Promise<void> {
  const sql = `DELETE FROM ${TABLE} WHERE run_id = '${escapeSQL(runId)}'`;
  await executeSQL(sql);
}

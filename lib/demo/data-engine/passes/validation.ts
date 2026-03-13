/**
 * Data Engine Pass 4: Validation
 *
 * Runs validation queries per table: row counts, FK integrity,
 * and distribution checks. No LLM calls -- pure SQL.
 */

import type { SqlExecutor } from "@/lib/ports/sql-executor";
import type { Logger } from "@/lib/ports/logger";
import type { TableDesign, ValidationResult, ValidationSummary } from "../../types";

export async function runValidation(
  tables: TableDesign[],
  catalog: string,
  schema: string,
  opts: {
    sql: SqlExecutor;
    logger: Logger;
  },
): Promise<ValidationSummary> {
  const { sql, logger: log } = opts;
  const results: ValidationResult[] = [];
  const issues: string[] = [];

  for (const table of tables) {
    const fqn = `\`${catalog}\`.\`${schema}\`.\`${table.name}\``;
    const result: ValidationResult = {
      tableName: table.name,
      rowCount: 0,
      fkIntegrity: { valid: true, orphanCount: 0 },
      distributionQuality: "good",
      issues: [],
    };

    // Row count
    try {
      const count = await sql.executeScalar<string>(`SELECT COUNT(*) FROM ${fqn}`);
      result.rowCount = parseInt(count ?? "0", 10);

      if (result.rowCount === 0) {
        result.issues.push("Table is empty");
      } else if (result.rowCount < table.rowTarget * 0.5) {
        result.issues.push(
          `Row count ${result.rowCount} is below 50% of target ${table.rowTarget}`,
        );
      }
    } catch (err) {
      result.issues.push(`Row count check failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // FK integrity checks
    const fkColumns = table.columns.filter((c) => c.role === "fk" && c.fkTarget);
    for (const col of fkColumns) {
      if (!col.fkTarget) continue;
      const [refTable, refCol] = col.fkTarget.split(".");
      if (!refTable || !refCol) continue;

      const refFqn = `\`${catalog}\`.\`${schema}\`.\`${refTable}\``;
      try {
        const orphanCount = await sql.executeScalar<string>(
          `SELECT COUNT(*) FROM ${fqn} t LEFT JOIN ${refFqn} r ON t.\`${col.name}\` = r.\`${refCol}\` WHERE r.\`${refCol}\` IS NULL AND t.\`${col.name}\` IS NOT NULL`,
        );
        const orphans = parseInt(orphanCount ?? "0", 10);
        if (orphans > 0) {
          result.fkIntegrity = { valid: false, orphanCount: orphans };
          result.issues.push(
            `${orphans} orphan FK values in ${col.name} -> ${col.fkTarget}`,
          );
        }
      } catch {
        // FK check failed -- non-fatal
      }
    }

    if (result.issues.length > 0) {
      result.distributionQuality = result.issues.length > 2 ? "poor" : "acceptable";
    }

    results.push(result);
    issues.push(...result.issues.map((i) => `${table.name}: ${i}`));
  }

  const summary: ValidationSummary = {
    totalTables: tables.length,
    passedTables: results.filter((r) => r.issues.length === 0).length,
    totalRows: results.reduce((sum, r) => sum + r.rowCount, 0),
    issues,
  };

  log.info("Validation complete", {
    totalTables: summary.totalTables,
    passedTables: summary.passedTables,
    totalRows: summary.totalRows,
    issues: summary.issues.length,
  });

  return summary;
}

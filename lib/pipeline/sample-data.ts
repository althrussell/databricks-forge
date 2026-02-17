/**
 * Shared sample-data fetching for pipeline steps.
 *
 * Used by both use-case generation (Step 4) and SQL generation (Step 7) to
 * pull a small number of rows from each table and format them as markdown
 * for prompt injection. Helps the LLM understand actual data values, formats,
 * and cardinality.
 *
 * Gracefully falls back to metadata-only when the user lacks SELECT
 * permission on a table -- the table is skipped and a warning is logged.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";

export interface SampleDataResult {
  /** Formatted markdown section ready for prompt injection (empty string if nothing sampled) */
  markdown: string;
  /** Number of tables successfully sampled */
  tablesSampled: number;
  /** Number of tables skipped (permission errors, empty tables) */
  tablesSkipped: number;
  /** Total rows fetched across all tables */
  totalRows: number;
}

/**
 * Fetch sample rows from each table and format as markdown tables for
 * prompt injection. Returns both the formatted markdown and stats about
 * what was sampled.
 */
export async function fetchSampleData(
  tableFqns: string[],
  rowLimit: number
): Promise<SampleDataResult> {
  const sections: string[] = [
    "### SAMPLE DATA (real rows from the tables -- use this to understand data formats, values, and join keys)\n",
  ];

  let tablesSampled = 0;
  let tablesSkipped = 0;
  let totalRows = 0;

  const results = await Promise.allSettled(
    tableFqns.map(async (fqn) => {
      const cleanFqn = fqn.replace(/`/g, "");
      const result = await executeSQL(
        `SELECT * FROM \`${cleanFqn.split(".").join("\`.\`")}\` LIMIT ${rowLimit}`
      );

      if (!result.columns || result.columns.length === 0 || result.rows.length === 0) {
        return { fqn: cleanFqn, markdown: `**${cleanFqn}**: (empty table)\n`, rowCount: 0 };
      }

      const colNames = result.columns.map((c) => c.name);
      const header = `| ${colNames.join(" | ")} |`;
      const separator = `| ${colNames.map(() => "---").join(" | ")} |`;
      const rows = result.rows.map((row) => {
        const cells = row.map((val) => {
          if (val === null || val === undefined) return "NULL";
          const s = String(val);
          return s.length > 60 ? s.substring(0, 57) + "..." : s;
        });
        return `| ${cells.join(" | ")} |`;
      });

      const markdown = `**${cleanFqn}** (${result.rows.length} sample rows):\n${header}\n${separator}\n${rows.join("\n")}\n`;
      return { fqn: cleanFqn, markdown, rowCount: result.rows.length };
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      sections.push(r.value.markdown);
      if (r.value.rowCount > 0) {
        tablesSampled++;
        totalRows += r.value.rowCount;
      } else {
        tablesSkipped++;
      }
    } else {
      tablesSkipped++;
      const errMsg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      const isPermission =
        errMsg.includes("INSUFFICIENT_PERMISSIONS") ||
        errMsg.includes("does not have SELECT") ||
        errMsg.includes("ACCESS_DENIED");
      logger.warn("Data sampling failed for table, falling back to metadata only", {
        table: tableFqns[i],
        reason: isPermission ? "insufficient SELECT permission" : errMsg,
      });
    }
  }

  if (tablesSkipped > 0) {
    logger.info(
      `Data sampling: ${tablesSampled}/${tableFqns.length} tables sampled, ${tablesSkipped} skipped (falling back to metadata only for those)`
    );
  }

  return {
    markdown: sections.length > 1 ? sections.join("\n") : "",
    tablesSampled,
    tablesSkipped,
    totalRows,
  };
}

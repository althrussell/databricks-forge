/**
 * Probe system.information_schema access and fetch table/schema names
 * for industry detection.
 */

import { executeSQL, executeSQLMapped } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";
import type { ProbeResult } from "./types";

/**
 * Check whether the current principal can query system.information_schema,
 * then fetch the list of catalogs and a sample of table names.
 */
export async function probeSystemInformationSchema(): Promise<ProbeResult> {
  try {
    await executeSQL(
      "SELECT 1 FROM system.information_schema.catalogs LIMIT 1"
    );
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unknown error probing access";
    logger.warn("system.information_schema access denied", { error: msg });
    return {
      accessible: false,
      error: `Cannot access system.information_schema. Ensure the service principal has USE CATALOG and SELECT grants on the system catalog. (${msg})`,
    };
  }

  try {
    const catalogs = await executeSQLMapped<string>(
      "SELECT catalog_name FROM system.information_schema.catalogs ORDER BY catalog_name",
      (row) => row[0]
    );

    const tableRows = await executeSQLMapped<string>(
      `SELECT DISTINCT CONCAT(table_catalog, '.', table_schema, '.', table_name)
       FROM system.information_schema.tables
       LIMIT 2000`,
      (row) => row[0]
    );

    return {
      accessible: true,
      catalogs: catalogs.filter(
        (c) => c !== "system" && c !== "__databricks_internal"
      ),
      tableNames: tableRows,
    };
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "Unknown error fetching metadata";
    logger.error("Failed to fetch catalogs/tables from system IS", {
      error: msg,
    });
    return {
      accessible: true,
      catalogs: [],
      tableNames: [],
      error: `Access confirmed but failed to list catalogs: ${msg}`,
    };
  }
}

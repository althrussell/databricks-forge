/**
 * Databricks client configuration.
 *
 * Reads connection details from environment variables injected by
 * Databricks Apps at runtime, or from .env.local for local development.
 */

export interface DatabricksConfig {
  host: string;
  token: string;
  warehouseId: string;
}

let _config: DatabricksConfig | null = null;

/**
 * Returns the Databricks configuration, reading from env vars on first call.
 * Throws if required variables are missing.
 */
export function getConfig(): DatabricksConfig {
  if (_config) return _config;

  const host = process.env.DATABRICKS_HOST;
  const warehouseId = process.env.DATABRICKS_WAREHOUSE_ID;

  // Databricks Apps inject CLIENT_ID/SECRET for OAuth, or DATABRICKS_TOKEN for PAT.
  // For SQL Statement Execution API we need a bearer token.
  // In the Databricks Apps environment the SDK handles OAuth automatically,
  // but for direct REST calls we use the token if available.
  const token =
    process.env.DATABRICKS_TOKEN ??
    process.env.DATABRICKS_API_TOKEN ??
    "";

  if (!host) {
    throw new Error(
      "DATABRICKS_HOST is not set. Set it in .env.local or deploy as a Databricks App."
    );
  }
  if (!warehouseId) {
    throw new Error(
      "DATABRICKS_WAREHOUSE_ID is not set. Bind a SQL Warehouse as an app resource."
    );
  }

  _config = {
    host: host.replace(/\/+$/, ""), // strip trailing slashes
    token,
    warehouseId,
  };

  return _config;
}

/**
 * Returns standard headers for Databricks REST API calls.
 */
export function getHeaders(): Record<string, string> {
  const { token } = getConfig();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

import { describe, it, expect, vi } from "vitest";
import { validateDatasetSql, validateMetricViewSql } from "@/lib/dashboard/validation";

vi.mock("@/lib/dbx/sql", () => ({
  executeSQL: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { executeSQL } from "@/lib/dbx/sql";

const mockExecuteSQL = vi.mocked(executeSQL);

describe("validateDatasetSql", () => {
  it("returns null when EXPLAIN succeeds", async () => {
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [], totalRowCount: 0 });
    const result = await validateDatasetSql("SELECT 1", "test_ds");
    expect(result).toBeNull();
    expect(mockExecuteSQL).toHaveBeenCalledWith("EXPLAIN SELECT 1");
  });

  it("returns error message when EXPLAIN fails", async () => {
    mockExecuteSQL.mockRejectedValueOnce(new Error("UNRESOLVED_COLUMN: col_x"));
    const result = await validateDatasetSql("SELECT col_x FROM t", "test_ds");
    expect(result).toBe("UNRESOLVED_COLUMN: col_x");
  });

  it("handles non-Error exceptions", async () => {
    mockExecuteSQL.mockRejectedValueOnce("some string error");
    const result = await validateDatasetSql("SELECT 1", "test_ds");
    expect(result).toBe("some string error");
  });
});

// ---------------------------------------------------------------------------
// validateMetricViewSql
// ---------------------------------------------------------------------------

const MV_FQN = "retail_banking.demo_data.transaction_anomaly_metrics";
const mvFqns = new Set([MV_FQN]);
const mvMeasures = new Map([[MV_FQN, ["total_txn_amount", "total_txn_count", "avg_txn_amount"]]]);

describe("validateMetricViewSql", () => {
  it("returns valid when SQL does not reference a metric view", () => {
    const sql = "SELECT region, SUM(amount) FROM catalog.schema.orders GROUP BY region";
    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns valid for correct MEASURE() syntax with aliases and GROUP BY ALL", () => {
    const sql = [
      "SELECT transaction_date_day,",
      "  MEASURE(total_txn_amount) AS total_txn_amount,",
      "  MEASURE(total_txn_count) AS total_txn_count,",
      "  MEASURE(avg_txn_amount) AS avg_txn_amount",
      `FROM ${MV_FQN}`,
      "WHERE transaction_date_day IS NOT NULL",
      "GROUP BY ALL",
    ].join("\n");

    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("detects SELECT * on a metric view", () => {
    const sql = `SELECT * FROM ${MV_FQN}`;
    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.stringContaining("SELECT *"));
  });

  it("detects missing GROUP BY", () => {
    const sql = `SELECT MEASURE(total_txn_amount) AS total_txn_amount FROM ${MV_FQN}`;
    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.stringContaining("GROUP BY"));
  });

  it("detects bare measure references without MEASURE() wrapper", () => {
    const sql = [
      "SELECT tam.total_txn_amount, tam.total_txn_count",
      `FROM ${MV_FQN} AS tam`,
      "GROUP BY ALL",
    ].join("\n");

    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.includes("total_txn_amount"))).toBe(true);
  });

  it("detects MEASURE() calls missing AS alias", () => {
    const sql = [
      "SELECT MEASURE(total_txn_amount),",
      "  MEASURE(total_txn_count) AS total_txn_count",
      `FROM ${MV_FQN}`,
      "GROUP BY ALL",
    ].join("\n");

    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(false);
    expect(result.issues).toContainEqual(expect.stringContaining("missing AS alias"));
  });

  it("passes when all MEASURE() calls have AS aliases", () => {
    const sql = [
      "SELECT MEASURE(total_txn_amount) AS total_txn_amount,",
      "  MEASURE(total_txn_count) AS total_txn_count",
      `FROM ${MV_FQN}`,
      "GROUP BY ALL",
    ].join("\n");

    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(true);
  });

  it("handles case-insensitive FQN matching", () => {
    const sql = [
      "SELECT MEASURE(total_txn_amount) AS total_txn_amount",
      `FROM RETAIL_BANKING.DEMO_DATA.TRANSACTION_ANOMALY_METRICS`,
      "GROUP BY ALL",
    ].join("\n");

    const result = validateMetricViewSql(sql, mvFqns, mvMeasures);
    expect(result.valid).toBe(true);
  });
});

import { describe, it, expect, vi } from "vitest";
import { validateDatasetSql } from "@/lib/dashboard/validation";

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

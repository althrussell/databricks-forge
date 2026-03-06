import { describe, it, expect, vi, beforeEach } from "vitest";
import { walkLineage } from "@/lib/queries/lineage";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("walkLineage", () => {
  it("returns empty graph for no seed tables", async () => {
    const result = await walkLineage([]);
    expect(result.edges).toHaveLength(0);
    expect(result.discoveredTables).toHaveLength(0);
    expect(mockExecuteSQL).not.toHaveBeenCalled();
  });

  it("returns empty graph when lineage is not accessible", async () => {
    mockExecuteSQL.mockRejectedValueOnce(new Error("Table not found"));
    const result = await walkLineage(["catalog.schema.table1"]);
    expect(result.edges).toHaveLength(0);
    expect(result.discoveredTables).toHaveLength(0);
  });

  it("uses WITH RECURSIVE and returns edges", async () => {
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [["1"]], totalRowCount: 1 });

    mockExecuteSQL.mockResolvedValueOnce({
      columns: [],
      totalRowCount: 2,
      rows: [
        [
          "catalog.schema.source",
          "catalog.schema.table1",
          "TABLE",
          "TABLE",
          "TABLE",
          "2024-01-01",
          "5",
          "1",
        ],
        [
          "catalog.schema.table1",
          "catalog.schema.target",
          "TABLE",
          "TABLE",
          "TABLE",
          "2024-01-02",
          "3",
          "1",
        ],
      ],
    });

    const result = await walkLineage(["catalog.schema.table1"]);

    expect(result.edges).toHaveLength(2);
    expect(result.discoveredTables).toContain("catalog.schema.source");
    expect(result.discoveredTables).toContain("catalog.schema.target");

    // Verify only 2 SQL calls were made (accessibility + recursive CTE)
    expect(mockExecuteSQL).toHaveBeenCalledTimes(2);

    // Verify the recursive CTE was used
    const cteCall = mockExecuteSQL.mock.calls[1][0];
    expect(cteCall).toContain("WITH RECURSIVE");
    expect(cteCall).toContain("lineage_walk");
  });

  it("uses correct direction for upstream-only walk", async () => {
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [["1"]], totalRowCount: 1 });
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [], totalRowCount: 0 });

    await walkLineage(["catalog.schema.table1"], { direction: "upstream" });

    const cteCall = mockExecuteSQL.mock.calls[1][0];
    expect(cteCall).toContain("l.target_table_full_name IN");
    expect(cteCall).toContain("l.target_table_full_name = lw.source_fqn");
  });

  it("uses correct direction for downstream-only walk", async () => {
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [["1"]], totalRowCount: 1 });
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [], totalRowCount: 0 });

    await walkLineage(["catalog.schema.table1"], { direction: "downstream" });

    const cteCall = mockExecuteSQL.mock.calls[1][0];
    expect(cteCall).toContain("l.source_table_full_name IN");
    expect(cteCall).toContain("l.source_table_full_name = lw.target_fqn");
  });

  it("caps discovered tables at maxDiscoveredTables", async () => {
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [["1"]], totalRowCount: 1 });

    const manyEdges = Array.from({ length: 20 }, (_, i) => [
      `catalog.schema.src_${i}`,
      `catalog.schema.tgt_${i}`,
      "TABLE",
      "TABLE",
      "TABLE",
      "2024-01-01",
      "1",
      "1",
    ]);
    mockExecuteSQL.mockResolvedValueOnce({
      columns: [],
      rows: manyEdges,
      totalRowCount: manyEdges.length,
    });

    const result = await walkLineage(["catalog.schema.table1"], {
      maxDiscoveredTables: 5,
    });

    expect(result.discoveredTables.length).toBeLessThanOrEqual(5);
  });

  it("returns empty graph when recursive CTE fails", async () => {
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [["1"]], totalRowCount: 1 });
    mockExecuteSQL.mockRejectedValueOnce(new Error("WITH RECURSIVE not supported"));

    const result = await walkLineage(["catalog.schema.table1"]);
    expect(result.edges).toHaveLength(0);
    expect(result.discoveredTables).toHaveLength(0);
  });

  it("deduplicates edges", async () => {
    mockExecuteSQL.mockResolvedValueOnce({ columns: [], rows: [["1"]], totalRowCount: 1 });
    mockExecuteSQL.mockResolvedValueOnce({
      columns: [],
      totalRowCount: 2,
      rows: [
        ["catalog.schema.a", "catalog.schema.b", "TABLE", "TABLE", "TABLE", "2024-01-01", "5", "1"],
        ["catalog.schema.a", "catalog.schema.b", "TABLE", "TABLE", "TABLE", "2024-01-02", "3", "1"],
      ],
    });

    const result = await walkLineage(["catalog.schema.a"]);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].eventCount).toBe(5);
  });
});

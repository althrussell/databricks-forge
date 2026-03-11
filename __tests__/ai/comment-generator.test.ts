import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/dbx/client", () => ({
  getFastServingEndpoint: vi.fn(() => "test-endpoint"),
}));

vi.mock("@/lib/genie/llm-cache", () => ({
  cachedChatCompletion: vi.fn(),
}));

vi.mock("@/lib/genie/concurrency", () => ({
  mapWithConcurrency: vi.fn((tasks: Array<() => Promise<unknown>>, _concurrency: number) =>
    Promise.all(tasks.map((fn) => fn())),
  ),
}));

vi.mock("@/lib/genie/passes/parse-llm-json", () => ({
  parseLLMJson: vi.fn((raw: string) => JSON.parse(raw)),
}));

vi.mock("@/lib/queries/metadata", () => ({
  listColumns: vi.fn(),
  fetchTableComments: vi.fn(),
}));

vi.mock("@/lib/domain/industry-outcomes-server", () => ({
  buildIndustryContextPrompt: vi.fn(),
}));

vi.mock("@/lib/lakebase/comment-proposals", () => ({
  createProposals: vi.fn(),
}));

vi.mock("@/lib/lakebase/comment-jobs", () => ({
  updateCommentJobStatus: vi.fn(),
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { cachedChatCompletion } from "@/lib/genie/llm-cache";
import { listColumns, fetchTableComments } from "@/lib/queries/metadata";
import { buildIndustryContextPrompt } from "@/lib/domain/industry-outcomes-server";
import { createProposals } from "@/lib/lakebase/comment-proposals";
import { updateCommentJobStatus } from "@/lib/lakebase/comment-jobs";
import { generateComments, importFromScan } from "@/lib/ai/comment-generator";

const mockLLM = vi.mocked(cachedChatCompletion);
const mockListColumns = vi.mocked(listColumns);
const mockFetchComments = vi.mocked(fetchTableComments);
const mockIndustryPrompt = vi.mocked(buildIndustryContextPrompt);
const mockCreateProposals = vi.mocked(createProposals);
const mockUpdateStatus = vi.mocked(updateCommentJobStatus);

function llmResponse(content: string) {
  return {
    content,
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: "test-model",
    finishReason: "stop" as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateComments", () => {
  it("fetches metadata, calls LLM, and persists proposals", async () => {
    mockListColumns.mockResolvedValue([
      { tableFqn: "cat.sch.tbl1", columnName: "id", dataType: "INT", ordinalPosition: 1, isNullable: false, comment: null },
      { tableFqn: "cat.sch.tbl1", columnName: "name", dataType: "STRING", ordinalPosition: 2, isNullable: true, comment: "Customer name" },
    ]);
    mockFetchComments.mockResolvedValue(new Map());

    mockLLM.mockResolvedValueOnce(
      llmResponse(JSON.stringify([{ table_fqn: "cat.sch.tbl1", description: "Customer master table" }])),
    );
    mockLLM.mockResolvedValueOnce(
      llmResponse(JSON.stringify([
        { column_name: "id", description: "Unique customer identifier" },
        { column_name: "name", description: null },
      ])),
    );

    const result = await generateComments({
      jobId: "j1",
      catalogs: ["cat"],
      schemas: ["sch"],
    });

    expect(result.tableCount).toBe(1);
    expect(result.columnCount).toBe(1); // only "id" -- "name" had null description
    expect(mockCreateProposals).toHaveBeenCalledTimes(1);
    expect(mockUpdateStatus).toHaveBeenCalledWith("j1", "generating");
    expect(mockUpdateStatus).toHaveBeenCalledWith("j1", "ready", { tableCount: 1, columnCount: 1 });
  });

  it("returns zero counts when no tables found", async () => {
    mockListColumns.mockResolvedValue([]);
    mockFetchComments.mockResolvedValue(new Map());

    const result = await generateComments({
      jobId: "j1",
      catalogs: ["cat"],
    });

    expect(result.tableCount).toBe(0);
    expect(result.columnCount).toBe(0);
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it("filters by specific table FQNs", async () => {
    mockListColumns.mockResolvedValue([
      { tableFqn: "cat.sch.t1", columnName: "id", dataType: "INT", ordinalPosition: 1, isNullable: false, comment: null },
      { tableFqn: "cat.sch.t2", columnName: "id", dataType: "INT", ordinalPosition: 1, isNullable: false, comment: null },
    ]);
    mockFetchComments.mockResolvedValue(new Map());
    mockLLM.mockResolvedValue(
      llmResponse(JSON.stringify([{ table_fqn: "cat.sch.t1", description: "Table 1" }])),
    );

    const result = await generateComments({
      jobId: "j1",
      catalogs: ["cat"],
      schemas: ["sch"],
      tables: ["cat.sch.t1"],
    });

    // Only t1 should be processed, not t2
    expect(result.tableCount).toBe(1);
  });

  it("uses industry context when industryId provided", async () => {
    mockListColumns.mockResolvedValue([
      { tableFqn: "cat.sch.tbl", columnName: "id", dataType: "INT", ordinalPosition: 1, isNullable: false, comment: null },
    ]);
    mockFetchComments.mockResolvedValue(new Map());
    mockIndustryPrompt.mockResolvedValue("### INDUSTRY CONTEXT (Banking)");
    mockLLM.mockResolvedValue(
      llmResponse(JSON.stringify([{ table_fqn: "cat.sch.tbl", description: "Banking transactions" }])),
    );

    await generateComments({
      jobId: "j1",
      catalogs: ["cat"],
      industryId: "banking",
    });

    expect(mockIndustryPrompt).toHaveBeenCalledWith("banking");
    // Verify the prompt includes the industry context
    const callArgs = mockLLM.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain("Banking");
  });

  it("reports progress via callback", async () => {
    mockListColumns.mockResolvedValue([
      { tableFqn: "cat.sch.tbl", columnName: "id", dataType: "INT", ordinalPosition: 1, isNullable: false, comment: null },
    ]);
    mockFetchComments.mockResolvedValue(new Map());
    mockLLM.mockResolvedValue(llmResponse(JSON.stringify([])));

    const progress: Array<{ phase: string; pct: number }> = [];

    await generateComments({
      jobId: "j1",
      catalogs: ["cat"],
      onProgress: (phase, pct) => progress.push({ phase, pct }),
    });

    expect(progress.some((p) => p.phase === "metadata")).toBe(true);
    expect(progress.some((p) => p.phase === "tables")).toBe(true);
    expect(progress.some((p) => p.phase === "columns")).toBe(true);
  });

  it("skips catalogs with metadata errors and returns zero counts", async () => {
    mockListColumns.mockRejectedValue(new Error("Connection refused"));
    mockFetchComments.mockResolvedValue(new Map());

    const result = await generateComments({
      jobId: "j1",
      catalogs: ["cat"],
    });

    // Gracefully returns zero rather than crashing
    expect(result.tableCount).toBe(0);
    expect(result.columnCount).toBe(0);
    expect(mockLLM).not.toHaveBeenCalled();
  });

  it("continues when a table batch fails", async () => {
    mockListColumns.mockResolvedValue([
      { tableFqn: "cat.sch.tbl", columnName: "id", dataType: "INT", ordinalPosition: 1, isNullable: false, comment: null },
    ]);
    mockFetchComments.mockResolvedValue(new Map());
    // Table LLM fails
    mockLLM.mockRejectedValueOnce(new Error("LLM timeout"));
    mockLLM.mockResolvedValueOnce(llmResponse(JSON.stringify([])));

    const result = await generateComments({
      jobId: "j1",
      catalogs: ["cat"],
    });

    // Should not throw -- graceful degradation
    expect(result.tableCount).toBe(0);
  });
});

describe("importFromScan", () => {
  it("creates proposals from scan data", async () => {
    const result = await importFromScan("j1", [
      {
        tableFqn: "cat.sch.tbl1",
        comment: "Old comment",
        generatedDescription: "AI-generated description",
        columnsJson: null,
      },
      {
        tableFqn: "cat.sch.tbl2",
        comment: null,
        generatedDescription: null,
        columnsJson: null,
      },
    ]);

    expect(result.tableCount).toBe(1); // only tbl1 has a generated description
    expect(result.columnCount).toBe(0);
    expect(mockCreateProposals).toHaveBeenCalledWith("j1", [
      {
        tableFqn: "cat.sch.tbl1",
        columnName: null,
        originalComment: "Old comment",
        proposedComment: "AI-generated description",
      },
    ]);
  });

  it("handles empty scan data", async () => {
    const result = await importFromScan("j1", []);

    expect(result.tableCount).toBe(0);
    expect(mockCreateProposals).not.toHaveBeenCalled();
  });
});

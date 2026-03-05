import { describe, it, expect } from "vitest";
import {
  analyzeFeedbackForFixes,
  computePassRateDelta,
  type FeedbackEntry,
} from "@/lib/genie/benchmark-feedback";

describe("analyzeFeedbackForFixes", () => {
  it("returns empty for all-correct feedback", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: true },
      { question: "Q2", isCorrect: true },
    ];
    expect(analyzeFeedbackForFixes(feedback)).toHaveLength(0);
  });

  it("detects join issues from feedback text", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, feedbackText: "Missing join between orders and customers" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("join-specs-for-multi-table");
  });

  it("detects join issues from expected SQL", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, expectedSql: "SELECT * FROM a JOIN b ON a.id = b.id" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("join-specs-for-multi-table");
    expect(fixes).toContain("example-sqls-minimum");
  });

  it("detects time-based issues", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, feedbackText: "Wrong date period" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("filters-defined");
  });

  it("detects measure/aggregation issues", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, feedbackText: "Should use SUM not COUNT" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("measures-defined");
  });

  it("adds instruction improvement when 3+ failures", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false },
      { question: "Q2", isCorrect: false },
      { question: "Q3", isCorrect: false },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("text-instruction-exists");
  });

  it("falls back to general improvement for unspecified failures", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes.length).toBeGreaterThan(0);
    expect(fixes).toContain("measures-defined");
    expect(fixes).toContain("filters-defined");
    expect(fixes).toContain("example-sqls-minimum");
  });

  it("deduplicates check IDs", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, feedbackText: "join and date issue" },
      { question: "Q2", isCorrect: false, feedbackText: "wrong join" },
      { question: "Q3", isCorrect: false, feedbackText: "wrong time period" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    const unique = new Set(fixes);
    expect(fixes.length).toBe(unique.size);
  });

  it("detects multiple pattern types simultaneously", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, feedbackText: "join is wrong" },
      { question: "Q2", isCorrect: false, feedbackText: "date filter missing" },
      { question: "Q3", isCorrect: false, feedbackText: "sum calculation incorrect" },
      { question: "Q4", isCorrect: true },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("join-specs-for-multi-table");
    expect(fixes).toContain("filters-defined");
    expect(fixes).toContain("measures-defined");
    expect(fixes).toContain("text-instruction-exists");
  });
});

describe("computePassRateDelta", () => {
  it("computes positive improvement", () => {
    const delta = computePassRateDelta({ passed: 8, total: 10 }, { passed: 5, total: 10 });
    expect(delta).toBe(30);
  });

  it("computes negative decline", () => {
    const delta = computePassRateDelta({ passed: 3, total: 10 }, { passed: 7, total: 10 });
    expect(delta).toBe(-40);
  });

  it("handles zero total", () => {
    const delta = computePassRateDelta({ passed: 0, total: 0 }, { passed: 5, total: 10 });
    expect(delta).toBe(-50);
  });

  it("returns 0 for identical runs", () => {
    const delta = computePassRateDelta({ passed: 5, total: 10 }, { passed: 5, total: 10 });
    expect(delta).toBe(0);
  });
});

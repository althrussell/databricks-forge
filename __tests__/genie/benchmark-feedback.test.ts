import { describe, it, expect } from "vitest";
import {
  analyzeFeedbackForFixes,
  computePassRateDelta,
  summarizeFailureCategories,
  type FeedbackEntry,
} from "@/lib/genie/benchmark-feedback";
import type { FailureCategory } from "@/lib/genie/benchmark-runner";

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
      {
        question: "Q1",
        isCorrect: false,
        feedbackText: "Missing join between orders and customers",
      },
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
    const feedback: FeedbackEntry[] = [{ question: "Q1", isCorrect: false }];
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

describe("analyzeFeedbackForFixes -- failure category path (Tier 1)", () => {
  it("maps wrong_join to join-specs-for-multi-table", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, failureCategory: "wrong_join" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("join-specs-for-multi-table");
  });

  it("maps wrong_filter to filters-defined and text-instruction-exists", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, failureCategory: "wrong_filter" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("filters-defined");
    expect(fixes).toContain("text-instruction-exists");
  });

  it("maps wrong_aggregation to measures-defined", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, failureCategory: "wrong_aggregation" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("measures-defined");
  });

  it("maps wrong_column to descriptions and instructions", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, failureCategory: "wrong_column" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("columns-have-descriptions");
    expect(fixes).toContain("text-instruction-exists");
  });

  it("maps missing_data to filters and example-sqls", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, failureCategory: "missing_data" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("filters-defined");
    expect(fixes).toContain("example-sqls-minimum");
  });

  it("prefers failure categories over text heuristics", () => {
    const feedback: FeedbackEntry[] = [
      {
        question: "Q1",
        isCorrect: false,
        failureCategory: "wrong_join",
        feedbackText: "sum is wrong",
      },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("join-specs-for-multi-table");
    expect(fixes).not.toContain("measures-defined");
  });

  it("adds instruction-exists when 3+ categorized failures", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, failureCategory: "wrong_join" },
      { question: "Q2", isCorrect: false, failureCategory: "wrong_filter" },
      { question: "Q3", isCorrect: false, failureCategory: "wrong_aggregation" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("text-instruction-exists");
  });

  it("adds benchmarks-exist when 5+ categorized failures", () => {
    const feedback: FeedbackEntry[] = Array.from({ length: 5 }, (_, i) => ({
      question: `Q${i}`,
      isCorrect: false,
      failureCategory: "wrong_join" as FailureCategory,
    }));
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("benchmarks-exist");
  });

  it("deduplicates categories that map to the same check", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, failureCategory: "wrong_filter" },
      { question: "Q2", isCorrect: false, failureCategory: "missing_data" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    const unique = new Set(fixes);
    expect(fixes.length).toBe(unique.size);
  });

  it("falls back to heuristic when no failure categories present", () => {
    const feedback: FeedbackEntry[] = [
      { question: "Q1", isCorrect: false, feedbackText: "join is wrong" },
    ];
    const fixes = analyzeFeedbackForFixes(feedback);
    expect(fixes).toContain("join-specs-for-multi-table");
  });
});

describe("summarizeFailureCategories", () => {
  it("returns empty array for undefined input", () => {
    expect(summarizeFailureCategories(undefined)).toEqual([]);
  });

  it("formats category counts into readable strings", () => {
    const counts = { wrong_join: 3, wrong_filter: 1 } as Record<FailureCategory, number>;
    const summary = summarizeFailureCategories(counts);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toContain("Incorrect table joins");
    expect(summary[0]).toContain("3");
  });

  it("sorts by count descending", () => {
    const counts = {
      wrong_filter: 1,
      wrong_join: 5,
      wrong_aggregation: 3,
    } as Record<FailureCategory, number>;
    const summary = summarizeFailureCategories(counts);
    expect(summary[0]).toContain("5");
    expect(summary[1]).toContain("3");
    expect(summary[2]).toContain("1");
  });

  it("excludes zero-count categories", () => {
    const counts = { wrong_join: 2, wrong_filter: 0 } as Record<FailureCategory, number>;
    const summary = summarizeFailureCategories(counts);
    expect(summary).toHaveLength(1);
  });
});

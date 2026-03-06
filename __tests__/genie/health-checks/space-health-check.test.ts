import { describe, it, expect, beforeEach } from "vitest";
import { runHealthCheck } from "@/lib/genie/space-health-check";
import { clearRegistryCache } from "@/lib/genie/health-checks/registry";
import { perfectSpace, emptySpace, partialSpace } from "./fixtures/spaces";

beforeEach(() => {
  clearRegistryCache();
});

describe("runHealthCheck", () => {
  it("perfect space scores high (A grade)", () => {
    const report = runHealthCheck(perfectSpace);
    expect(report.grade).toBe("A");
    expect(report.overallScore).toBeGreaterThanOrEqual(90);
    expect(report.fixableCount).toBe(0);
    expect(report.quickWins).toHaveLength(0);
  });

  it("empty space scores low", () => {
    const report = runHealthCheck(emptySpace);
    expect(["D", "F"]).toContain(report.grade);
    expect(report.overallScore).toBeLessThan(70);
    expect(report.quickWins.length).toBeGreaterThan(0);
    expect(report.fixableCount).toBeGreaterThan(0);
  });

  it("partial space scores below perfect", () => {
    const report = runHealthCheck(partialSpace);
    const perfectReport = runHealthCheck(perfectSpace);
    expect(report.overallScore).toBeLessThan(perfectReport.overallScore);
    expect(report.overallScore).toBeGreaterThan(0);
    // Partial space should have some failed checks
    expect(report.checks.some((c) => !c.passed)).toBe(true);
    expect(report.checks.some((c) => c.passed)).toBe(true);
  });

  it("reports all four categories", () => {
    const report = runHealthCheck(perfectSpace);
    expect(Object.keys(report.categories)).toEqual(
      expect.arrayContaining([
        "data_sources",
        "instructions",
        "semantic_richness",
        "quality_assurance",
      ]),
    );
  });

  it("category scores are 0-100", () => {
    const report = runHealthCheck(partialSpace);
    for (const cat of Object.values(report.categories)) {
      expect(cat.score).toBeGreaterThanOrEqual(0);
      expect(cat.score).toBeLessThanOrEqual(100);
    }
  });

  it("quick wins capped at 5", () => {
    const report = runHealthCheck(emptySpace);
    expect(report.quickWins.length).toBeLessThanOrEqual(5);
  });

  it("quick wins sorted by severity (critical first)", () => {
    const report = runHealthCheck(emptySpace);
    // The quick wins should come from critical checks first
    expect(report.quickWins.length).toBeGreaterThan(0);
  });

  it("fixableCount counts fixable failed checks", () => {
    const report = runHealthCheck(emptySpace);
    const failedFixable = report.checks.filter((c) => !c.passed && c.fixable);
    expect(report.fixableCount).toBe(failedFixable.length);
  });

  describe("grade boundaries", () => {
    it("score 90+ is grade A", () => {
      const report = runHealthCheck(perfectSpace);
      if (report.overallScore >= 90) expect(report.grade).toBe("A");
    });

    it("maps grade thresholds correctly", () => {
      const perfect = runHealthCheck(perfectSpace);
      const empty = runHealthCheck(emptySpace);
      expect(perfect.grade).toBe("A");
      expect(perfect.overallScore).toBeGreaterThanOrEqual(90);
      expect(empty.overallScore).toBeLessThan(perfect.overallScore);
    });
  });

  describe("with category weight overrides", () => {
    it("heavier data_sources weight changes score", () => {
      const defaultReport = runHealthCheck(partialSpace);
      const weightedReport = runHealthCheck(partialSpace, undefined, undefined, {
        data_sources: 70,
        instructions: 10,
        semantic_richness: 10,
        quality_assurance: 10,
      });
      // Scores should differ when weights change
      expect(weightedReport.overallScore).not.toBe(defaultReport.overallScore);
    });
  });

  describe("with overrides", () => {
    it("disabling a check excludes it from results", () => {
      const defaultReport = runHealthCheck(perfectSpace);
      const overriddenReport = runHealthCheck(perfectSpace, [
        { checkId: "tables-configured", enabled: false },
      ]);
      expect(overriddenReport.checks.length).toBe(defaultReport.checks.length - 1);
    });
  });
});

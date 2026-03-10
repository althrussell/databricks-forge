import { describe, it, expect } from "vitest";
import {
  estimateCost,
  calculateRoi,
  getEffortLabel,
  getEffortOrder,
} from "@/lib/domain/cost-modeling";

describe("estimateCost", () => {
  it("returns correct cost range for XS effort", () => {
    const cost = estimateCost("xs");
    expect(cost.label).toBe("Extra Small");
    expect(cost.costUsd.low).toBeLessThan(cost.costUsd.mid);
    expect(cost.costUsd.mid).toBeLessThan(cost.costUsd.high);
    expect(cost.costUsd.low).toBeGreaterThan(0);
  });

  it("returns correct cost range for XL effort", () => {
    const cost = estimateCost("xl");
    expect(cost.label).toBe("Extra Large");
    expect(cost.costUsd.mid).toBeGreaterThan(100000);
  });

  it("cost scales with effort size", () => {
    const xs = estimateCost("xs");
    const s = estimateCost("s");
    const m = estimateCost("m");
    const l = estimateCost("l");
    const xl = estimateCost("xl");
    expect(xs.costUsd.mid).toBeLessThan(s.costUsd.mid);
    expect(s.costUsd.mid).toBeLessThan(m.costUsd.mid);
    expect(m.costUsd.mid).toBeLessThan(l.costUsd.mid);
    expect(l.costUsd.mid).toBeLessThan(xl.costUsd.mid);
  });

  it("includes duration weeks", () => {
    const cost = estimateCost("m");
    expect(cost.durationWeeks.low).toBeLessThan(cost.durationWeeks.mid);
    expect(cost.durationWeeks.mid).toBeLessThan(cost.durationWeeks.high);
  });
});

describe("calculateRoi", () => {
  it("computes positive ROI for high-value quick win", () => {
    const roi = calculateRoi(500_000, "xs");
    expect(roi.netRoi).toBeGreaterThan(0);
    expect(roi.roiPercent).toBeGreaterThan(100);
    expect(roi.paybackMonths).toBeLessThan(12);
  });

  it("computes lower ROI for expensive initiative", () => {
    const roi = calculateRoi(100_000, "xl");
    expect(roi.netRoi).toBeLessThan(0);
    expect(roi.roiPercent).toBeLessThan(0);
  });

  it("handles zero value gracefully", () => {
    const roi = calculateRoi(0, "m");
    expect(roi.netRoi).toBeLessThan(0);
    expect(roi.paybackMonths).toBeNull();
  });
});

describe("getEffortLabel", () => {
  it("returns human-readable labels", () => {
    expect(getEffortLabel("xs")).toBe("Extra Small");
    expect(getEffortLabel("m")).toBe("Medium");
    expect(getEffortLabel("xl")).toBe("Extra Large");
  });

  it("returns dash for null", () => {
    expect(getEffortLabel(null)).toBe("—");
  });
});

describe("getEffortOrder", () => {
  it("orders correctly", () => {
    expect(getEffortOrder("xs")).toBeLessThan(getEffortOrder("s"));
    expect(getEffortOrder("s")).toBeLessThan(getEffortOrder("m"));
    expect(getEffortOrder("l")).toBeLessThan(getEffortOrder("xl"));
  });
});

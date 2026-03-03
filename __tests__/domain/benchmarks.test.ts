import { describe, expect, it } from "vitest";
import {
  BenchmarkPackSchema,
  BenchmarkRecordSchema,
  computeBenchmarkFreshUntil,
  isPublicSourceUrl,
} from "@/lib/domain/benchmarks";

describe("benchmark provenance validation", () => {
  it("accepts valid benchmark records", () => {
    const parsed = BenchmarkRecordSchema.parse({
      kind: "kpi",
      title: "Net interest margin",
      summary: "Track NIM by segment with monthly drift monitoring.",
      source_type: "open_report",
      source_url: "https://www.mckinsey.com/industries/financial-services/our-insights",
      publisher: "McKinsey",
      license_class: "citation_required",
      confidence: 0.7,
      ttl_days: 365,
    });
    expect(parsed.title).toContain("interest");
  });

  it("enforces public-source allowlist", () => {
    expect(isPublicSourceUrl("https://docs.databricks.com/en/")).toBe(true);
    expect(isPublicSourceUrl("https://internal.example.local/doc")).toBe(false);
  });

  it("computes freshness window", () => {
    const freshUntil = computeBenchmarkFreshUntil(new Date("2026-01-01T00:00:00Z"), 30);
    expect(freshUntil.toISOString()).toContain("2026-01-31");
  });

  it("validates benchmark packs", () => {
    const parsed = BenchmarkPackSchema.parse({
      pack_id: "banking-baseline",
      industry: "banking",
      version: "2026.03",
      records: [
        {
          kind: "advisory_theme",
          title: "Boardroom defensibility",
          summary: "Tie each recommendation to measurable value and accountable sponsors.",
          source_type: "open_report",
          source_url: "https://www.mckinsey.com/",
          publisher: "McKinsey",
          license_class: "citation_required",
          confidence: 0.65,
          ttl_days: 365,
        },
      ],
    });
    expect(parsed.records).toHaveLength(1);
  });
});

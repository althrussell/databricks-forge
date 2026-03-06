import { describe, it, expect } from "vitest";
import { buildDashboardDesignPrompt } from "@/lib/dashboard/prompts";
import type { UseCase } from "@/lib/domain/types";

function makeUseCase(overrides?: Partial<UseCase>): UseCase {
  return {
    id: "uc-1",
    runId: "run-1",
    useCaseNo: 1,
    name: "Test Use Case",
    statement: "Analyse revenue by region",
    type: "Statistical",
    analyticsTechnique: "Dashboard",
    solution: "",
    businessValue: "",
    beneficiary: "",
    sponsor: "",
    domain: "Sales",
    subdomain: "",
    tablesInvolved: ["catalog.schema.orders"],
    sqlCode: "SELECT region, SUM(amount) FROM catalog.schema.orders GROUP BY region",
    priorityScore: 0.8,
    feasibilityScore: 0.8,
    impactScore: 0.8,
    overallScore: 0.8,
    userPriorityScore: null,
    userFeasibilityScore: null,
    userImpactScore: null,
    userOverallScore: null,
    sqlStatus: null,
    feedback: null,
    feedbackAt: null,
    enrichmentTags: null,
    ...overrides,
  };
}

describe("buildDashboardDesignPrompt", () => {
  it("includes filter widget types in the output schema", () => {
    const prompt = buildDashboardDesignPrompt({
      businessName: "Test Corp",
      businessContext: null,
      domain: "Sales",
      subdomains: [],
      useCases: [makeUseCase()],
      tables: ["catalog.schema.orders"],
      columnSchemas: ["catalog.schema.orders: region (STRING), amount (DECIMAL)"],
    });

    expect(prompt).toContain("filter-multi-select");
    expect(prompt).toContain("filter-single-select");
    expect(prompt).toContain("filter-date-range-picker");
  });

  it("includes filter instructions section", () => {
    const prompt = buildDashboardDesignPrompt({
      businessName: "Test Corp",
      businessContext: null,
      domain: "Sales",
      subdomains: [],
      useCases: [makeUseCase()],
      tables: ["catalog.schema.orders"],
      columnSchemas: [],
    });

    expect(prompt).toContain("Filter widgets");
    expect(prompt).toContain('role: "filter"');
  });

  it("includes filter candidates when provided", () => {
    const prompt = buildDashboardDesignPrompt({
      businessName: "Test Corp",
      businessContext: null,
      domain: "Sales",
      subdomains: [],
      useCases: [makeUseCase()],
      tables: ["catalog.schema.orders"],
      columnSchemas: [],
      filterCandidates: [
        {
          name: "order_date",
          column: "order_date",
          tableFqn: "catalog.schema.orders",
          dataType: "DATE",
        },
      ],
    });

    expect(prompt).toContain("## Filter Candidates");
    expect(prompt).toContain("order_date");
  });

  it("includes metric view section with MEASURE() instructions when provided", () => {
    const prompt = buildDashboardDesignPrompt({
      businessName: "Test Corp",
      businessContext: null,
      domain: "Sales",
      subdomains: [],
      useCases: [makeUseCase()],
      tables: ["catalog.schema.orders"],
      columnSchemas: [],
      metricViews: [
        {
          fqn: "catalog.schema.orders_metrics",
          name: "orders_metrics",
          description: "Order KPIs",
          dimensions: [{ name: "Order Month", expr: "DATE_TRUNC('MONTH', order_date)" }],
          measures: [{ name: "Total Revenue", expr: "SUM(total_price)" }],
        },
      ],
    });

    expect(prompt).toContain("## Metric Views (Governed KPIs)");
    expect(prompt).toContain("MEASURE()");
    expect(prompt).toContain("catalog.schema.orders_metrics");
    expect(prompt).toContain("Total Revenue");
    expect(prompt).toContain("Order Month");
  });

  it("does not include metric view section when none provided", () => {
    const prompt = buildDashboardDesignPrompt({
      businessName: "Test Corp",
      businessContext: null,
      domain: "Sales",
      subdomains: [],
      useCases: [makeUseCase()],
      tables: ["catalog.schema.orders"],
      columnSchemas: [],
    });

    expect(prompt).not.toContain("## Metric Views");
  });
});

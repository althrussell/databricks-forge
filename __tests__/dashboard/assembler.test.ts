import { describe, it, expect } from "vitest";
import { assembleLakeviewDashboard } from "@/lib/dashboard/assembler";
import type { DashboardDesign } from "@/lib/dashboard/types";

function makeMinimalDesign(overrides?: Partial<DashboardDesign>): DashboardDesign {
  return {
    title: "Test Dashboard",
    description: "Test description",
    datasets: [
      { name: "kpi_ds", displayName: "KPI", sql: "SELECT 1 AS total", purpose: "kpi" },
      { name: "trend_ds", displayName: "Trends", sql: "SELECT date, val FROM t", purpose: "trend" },
    ],
    widgets: [
      {
        type: "counter",
        title: "Total",
        datasetName: "kpi_ds",
        fields: [{ name: "total", expression: "`total`", role: "value" }],
      },
    ],
    ...overrides,
  };
}

describe("assembleLakeviewDashboard", () => {
  it("produces a single PAGE_TYPE_CANVAS page when no filters", () => {
    const result = assembleLakeviewDashboard(makeMinimalDesign());
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].pageType).toBe("PAGE_TYPE_CANVAS");
  });

  it("produces a PAGE_TYPE_GLOBAL_FILTERS page when filter widgets are present", () => {
    const design = makeMinimalDesign({
      widgets: [
        {
          type: "counter",
          title: "Total",
          datasetName: "kpi_ds",
          fields: [{ name: "total", expression: "`total`", role: "value" }],
        },
        {
          type: "filter-multi-select",
          title: "Region Filter",
          datasetName: "trend_ds",
          fields: [{ name: "region", expression: "`region`", role: "filter" }],
        },
      ],
    });

    const result = assembleLakeviewDashboard(design);
    expect(result.pages).toHaveLength(2);
    expect(result.pages[0].pageType).toBe("PAGE_TYPE_CANVAS");
    expect(result.pages[1].pageType).toBe("PAGE_TYPE_GLOBAL_FILTERS");
    expect(result.pages[1].name).toBe("filters");
  });

  it("filter widgets use spec version 2 and disaggregated: false", () => {
    const design = makeMinimalDesign({
      widgets: [
        {
          type: "filter-date-range-picker",
          title: "Date Range",
          datasetName: "trend_ds",
          fields: [{ name: "date", expression: "`date`", role: "filter" }],
        },
      ],
    });

    const result = assembleLakeviewDashboard(design);
    const filterPage = result.pages.find((p) => p.pageType === "PAGE_TYPE_GLOBAL_FILTERS");
    expect(filterPage).toBeDefined();

    const filterWidget = filterPage!.layout[0];
    expect(filterWidget.widget.spec?.version).toBe(2);
    expect(filterWidget.widget.spec?.widgetType).toBe("filter-date-range-picker");
    expect(filterWidget.widget.queries?.[0].query.disaggregated).toBe(false);
  });

  it("filter widgets are NOT placed on the canvas page", () => {
    const design = makeMinimalDesign({
      widgets: [
        {
          type: "counter",
          title: "Total",
          datasetName: "kpi_ds",
          fields: [{ name: "total", expression: "`total`", role: "value" }],
        },
        {
          type: "filter-multi-select",
          title: "Status Filter",
          datasetName: "kpi_ds",
          fields: [{ name: "status", expression: "`status`", role: "filter" }],
        },
      ],
    });

    const result = assembleLakeviewDashboard(design);
    const canvasPage = result.pages[0];

    const filterWidgetsOnCanvas = canvasPage.layout.filter((w) =>
      w.widget.spec?.widgetType?.startsWith("filter-"),
    );
    expect(filterWidgetsOnCanvas).toHaveLength(0);
  });

  it("counters use disaggregated: false when filters reference their dataset", () => {
    const design = makeMinimalDesign({
      widgets: [
        {
          type: "counter",
          title: "Total Sales",
          datasetName: "trend_ds",
          fields: [{ name: "sum(val)", expression: "SUM(`val`)", role: "value" }],
        },
        {
          type: "filter-multi-select",
          title: "Date Filter",
          datasetName: "trend_ds",
          fields: [{ name: "date", expression: "`date`", role: "filter" }],
        },
      ],
    });

    const result = assembleLakeviewDashboard(design);
    const canvasPage = result.pages[0];
    const counterWidget = canvasPage.layout.find((w) => w.widget.spec?.widgetType === "counter");
    expect(counterWidget).toBeDefined();
    expect(counterWidget!.widget.queries?.[0].query.disaggregated).toBe(false);
  });

  it("counters use disaggregated: true when no filters reference their dataset", () => {
    const result = assembleLakeviewDashboard(makeMinimalDesign());
    const canvasPage = result.pages[0];
    const counterWidget = canvasPage.layout.find((w) => w.widget.spec?.widgetType === "counter");
    expect(counterWidget).toBeDefined();
    expect(counterWidget!.widget.queries?.[0].query.disaggregated).toBe(true);
  });

  it("6-column grid has no gaps in counter rows", () => {
    const design = makeMinimalDesign({
      widgets: [
        {
          type: "counter",
          title: "A",
          datasetName: "kpi_ds",
          fields: [{ name: "a", expression: "`a`", role: "value" }],
        },
        {
          type: "counter",
          title: "B",
          datasetName: "kpi_ds",
          fields: [{ name: "b", expression: "`b`", role: "value" }],
        },
        {
          type: "counter",
          title: "C",
          datasetName: "kpi_ds",
          fields: [{ name: "c", expression: "`c`", role: "value" }],
        },
      ],
    });

    const result = assembleLakeviewDashboard(design);
    const canvasPage = result.pages[0];
    const counterWidgets = canvasPage.layout.filter((w) => w.widget.spec?.widgetType === "counter");

    expect(counterWidgets).toHaveLength(3);
    const totalWidth = counterWidgets.reduce((sum, w) => sum + w.position.width, 0);
    expect(totalWidth).toBe(6);
  });

  it("filter encoding has correct structure with queryName", () => {
    const design = makeMinimalDesign({
      widgets: [
        {
          type: "filter-single-select",
          title: "Category",
          datasetName: "trend_ds",
          fields: [{ name: "category", expression: "`category`", role: "filter" }],
        },
      ],
    });

    const result = assembleLakeviewDashboard(design);
    const filterPage = result.pages.find((p) => p.pageType === "PAGE_TYPE_GLOBAL_FILTERS");
    const filterWidget = filterPage!.layout[0];
    const encodings = filterWidget.widget.spec?.encodings as {
      fields: Array<{ fieldName: string; displayName: string; queryName: string }>;
    };

    expect(encodings.fields).toHaveLength(1);
    expect(encodings.fields[0].fieldName).toBe("category");
    expect(encodings.fields[0].queryName).toMatch(/^ds_trend_ds_/);
  });
});

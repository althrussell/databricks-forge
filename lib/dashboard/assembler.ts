/**
 * Lakeview Dashboard Assembler — converts a DashboardDesign (LLM output)
 * into the serialized Lakeview dashboard JSON format.
 *
 * Applies the 6-column grid layout rules, correct widget versions, and
 * proper field name matching deterministically (no LLM needed here).
 */

import type {
  DashboardDesign,
  WidgetDesign,
  SerializedLakeviewDashboard,
  LakeviewDataset,
  LakeviewPage,
  LakeviewWidget,
  LakeviewPosition,
  LakeviewWidgetQuery,
  LakeviewWidgetField,
  LakeviewWidgetSpec,
  DashboardRecommendation,
} from "./types";

const GRID_WIDTH = 6;

// Widget version requirements per the Lakeview spec
const WIDGET_VERSIONS: Record<string, number> = {
  counter: 2,
  table: 2,
  bar: 3,
  line: 3,
  pie: 3,
};

function sanitiseWidgetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function buildTextWidget(text: string, y: number): LakeviewWidget {
  return {
    widget: {
      name: sanitiseWidgetName(`text-${y}`),
      multilineTextboxSpec: { lines: [text] },
    },
    position: { x: 0, y, width: GRID_WIDTH, height: 1 },
  };
}

function buildCounterWidget(
  design: WidgetDesign,
  position: LakeviewPosition
): LakeviewWidget {
  const valueField = design.fields.find((f) => f.role === "value") ?? design.fields[0];
  if (!valueField) {
    throw new Error(`Counter widget "${design.title}" has no value field`);
  }

  const field: LakeviewWidgetField = {
    name: valueField.name,
    expression: valueField.expression,
  };

  const query: LakeviewWidgetQuery = {
    name: "main_query",
    query: {
      datasetName: design.datasetName,
      fields: [field],
      disaggregated: true,
    },
  };

  const spec: LakeviewWidgetSpec = {
    version: WIDGET_VERSIONS.counter,
    widgetType: "counter",
    encodings: {
      value: { fieldName: valueField.name, displayName: design.title },
    },
    frame: { showTitle: true, title: design.title },
  };

  return {
    widget: {
      name: sanitiseWidgetName(design.title),
      queries: [query],
      spec,
    },
    position,
  };
}

function buildChartWidget(
  design: WidgetDesign,
  position: LakeviewPosition
): LakeviewWidget {
  const fields: LakeviewWidgetField[] = design.fields.map((f) => ({
    name: f.name,
    expression: f.expression,
  }));

  const query: LakeviewWidgetQuery = {
    name: "main_query",
    query: {
      datasetName: design.datasetName,
      fields,
      disaggregated: true,
    },
  };

  const xField = design.fields.find((f) => f.role === "x");
  const yField = design.fields.find((f) => f.role === "y");
  const colorField = design.fields.find((f) => f.role === "color");

  const xScaleType = xField?.expression.includes("DATE_TRUNC") ? "temporal" : "categorical";

  const encodings: Record<string, unknown> = {};

  if (design.type === "pie") {
    const angleField = yField ?? design.fields[0];
    const catField = colorField ?? xField ?? design.fields[1];
    encodings.angle = {
      fieldName: angleField?.name ?? "value",
      scale: { type: "quantitative" },
      displayName: angleField?.name ?? "Value",
    };
    encodings.color = {
      fieldName: catField?.name ?? "category",
      scale: { type: "categorical" },
      displayName: catField?.name ?? "Category",
    };
  } else {
    if (xField) {
      encodings.x = {
        fieldName: xField.name,
        scale: { type: xScaleType as "temporal" | "quantitative" | "categorical" },
        displayName: xField.name,
      };
    }
    if (yField) {
      encodings.y = {
        fieldName: yField.name,
        scale: { type: "quantitative" },
        displayName: yField.name,
      };
    }
    if (colorField) {
      encodings.color = {
        fieldName: colorField.name,
        scale: { type: "categorical" },
        displayName: colorField.name,
      };
    }
  }

  const spec: LakeviewWidgetSpec = {
    version: WIDGET_VERSIONS[design.type] ?? 3,
    widgetType: design.type,
    encodings: encodings as unknown as LakeviewWidgetSpec["encodings"],
    frame: { showTitle: true, title: design.title },
  };

  return {
    widget: {
      name: sanitiseWidgetName(design.title),
      queries: [query],
      spec,
    },
    position,
  };
}

function buildTableWidget(
  design: WidgetDesign,
  position: LakeviewPosition
): LakeviewWidget {
  const fields: LakeviewWidgetField[] = design.fields.map((f) => ({
    name: f.name,
    expression: f.expression,
  }));

  const query: LakeviewWidgetQuery = {
    name: "main_query",
    query: {
      datasetName: design.datasetName,
      fields,
      disaggregated: true,
    },
  };

  const spec: LakeviewWidgetSpec = {
    version: WIDGET_VERSIONS.table,
    widgetType: "table",
    encodings: {
      columns: design.fields.map((f) => ({
        fieldName: f.name,
        displayName: f.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      })),
    } as LakeviewWidgetSpec["encodings"],
    frame: { showTitle: true, title: design.title },
  };

  return {
    widget: {
      name: sanitiseWidgetName(design.title),
      queries: [query],
      spec,
    },
    position,
  };
}

/**
 * Lay out widgets on the 6-column grid.
 *
 * Strategy:
 *  1. Title + subtitle text widgets (y=0, y=1)
 *  2. Counter widgets in rows of 3 (y=2)
 *  3. Section header "Trends" (y=5)
 *  4. Charts in rows of 2 (width=3 each, y=6)
 *  5. Section header "Breakdown" or "Details"
 *  6. Remaining charts/tables
 */
export function assembleLakeviewDashboard(
  design: DashboardDesign
): SerializedLakeviewDashboard {
  // Build datasets
  const datasets: LakeviewDataset[] = design.datasets.map((ds) => ({
    name: ds.name,
    displayName: ds.displayName,
    queryLines: ds.sql.split("\n").map((line) => line + " "),
  }));

  // Sort widgets by type for layout
  const counters = design.widgets.filter((w) => w.type === "counter");
  const charts = design.widgets.filter(
    (w) => w.type === "bar" || w.type === "line" || w.type === "pie"
  );
  const tables = design.widgets.filter((w) => w.type === "table");

  const layout: LakeviewWidget[] = [];
  let currentY = 0;

  // Title
  layout.push(buildTextWidget(`## ${design.title}`, currentY));
  currentY += 1;

  // Subtitle
  if (design.description) {
    layout.push(buildTextWidget(design.description, currentY));
    currentY += 1;
  }

  // KPI Counters (rows of 3)
  if (counters.length > 0) {
    const counterRows = [];
    for (let i = 0; i < counters.length; i += 3) {
      counterRows.push(counters.slice(i, i + 3));
    }

    for (const row of counterRows) {
      const counterWidth = Math.floor(GRID_WIDTH / Math.min(row.length, 3));
      let x = 0;
      for (const counter of row) {
        const width = x + counterWidth > GRID_WIDTH ? GRID_WIDTH - x : counterWidth;
        layout.push(
          buildCounterWidget(counter, { x, y: currentY, width, height: 3 })
        );
        x += width;
      }
      currentY += 3;
    }
  }

  // Charts section
  if (charts.length > 0) {
    layout.push(buildTextWidget("### Trends & Analysis", currentY));
    currentY += 1;

    for (let i = 0; i < charts.length; i += 2) {
      const pair = charts.slice(i, i + 2);
      if (pair.length === 2) {
        layout.push(
          buildChartWidget(pair[0], { x: 0, y: currentY, width: 3, height: 5 })
        );
        layout.push(
          buildChartWidget(pair[1], { x: 3, y: currentY, width: 3, height: 5 })
        );
      } else {
        layout.push(
          buildChartWidget(pair[0], { x: 0, y: currentY, width: GRID_WIDTH, height: 5 })
        );
      }
      currentY += 5;
    }
  }

  // Tables section
  if (tables.length > 0) {
    layout.push(buildTextWidget("### Details", currentY));
    currentY += 1;

    for (const table of tables) {
      layout.push(
        buildTableWidget(table, { x: 0, y: currentY, width: GRID_WIDTH, height: 6 })
      );
      currentY += 6;
    }
  }

  const page: LakeviewPage = {
    name: "overview",
    displayName: design.title,
    pageType: "PAGE_TYPE_CANVAS",
    layout,
  };

  return { datasets, pages: [page] };
}

/**
 * Build a DashboardRecommendation from a DashboardDesign + assembled dashboard.
 */
export function buildDashboardRecommendation(
  design: DashboardDesign,
  serializedDashboard: SerializedLakeviewDashboard,
  domain: string,
  subdomains: string[],
  businessName: string,
  useCaseIds: string[]
): DashboardRecommendation {
  const title = `${businessName} - ${domain} Dashboard`;
  const descParts: string[] = [
    `AI/BI dashboard for the ${domain} domain of ${businessName}.`,
  ];
  if (subdomains.length > 0) {
    descParts.push(`Covers: ${subdomains.join(", ")}.`);
  }
  descParts.push(
    `${design.datasets.length} datasets, ${design.widgets.length} visualisations.`
  );

  return {
    domain,
    subdomains,
    title,
    description: descParts.join(" "),
    datasetCount: design.datasets.length,
    widgetCount: design.widgets.length,
    useCaseIds,
    serializedDashboard: JSON.stringify(serializedDashboard),
    dashboardDesign: design,
  };
}

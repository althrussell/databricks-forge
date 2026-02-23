/**
 * Gap Report Excel export using exceljs.
 *
 * Generates a Databricks-branded .xlsx workbook with:
 * - Gap Summary sheet (overall coverage + aggregate missing data)
 * - Per-Priority Gaps sheet (each unmatched reference use case with data hints)
 */

import ExcelJS from "exceljs";
import type { CoverageResult } from "@/lib/domain/industry-coverage";

const DATABRICKS_BLUE = "FF003366";
const WHITE = "FFFFFFFF";
const LIGHT_GRAY_BG = "FFF9FAFB";
const BORDER_COLOR = "FFD1D5DB";
const AMBER_FILL = "FFFFF3E0";

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = {
    style: "thin",
    color: { argb: BORDER_COLOR },
  };
  return { top: side, bottom: side, left: side, right: side };
}

function styleHeaderRow(sheet: ExcelJS.Worksheet): void {
  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: WHITE }, size: 11 };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: DATABRICKS_BLUE },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = thinBorder();
  });
}

function styleDataRows(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number
): void {
  for (let r = startRow; r <= endRow; r++) {
    const row = sheet.getRow(r);
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: "top", wrapText: true };
      if (r % 2 === 0) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: LIGHT_GRAY_BG },
        };
      }
    });
  }
}

export async function generateGapReportExcel(
  coverage: CoverageResult,
  industryName: string,
  businessName: string
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Databricks Forge AI";
  wb.created = new Date();

  // -------------------------------------------------------------------------
  // Sheet 1: Gap Summary
  // -------------------------------------------------------------------------
  const summary = wb.addWorksheet("Gap Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 35 },
    { header: "Value", key: "value", width: 50 },
  ];
  styleHeaderRow(summary);

  const rows = [
    { metric: "Business", value: businessName },
    { metric: "Industry Outcome Map", value: industryName },
    {
      metric: "Overall Coverage",
      value: `${Math.round(coverage.overallCoverage * 100)}%`,
    },
    {
      metric: "Reference Use Cases (Total)",
      value: String(coverage.totalRefUseCases),
    },
    {
      metric: "Matched Use Cases",
      value: String(coverage.coveredRefUseCases),
    },
    { metric: "Gaps Identified", value: String(coverage.gapCount) },
    { metric: "", value: "" },
    {
      metric: "TOP DATA ENTITIES TO ONBOARD",
      value: "Use Cases Unlocked",
    },
  ];

  for (const { entity, useCaseCount } of coverage.missingDataEntities.slice(
    0,
    15
  )) {
    rows.push({ metric: entity, value: String(useCaseCount) });
  }

  rows.push({ metric: "", value: "" });
  rows.push({
    metric: "COMMON SOURCE SYSTEMS",
    value: "Use Cases Linked",
  });

  for (const { system, useCaseCount } of coverage.missingSourceSystems.slice(
    0,
    10
  )) {
    rows.push({ metric: system, value: String(useCaseCount) });
  }

  for (const row of rows) {
    summary.addRow(row);
  }
  styleDataRows(summary, 2, summary.rowCount);

  // -------------------------------------------------------------------------
  // Sheet 2: Per-Priority Gaps
  // -------------------------------------------------------------------------
  const gaps = wb.addWorksheet("Gap Details");
  gaps.columns = [
    { header: "Objective", key: "objective", width: 25 },
    { header: "Strategic Priority", key: "priority", width: 30 },
    { header: "Coverage", key: "coverage", width: 12 },
    { header: "Gap: Use Case", key: "useCase", width: 35 },
    { header: "Description", key: "description", width: 55 },
    { header: "Typical Data Entities", key: "dataEntities", width: 40 },
    { header: "Typical Source Systems", key: "sourceSystems", width: 35 },
  ];
  styleHeaderRow(gaps);

  for (const pc of coverage.priorities) {
    if (pc.unmatchedRefUseCases.length === 0) continue;

    for (const refUc of pc.unmatchedRefUseCases) {
      gaps.addRow({
        objective: pc.objective,
        priority: pc.priority.name,
        coverage: `${Math.round(pc.coverageRatio * 100)}%`,
        useCase: refUc.name,
        description: refUc.description,
        dataEntities: (refUc.typicalDataEntities ?? []).join(", "),
        sourceSystems: (refUc.typicalSourceSystems ?? []).join(", "),
      });
    }
  }
  styleDataRows(gaps, 2, gaps.rowCount);

  // Highlight the coverage column with amber when < 50%
  for (let r = 2; r <= gaps.rowCount; r++) {
    const cell = gaps.getRow(r).getCell("coverage");
    const val = parseInt(String(cell.value ?? "0"), 10);
    if (val < 50) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: AMBER_FILL },
      };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

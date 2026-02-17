/**
 * Excel export using exceljs.
 *
 * Generates a Databricks-branded .xlsx workbook with:
 * - Summary sheet (config + business context)
 * - Use Cases catalog (all fields, sortable, conditional score formatting)
 * - Domain breakdown
 */

import ExcelJS from "exceljs";
import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { computeDomainStats, effectiveScores } from "@/lib/domain/scoring";

// ---------------------------------------------------------------------------
// Brand constants (ARGB format for ExcelJS)
// ---------------------------------------------------------------------------

const DATABRICKS_BLUE = "FF003366";
const WHITE = "FFFFFFFF";
const LIGHT_GRAY_BG = "FFF9FAFB";
const TEXT_DARK = "FF333333";
const BORDER_COLOR = "FFD1D5DB";

const GREEN_FILL = "FFE8F5E9";
const GREEN_FONT = "FF2E7D32";
const AMBER_FILL = "FFFFF3E0";
const AMBER_FONT = "FFE65100";
const RED_FILL = "FFFFEBEE";
const RED_FONT = "FFC62828";

// ---------------------------------------------------------------------------
// Styling helpers
// ---------------------------------------------------------------------------

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = {
    style: "thin",
    color: { argb: BORDER_COLOR },
  };
  return { top: side, bottom: side, left: side, right: side };
}

/** Apply Databricks-branded header styling to row 1 */
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
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder();
  });
}

/** Apply alternating row colours and borders to data rows */
function styleDataRows(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  endRow: number
): void {
  for (let r = startRow; r <= endRow; r++) {
    const row = sheet.getRow(r);
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.alignment = { ...cell.alignment, vertical: "top", wrapText: true };
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

/** Apply conditional colour fill to a score cell (0-1 scale) */
function styleScoreCell(cell: ExcelJS.Cell, value: number): void {
  cell.numFmt = "0%";
  if (value >= 0.7) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: GREEN_FILL },
    };
    cell.font = { bold: true, color: { argb: GREEN_FONT }, size: 10 };
  } else if (value >= 0.4) {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: AMBER_FILL },
    };
    cell.font = { bold: true, color: { argb: AMBER_FONT }, size: 10 };
  } else {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: RED_FILL },
    };
    cell.font = { bold: true, color: { argb: RED_FONT }, size: 10 };
  }
  cell.alignment = { horizontal: "center", vertical: "middle" };
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generateExcel(
  run: PipelineRun,
  useCases: UseCase[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Databricks Forge AI";
  workbook.created = new Date();

  // =====================================================================
  // 1. SUMMARY SHEET
  // =====================================================================
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Property", key: "property", width: 28 },
    { header: "Value", key: "value", width: 65 },
  ];

  // -- Config section --
  const aiCount = useCases.filter((uc) => uc.type === "AI").length;
  const statsCount = useCases.length - aiCount;
  const avgScore = useCases.length
    ? Math.round(
        (useCases.reduce((s, uc) => s + effectiveScores(uc).overall, 0) /
          useCases.length) *
          100
      )
    : 0;

  const summaryRows: Array<{ property: string; value: string }> = [
    { property: "Business Name", value: run.config.businessName },
    { property: "UC Metadata", value: run.config.ucMetadata },
    { property: "Business Domains", value: run.config.businessDomains },
    { property: "Business Priorities", value: run.config.businessPriorities.join(", ") },
    { property: "Strategic Goals", value: run.config.strategicGoals },
    { property: "AI Model", value: run.config.aiModel },
    { property: "Languages", value: run.config.languages.join(", ") },
    { property: "", value: "" }, // spacer
    { property: "Total Use Cases", value: String(useCases.length) },
    { property: "Domains", value: String(new Set(useCases.map((uc) => uc.domain)).size) },
    { property: "AI Use Cases", value: String(aiCount) },
    { property: "Statistical Use Cases", value: String(statsCount) },
    { property: "Average Score", value: `${avgScore}%` },
    { property: "", value: "" }, // spacer
  ];

  // -- Business context section --
  const bc = run.businessContext;
  if (bc) {
    if (bc.industries) summaryRows.push({ property: "Industries", value: bc.industries });
    if (bc.strategicGoals) summaryRows.push({ property: "Strategic Goals (AI)", value: bc.strategicGoals });
    if (bc.valueChain) summaryRows.push({ property: "Value Chain", value: bc.valueChain });
    if (bc.revenueModel) summaryRows.push({ property: "Revenue Model", value: bc.revenueModel });
    if (bc.businessPriorities) summaryRows.push({ property: "Business Priorities (AI)", value: bc.businessPriorities });
    if (bc.strategicInitiative) summaryRows.push({ property: "Strategic Initiative", value: bc.strategicInitiative });
    if (bc.additionalContext) summaryRows.push({ property: "Additional Context", value: bc.additionalContext });
  }

  summaryRows.push({ property: "", value: "" }); // spacer
  summaryRows.push({ property: "Generated", value: new Date().toISOString() });
  summaryRows.push({ property: "Report By", value: "Databricks Forge AI" });

  summaryRows.forEach((row) => summarySheet.addRow(row));
  styleHeaderRow(summarySheet);

  // Style property column as bold blue
  for (let r = 2; r <= summarySheet.rowCount; r++) {
    const propCell = summarySheet.getRow(r).getCell(1);
    if (propCell.value) {
      propCell.font = { bold: true, color: { argb: DATABRICKS_BLUE }, size: 11 };
    }
    const valCell = summarySheet.getRow(r).getCell(2);
    valCell.font = { color: { argb: TEXT_DARK }, size: 11 };
    valCell.alignment = { wrapText: true, vertical: "top" };
  }

  // =====================================================================
  // 2. USE CASES SHEET (full catalog)
  // =====================================================================
  const ucSheet = workbook.addWorksheet("Use Cases");

  const hasAnyUserScores = useCases.some(
    (uc) =>
      uc.userPriorityScore != null ||
      uc.userFeasibilityScore != null ||
      uc.userImpactScore != null ||
      uc.userOverallScore != null
  );

  const baseColumns: Partial<ExcelJS.Column>[] = [
    { header: "No", key: "no", width: 7 },
    { header: "Name", key: "name", width: 38 },
    { header: "Type", key: "type", width: 12 },
    { header: "Domain", key: "domain", width: 18 },
    { header: "Subdomain", key: "subdomain", width: 18 },
    { header: "Technique", key: "technique", width: 20 },
    { header: "Statement", key: "statement", width: 50 },
    { header: "Solution", key: "solution", width: 50 },
    { header: "Business Value", key: "businessValue", width: 40 },
    { header: "Beneficiary", key: "beneficiary", width: 18 },
    { header: "Sponsor", key: "sponsor", width: 18 },
    { header: "Tables Involved", key: "tables", width: 45 },
    { header: "SQL Code", key: "sql", width: 50 },
    { header: "System Priority", key: "priority", width: 13 },
    { header: "System Feasibility", key: "feasibility", width: 15 },
    { header: "System Impact", key: "impact", width: 13 },
    { header: "System Overall", key: "overall", width: 13 },
  ];

  if (hasAnyUserScores) {
    baseColumns.push(
      { header: "User Priority", key: "userPriority", width: 13 },
      { header: "User Feasibility", key: "userFeasibility", width: 15 },
      { header: "User Impact", key: "userImpact", width: 13 },
      { header: "User Overall", key: "userOverall", width: 13 },
    );
  }

  ucSheet.columns = baseColumns;

  const sortedUseCases = [...useCases].sort(
    (a, b) => effectiveScores(b).overall - effectiveScores(a).overall
  );

  sortedUseCases.forEach((uc) => {
    const row: Record<string, unknown> = {
      no: uc.useCaseNo,
      name: uc.name,
      type: uc.type,
      domain: uc.domain,
      subdomain: uc.subdomain,
      technique: uc.analyticsTechnique,
      statement: uc.statement,
      solution: uc.solution,
      businessValue: uc.businessValue,
      beneficiary: uc.beneficiary,
      sponsor: uc.sponsor,
      tables: uc.tablesInvolved.join(", "),
      sql: uc.sqlCode ?? "",
      priority: uc.priorityScore,
      feasibility: uc.feasibilityScore,
      impact: uc.impactScore,
      overall: uc.overallScore,
    };

    if (hasAnyUserScores) {
      row.userPriority = uc.userPriorityScore ?? uc.priorityScore;
      row.userFeasibility = uc.userFeasibilityScore ?? uc.feasibilityScore;
      row.userImpact = uc.userImpactScore ?? uc.impactScore;
      row.userOverall = uc.userOverallScore ?? uc.overallScore;
    }

    ucSheet.addRow(row);
  });

  styleHeaderRow(ucSheet);
  styleDataRows(ucSheet, 2, ucSheet.rowCount);

  // Apply conditional score formatting to system score columns (14-17)
  const totalCols = hasAnyUserScores ? 21 : 17;
  for (let r = 2; r <= ucSheet.rowCount; r++) {
    const row = ucSheet.getRow(r);
    for (let col = 14; col <= 17; col++) {
      const cell = row.getCell(col);
      const val = cell.value as number;
      if (typeof val === "number") {
        styleScoreCell(cell, val);
      }
    }
    // Apply conditional score formatting to user score columns (18-21) if present
    if (hasAnyUserScores) {
      for (let col = 18; col <= 21; col++) {
        const cell = row.getCell(col);
        const val = cell.value as number;
        if (typeof val === "number") {
          styleScoreCell(cell, val);
        }
      }
    }
  }

  // Auto-filter on all columns
  ucSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: totalCols },
  };

  // Freeze header row + first two columns (No, Name)
  ucSheet.views = [
    {
      state: "frozen",
      xSplit: 2,
      ySplit: 1,
      activeCell: "C2",
    },
  ];

  // =====================================================================
  // 3. DOMAIN STATS SHEET
  // =====================================================================
  const domainSheet = workbook.addWorksheet("Domains");
  domainSheet.columns = [
    { header: "Domain", key: "domain", width: 25 },
    { header: "Use Cases", key: "count", width: 12 },
    { header: "Avg Score", key: "avgScore", width: 12 },
    { header: "Top Score", key: "topScore", width: 12 },
    { header: "AI Count", key: "aiCount", width: 11 },
    { header: "Statistical Count", key: "statsCount", width: 16 },
  ];

  const domainStats = computeDomainStats(useCases);
  domainStats.forEach((ds) => domainSheet.addRow(ds));

  styleHeaderRow(domainSheet);
  styleDataRows(domainSheet, 2, domainSheet.rowCount);

  // Format score columns as percentages with conditional colouring
  for (let r = 2; r <= domainSheet.rowCount; r++) {
    const row = domainSheet.getRow(r);
    // Domain name bold
    row.getCell(1).font = { bold: true, color: { argb: DATABRICKS_BLUE }, size: 10 };
    // Avg Score (col 3)
    const avgCell = row.getCell(3);
    if (typeof avgCell.value === "number") {
      styleScoreCell(avgCell, avgCell.value as number);
    }
    // Top Score (col 4)
    const topCell = row.getCell(4);
    if (typeof topCell.value === "number") {
      styleScoreCell(topCell, topCell.value as number);
    }
    // Center numeric columns
    for (let c = 2; c <= 6; c++) {
      row.getCell(c).alignment = { horizontal: "center", vertical: "middle" };
    }
  }

  // Auto-filter
  domainSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 6 },
  };

  // Freeze header row
  domainSheet.views = [
    {
      state: "frozen",
      xSplit: 1,
      ySplit: 1,
      activeCell: "B2",
    },
  ];

  // =====================================================================
  // Generate buffer
  // =====================================================================
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

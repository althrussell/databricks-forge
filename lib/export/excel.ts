/**
 * Excel export using exceljs.
 *
 * Generates a styled .xlsx workbook with:
 * - Summary sheet
 * - Use Cases catalog (sortable, with scores)
 * - Domain breakdown
 */

import ExcelJS from "exceljs";
import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { groupByDomain, computeDomainStats } from "@/lib/domain/scoring";

export async function generateExcel(
  run: PipelineRun,
  useCases: UseCase[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Databricks Inspire AI";
  workbook.created = new Date();

  // ----- Summary Sheet -----
  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Property", key: "property", width: 25 },
    { header: "Value", key: "value", width: 50 },
  ];

  const summaryRows = [
    { property: "Business Name", value: run.config.businessName },
    { property: "UC Metadata", value: run.config.ucMetadata },
    { property: "Total Use Cases", value: String(useCases.length) },
    {
      property: "Domains",
      value: String(new Set(useCases.map((uc) => uc.domain)).size),
    },
    {
      property: "AI Use Cases",
      value: String(useCases.filter((uc) => uc.type === "AI").length),
    },
    {
      property: "Statistical Use Cases",
      value: String(
        useCases.filter((uc) => uc.type === "Statistical").length
      ),
    },
    { property: "AI Model", value: run.config.aiModel },
    {
      property: "Priorities",
      value: run.config.businessPriorities.join(", "),
    },
    { property: "Generated", value: new Date().toISOString() },
  ];

  summaryRows.forEach((row) => summarySheet.addRow(row));
  styleHeaderRow(summarySheet);

  // ----- Use Cases Sheet -----
  const ucSheet = workbook.addWorksheet("Use Cases");
  ucSheet.columns = [
    { header: "No", key: "no", width: 8 },
    { header: "Name", key: "name", width: 40 },
    { header: "Type", key: "type", width: 12 },
    { header: "Domain", key: "domain", width: 18 },
    { header: "Subdomain", key: "subdomain", width: 18 },
    { header: "Technique", key: "technique", width: 20 },
    { header: "Statement", key: "statement", width: 50 },
    { header: "Solution", key: "solution", width: 50 },
    { header: "Business Value", key: "businessValue", width: 40 },
    { header: "Beneficiary", key: "beneficiary", width: 20 },
    { header: "Sponsor", key: "sponsor", width: 20 },
    { header: "Tables", key: "tables", width: 40 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Feasibility", key: "feasibility", width: 10 },
    { header: "Impact", key: "impact", width: 10 },
    { header: "Overall Score", key: "overall", width: 12 },
  ];

  useCases.forEach((uc) => {
    ucSheet.addRow({
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
      priority: uc.priorityScore,
      feasibility: uc.feasibilityScore,
      impact: uc.impactScore,
      overall: uc.overallScore,
    });
  });

  styleHeaderRow(ucSheet);
  ucSheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 16 },
  };

  // ----- Domain Stats Sheet -----
  const domainSheet = workbook.addWorksheet("Domains");
  domainSheet.columns = [
    { header: "Domain", key: "domain", width: 20 },
    { header: "Count", key: "count", width: 10 },
    { header: "Avg Score", key: "avgScore", width: 12 },
    { header: "Top Score", key: "topScore", width: 12 },
    { header: "AI Count", key: "aiCount", width: 10 },
    { header: "Stats Count", key: "statsCount", width: 12 },
  ];

  const domainStats = computeDomainStats(useCases);
  domainStats.forEach((ds) => domainSheet.addRow(ds));
  styleHeaderRow(domainSheet);

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function styleHeaderRow(sheet: ExcelJS.Worksheet) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  headerRow.alignment = { vertical: "middle" };
}

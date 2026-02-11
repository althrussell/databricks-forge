/**
 * PowerPoint export using pptxgenjs.
 *
 * Generates an executive slide deck with:
 * - Title slide
 * - Summary slide
 * - Domain breakdown slides
 * - Top use case slides
 */

import PptxGenJS from "pptxgenjs";
import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { groupByDomain, computeDomainStats } from "@/lib/domain/scoring";

export async function generatePptx(
  run: PipelineRun,
  useCases: UseCase[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Databricks Inspire AI";
  pptx.title = `${run.config.businessName} - Use Case Catalog`;

  // ----- Title Slide -----
  const titleSlide = pptx.addSlide();
  titleSlide.addText("Databricks Inspire AI", {
    x: 0.5,
    y: 1,
    w: "90%",
    fontSize: 36,
    bold: true,
    color: "1F2937",
  });
  titleSlide.addText(run.config.businessName, {
    x: 0.5,
    y: 2,
    w: "90%",
    fontSize: 24,
    color: "4B5563",
  });
  titleSlide.addText(`Use Case Discovery Report`, {
    x: 0.5,
    y: 3,
    w: "90%",
    fontSize: 16,
    color: "6B7280",
  });
  titleSlide.addText(
    `Generated: ${new Date().toLocaleDateString()} | ${useCases.length} use cases`,
    {
      x: 0.5,
      y: 4,
      w: "90%",
      fontSize: 12,
      color: "9CA3AF",
    }
  );

  // ----- Summary Slide -----
  const summarySlide = pptx.addSlide();
  summarySlide.addText("Executive Summary", {
    x: 0.5,
    y: 0.3,
    w: "90%",
    fontSize: 28,
    bold: true,
    color: "1F2937",
  });

  const domainStats = computeDomainStats(useCases);
  const aiCount = useCases.filter((uc) => uc.type === "AI").length;
  const statsCount = useCases.length - aiCount;
  const avgScore = Math.round(
    (useCases.reduce((s, uc) => s + uc.overallScore, 0) / useCases.length) *
      100
  );

  const summaryData: PptxGenJS.TableRow[] = [
    [{ text: "Metric" }, { text: "Value" }],
    [{ text: "Total Use Cases" }, { text: String(useCases.length) }],
    [{ text: "Business Domains" }, { text: String(domainStats.length) }],
    [{ text: "AI Use Cases" }, { text: String(aiCount) }],
    [{ text: "Statistical Use Cases" }, { text: String(statsCount) }],
    [{ text: "Average Score" }, { text: `${avgScore}%` }],
    [{ text: "Priorities" }, { text: run.config.businessPriorities.join(", ") }],
  ];

  summarySlide.addTable(summaryData, {
    x: 0.5,
    y: 1.2,
    w: 6,
    fontSize: 14,
    colW: [3, 3],
    border: { type: "solid", pt: 0.5, color: "D1D5DB" },
    autoPage: false,
  });

  // ----- Domain Breakdown Slide -----
  const domainSlide = pptx.addSlide();
  domainSlide.addText("Domain Breakdown", {
    x: 0.5,
    y: 0.3,
    w: "90%",
    fontSize: 28,
    bold: true,
    color: "1F2937",
  });

  const domainTableData: PptxGenJS.TableRow[] = [
    [{ text: "Domain" }, { text: "Count" }, { text: "Avg Score" }, { text: "AI" }, { text: "Stats" }],
    ...domainStats.slice(0, 15).map((ds): PptxGenJS.TableRow => [
      { text: ds.domain },
      { text: String(ds.count) },
      { text: `${Math.round(ds.avgScore * 100)}%` },
      { text: String(ds.aiCount) },
      { text: String(ds.statsCount) },
    ]),
  ];

  domainSlide.addTable(domainTableData, {
    x: 0.5,
    y: 1.2,
    w: 10,
    fontSize: 12,
    colW: [3, 1.5, 1.5, 1.5, 1.5],
    border: { type: "solid", pt: 0.5, color: "D1D5DB" },
    autoPage: false,
  });

  // ----- Top Use Cases Slides (top 10) -----
  const topCases = [...useCases]
    .sort((a, b) => b.overallScore - a.overallScore)
    .slice(0, 10);

  for (let i = 0; i < topCases.length; i += 5) {
    const batch = topCases.slice(i, i + 5);
    const ucSlide = pptx.addSlide();
    ucSlide.addText(
      `Top Use Cases ${i + 1}-${Math.min(i + 5, topCases.length)}`,
      {
        x: 0.5,
        y: 0.3,
        w: "90%",
        fontSize: 24,
        bold: true,
        color: "1F2937",
      }
    );

    const ucTableData: PptxGenJS.TableRow[] = [
      [{ text: "#" }, { text: "Name" }, { text: "Domain" }, { text: "Type" }, { text: "Score" }],
      ...batch.map((uc, idx): PptxGenJS.TableRow => [
        { text: String(i + idx + 1) },
        { text: uc.name },
        { text: uc.domain },
        { text: uc.type },
        { text: `${Math.round(uc.overallScore * 100)}%` },
      ]),
    ];

    ucSlide.addTable(ucTableData, {
      x: 0.5,
      y: 1.2,
      w: 12,
      fontSize: 12,
      colW: [0.8, 4.5, 2.5, 1.5, 1.2],
      border: { type: "solid", pt: 0.5, color: "D1D5DB" },
      autoPage: false,
    });
  }

  // Generate buffer
  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBuffer);
}

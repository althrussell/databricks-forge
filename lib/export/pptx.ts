/**
 * PowerPoint export using pptxgenjs.
 *
 * Generates a Databricks-branded executive slide deck matching the original
 * notebook output:
 *
 *  1. Title slide (decorative shapes, brand colours)
 *  2. Executive summary (narrative bullets from business context)
 *  3. Table of contents (paginated domain/count table)
 *  4. Per-domain sequence:
 *     a. Domain divider (full-bleed branded slide)
 *     b. Domain summary (bullet points)
 *     c. Individual use case slides (one per use case)
 */

import PptxGenJS from "pptxgenjs";
import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { groupByDomain, computeDomainStats } from "@/lib/domain/scoring";

// ---------------------------------------------------------------------------
// Brand constants
// ---------------------------------------------------------------------------

const DATABRICKS_BLUE = "003366";
const DATABRICKS_ORANGE = "FF6900";
const TEXT_COLOR = "333333";
const LIGHT_GRAY = "FAFAFA";
const WHITE = "FFFFFF";
const FOOTER_COLOR = "888888";
const BORDER_COLOR = "D1D5DB";

const TEAL_ACCENT = "00BCD4";
const PURPLE_ACCENT = "9C27B0";
const GREEN_ACCENT = "4CAF50";

// Slide dimensions (widescreen 13.33 x 7.5 in)
const SLIDE_W = 13.33;
const CONTENT_MARGIN = 0.6;
const CONTENT_W = SLIDE_W - CONTENT_MARGIN * 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/** Add branded footer to a slide */
function addFooter(slide: PptxGenJS.Slide): void {
  slide.addText(`Databricks Inspire AI  |  ${today()}`, {
    x: CONTENT_MARGIN,
    y: 7.0,
    w: CONTENT_W,
    fontSize: 10,
    color: FOOTER_COLOR,
    align: "right",
  });
}

/** Add a coloured rectangle accent bar */
function addAccentBar(
  slide: PptxGenJS.Slide,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  slide.addShape("rect", {
    x,
    y,
    w,
    h,
    fill: { color },
  });
}

/** Add decorative circles to the title slide */
function addTitleSlideShapes(slide: PptxGenJS.Slide): void {
  // Large ovals
  slide.addShape("ellipse", {
    x: 11.0,
    y: 0.4,
    w: 1.6,
    h: 1.6,
    fill: { color: TEAL_ACCENT, transparency: 60 },
  });
  slide.addShape("ellipse", {
    x: 0.4,
    y: 5.5,
    w: 2.0,
    h: 2.0,
    fill: { color: PURPLE_ACCENT, transparency: 60 },
  });
  slide.addShape("ellipse", {
    x: 11.8,
    y: 6.3,
    w: 1.2,
    h: 1.2,
    fill: { color: GREEN_ACCENT, transparency: 60 },
  });
  // Small accent circles
  slide.addShape("ellipse", {
    x: 1.2,
    y: 1.2,
    w: 0.6,
    h: 0.6,
    fill: { color: DATABRICKS_ORANGE, transparency: 40 },
  });
  slide.addShape("ellipse", {
    x: 11.4,
    y: 3.2,
    w: 0.8,
    h: 0.8,
    fill: { color: TEAL_ACCENT, transparency: 40 },
  });
}

/** Build domain summary bullet points from data (no AI call) */
function buildDomainSummary(domain: string, cases: UseCase[]): string[] {
  const aiCount = cases.filter((c) => c.type === "AI").length;
  const statsCount = cases.length - aiCount;
  const avgScore = Math.round(
    (cases.reduce((s, c) => s + c.overallScore, 0) / cases.length) * 100
  );
  const top = [...cases].sort((a, b) => b.overallScore - a.overallScore)[0];
  const subdomains = [...new Set(cases.map((c) => c.subdomain).filter(Boolean))];
  const techniques = [
    ...new Set(cases.map((c) => c.analyticsTechnique).filter(Boolean)),
  ].slice(0, 5);

  const bullets: string[] = [];
  bullets.push(
    `${cases.length} use cases (${aiCount} AI, ${statsCount} Statistical)`
  );
  if (subdomains.length > 0) {
    bullets.push(`Subdomains: ${subdomains.slice(0, 5).join(", ")}`);
  }
  bullets.push(`Average score: ${avgScore}%`);
  if (top) {
    bullets.push(
      `Highest-scoring: ${top.name} (${Math.round(top.overallScore * 100)}%)`
    );
  }
  if (techniques.length > 0) {
    bullets.push(`Key techniques: ${techniques.join(", ")}`);
  }
  return bullets;
}

/** Standard header row styling for tables */
function headerCell(text: string): PptxGenJS.TableCell {
  return {
    text,
    options: {
      bold: true,
      color: WHITE,
      fill: { color: DATABRICKS_BLUE },
      fontSize: 14,
      align: "left",
      valign: "middle",
    },
  };
}

function bodyCell(
  text: string,
  opts?: Partial<PptxGenJS.TextPropsOptions>
): PptxGenJS.TableCell {
  return {
    text,
    options: {
      fontSize: 12,
      color: TEXT_COLOR,
      valign: "middle",
      ...opts,
    },
  };
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generatePptx(
  run: PipelineRun,
  useCases: UseCase[]
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Databricks Inspire AI";
  pptx.title = `${run.config.businessName} - Use Case Catalog`;

  const domainStats = computeDomainStats(useCases);
  const domainGroups = groupByDomain(useCases);
  const domainOrder = domainStats.map((ds) => ds.domain);
  const aiCount = useCases.filter((uc) => uc.type === "AI").length;
  const statsCount = useCases.length - aiCount;
  const avgScore = useCases.length
    ? Math.round(
        (useCases.reduce((s, uc) => s + uc.overallScore, 0) /
          useCases.length) *
          100
      )
    : 0;

  // =====================================================================
  // 1. TITLE SLIDE
  // =====================================================================
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: DATABRICKS_BLUE };
  addTitleSlideShapes(titleSlide);

  titleSlide.addText("Databricks Inspire AI", {
    x: 1.5,
    y: 1.5,
    w: 10,
    fontSize: 44,
    bold: true,
    color: WHITE,
    fontFace: "Calibri",
  });
  titleSlide.addText("Strategic AI Use Case Discovery", {
    x: 1.5,
    y: 2.5,
    w: 10,
    fontSize: 24,
    color: LIGHT_GRAY,
    fontFace: "Calibri",
  });
  titleSlide.addText(`For ${run.config.businessName}`, {
    x: 1.5,
    y: 3.8,
    w: 10,
    fontSize: 32,
    bold: true,
    color: DATABRICKS_ORANGE,
    fontFace: "Calibri",
  });
  titleSlide.addText(today(), {
    x: 1.5,
    y: 5.2,
    w: 10,
    fontSize: 20,
    color: LIGHT_GRAY,
    fontFace: "Calibri",
  });

  // =====================================================================
  // 2. EXECUTIVE SUMMARY
  // =====================================================================
  const execSlide = pptx.addSlide();

  // Accent bars on left
  addAccentBar(execSlide, DATABRICKS_ORANGE, 0, 0.8, 0.12, 2.5);
  addAccentBar(execSlide, TEAL_ACCENT, 0, 3.4, 0.1, 2.0);

  execSlide.addText("Executive Summary", {
    x: CONTENT_MARGIN,
    y: 0.3,
    w: CONTENT_W,
    fontSize: 36,
    bold: true,
    color: DATABRICKS_BLUE,
    fontFace: "Calibri",
  });

  // Narrative bullets from business context + stats
  const bc = run.businessContext;
  const summaryBullets: Array<{ text: string; options?: PptxGenJS.TextPropsOptions }> = [];

  if (bc) {
    if (bc.industries) {
      summaryBullets.push({
        text: `Industry: ${bc.industries}`,
        options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
      });
    }
    if (bc.strategicGoals) {
      summaryBullets.push({
        text: `Strategic Goals: ${bc.strategicGoals}`,
        options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
      });
    }
    if (bc.valueChain) {
      summaryBullets.push({
        text: `Value Chain: ${bc.valueChain}`,
        options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
      });
    }
    if (bc.revenueModel) {
      summaryBullets.push({
        text: `Revenue Model: ${bc.revenueModel}`,
        options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
      });
    }
  }

  summaryBullets.push({
    text: `${useCases.length} use cases discovered across ${domainStats.length} domains`,
    options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
  });
  summaryBullets.push({
    text: `${aiCount} AI use cases, ${statsCount} Statistical use cases`,
    options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
  });
  summaryBullets.push({
    text: `Average overall score: ${avgScore}%`,
    options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
  });
  summaryBullets.push({
    text: `Business Priorities: ${run.config.businessPriorities.join(", ")}`,
    options: { fontSize: 18, color: TEXT_COLOR, bullet: true, breakLine: true },
  });

  execSlide.addText(summaryBullets, {
    x: CONTENT_MARGIN + 0.3,
    y: 1.2,
    w: CONTENT_W - 0.6,
    h: 4.5,
    valign: "top",
    fontFace: "Calibri",
  });

  // Disclaimer
  execSlide.addText(
    "Disclaimer: This analysis is based on Unity Catalog metadata only. No actual data was accessed or read during this process.",
    {
      x: CONTENT_MARGIN,
      y: 6.0,
      w: CONTENT_W,
      fontSize: 11,
      italic: true,
      color: FOOTER_COLOR,
      fontFace: "Calibri",
    }
  );
  addFooter(execSlide);

  // =====================================================================
  // 3. TABLE OF CONTENTS (paginated)
  // =====================================================================
  const ROWS_PER_TOC = 10;
  const tocPages = Math.ceil(domainStats.length / ROWS_PER_TOC);

  for (let page = 0; page < tocPages; page++) {
    const tocSlide = pptx.addSlide();

    // Accent bars
    addAccentBar(tocSlide, DATABRICKS_ORANGE, 0, 0.8, 0.08, 1.5);
    addAccentBar(tocSlide, TEAL_ACCENT, 0, 2.4, 0.08, 1.2);
    addAccentBar(tocSlide, PURPLE_ACCENT, 0, 3.7, 0.08, 1.0);

    const pageLabel = tocPages > 1 ? ` (${page + 1}/${tocPages})` : "";
    tocSlide.addText(`Table of Contents${pageLabel}`, {
      x: CONTENT_MARGIN,
      y: 0.3,
      w: CONTENT_W,
      fontSize: 36,
      bold: true,
      color: DATABRICKS_BLUE,
      fontFace: "Calibri",
    });

    const pageStats = domainStats.slice(
      page * ROWS_PER_TOC,
      (page + 1) * ROWS_PER_TOC
    );

    const tocData: PptxGenJS.TableRow[] = [
      [headerCell("Domain"), headerCell("Use Cases"), headerCell("Avg Score")],
      ...pageStats.map(
        (ds): PptxGenJS.TableRow => [
          bodyCell(ds.domain, { bold: true }),
          bodyCell(String(ds.count), { align: "center" }),
          bodyCell(`${Math.round(ds.avgScore * 100)}%`, { align: "center" }),
        ]
      ),
    ];

    tocSlide.addTable(tocData, {
      x: CONTENT_MARGIN + 0.3,
      y: 1.3,
      w: 8,
      fontSize: 14,
      colW: [4.5, 1.5, 2],
      border: { type: "solid", pt: 0.5, color: BORDER_COLOR },
      autoPage: false,
    });

    addFooter(tocSlide);
  }

  // =====================================================================
  // 4. PER-DOMAIN SEQUENCE
  // =====================================================================
  for (const domain of domainOrder) {
    const cases = (domainGroups[domain] ?? []).sort(
      (a, b) => b.overallScore - a.overallScore
    );
    if (cases.length === 0) continue;

    // ── 4a. Domain Divider ────────────────────────────────────────────
    const divSlide = pptx.addSlide();
    divSlide.background = { color: DATABRICKS_BLUE };

    divSlide.addText(domain, {
      x: 1.5,
      y: 2.2,
      w: 10,
      fontSize: 44,
      bold: true,
      color: DATABRICKS_ORANGE,
      fontFace: "Calibri",
    });
    divSlide.addText(`${cases.length} Use Cases`, {
      x: 1.5,
      y: 3.5,
      w: 10,
      fontSize: 32,
      color: WHITE,
      fontFace: "Calibri",
    });

    // Small decorative shapes
    divSlide.addShape("ellipse", {
      x: 11.5,
      y: 0.5,
      w: 1.2,
      h: 1.2,
      fill: { color: TEAL_ACCENT, transparency: 50 },
    });
    divSlide.addShape("ellipse", {
      x: 0.5,
      y: 6.0,
      w: 0.8,
      h: 0.8,
      fill: { color: PURPLE_ACCENT, transparency: 50 },
    });

    // ── 4b. Domain Summary ────────────────────────────────────────────
    const sumSlide = pptx.addSlide();
    addAccentBar(sumSlide, DATABRICKS_ORANGE, 0, 0.8, 0.12, 4.0);

    sumSlide.addText(domain, {
      x: CONTENT_MARGIN,
      y: 0.3,
      w: CONTENT_W,
      fontSize: 36,
      bold: true,
      color: DATABRICKS_BLUE,
      fontFace: "Calibri",
    });

    const bullets = buildDomainSummary(domain, cases);
    const bulletTexts = bullets.map((b) => ({
      text: b,
      options: {
        fontSize: 18,
        color: TEXT_COLOR,
        bullet: true,
        breakLine: true,
      } as PptxGenJS.TextPropsOptions,
    }));

    sumSlide.addText(bulletTexts, {
      x: CONTENT_MARGIN + 0.3,
      y: 1.3,
      w: CONTENT_W - 0.6,
      h: 4.5,
      valign: "top",
      fontFace: "Calibri",
    });

    addFooter(sumSlide);

    // ── 4c. Individual Use Case Slides ────────────────────────────────
    for (const uc of cases) {
      const ucSlide = pptx.addSlide();
      addAccentBar(ucSlide, DATABRICKS_ORANGE, 0, 0.8, 0.12, 5.5);

      // Title
      ucSlide.addText(`${uc.id}: ${uc.name}`, {
        x: CONTENT_MARGIN,
        y: 0.2,
        w: CONTENT_W,
        fontSize: 28,
        bold: true,
        color: DATABRICKS_BLUE,
        fontFace: "Calibri",
      });

      // Subtitle line: Subdomain | Type | Technique
      const subtitleParts = [
        uc.subdomain,
        uc.type,
        uc.analyticsTechnique,
      ].filter(Boolean);
      ucSlide.addText(subtitleParts.join("  |  "), {
        x: CONTENT_MARGIN,
        y: 0.85,
        w: CONTENT_W,
        fontSize: 16,
        bold: true,
        color: DATABRICKS_ORANGE,
        fontFace: "Calibri",
      });

      // Detail fields
      let yPos = 1.4;
      const lineH = 0.18; // height per line of text approx
      const fieldGap = 0.08;

      const fields: Array<{ label: string; value: string }> = [
        { label: "Statement", value: uc.statement },
        { label: "Solution", value: uc.solution },
        { label: "Business Value", value: uc.businessValue },
        { label: "Beneficiary", value: uc.beneficiary },
        { label: "Sponsor", value: uc.sponsor },
      ];

      if (uc.tablesInvolved.length > 0) {
        fields.push({
          label: "Tables Involved",
          value: uc.tablesInvolved.join(", "),
        });
      }

      for (const field of fields) {
        if (!field.value) continue;

        // Estimate height: ~90 chars per line at font 14
        const estLines = Math.ceil(field.value.length / 90);
        const fieldH = Math.max(0.35, estLines * lineH + 0.15);

        // Don't overflow the slide
        if (yPos + fieldH > 6.3) break;

        ucSlide.addText(
          [
            {
              text: `${field.label}: `,
              options: {
                bold: true,
                fontSize: 14,
                color: DATABRICKS_BLUE,
              },
            },
            {
              text: field.value,
              options: {
                fontSize: 14,
                color: TEXT_COLOR,
              },
            },
          ],
          {
            x: CONTENT_MARGIN + 0.3,
            y: yPos,
            w: CONTENT_W - 0.6,
            h: fieldH,
            valign: "top",
            fontFace: "Calibri",
            paraSpaceAfter: 4,
          }
        );
        yPos += fieldH + fieldGap;
      }

      // Score bar at bottom
      const scoreY = Math.max(yPos + 0.1, 6.0);
      if (scoreY < 6.8) {
        const scores = [
          { label: "Priority", value: Math.round(uc.priorityScore * 100) },
          {
            label: "Feasibility",
            value: Math.round(uc.feasibilityScore * 100),
          },
          { label: "Impact", value: Math.round(uc.impactScore * 100) },
          { label: "Overall", value: Math.round(uc.overallScore * 100) },
        ];

        const scoreText = scores
          .map((s) => `${s.label}: ${s.value}%`)
          .join("    |    ");

        ucSlide.addText(scoreText, {
          x: CONTENT_MARGIN + 0.3,
          y: scoreY,
          w: CONTENT_W - 0.6,
          fontSize: 13,
          bold: true,
          color: DATABRICKS_BLUE,
          fontFace: "Calibri",
        });
      }

      addFooter(ucSlide);
    }
  }

  // =====================================================================
  // Generate buffer
  // =====================================================================
  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBuffer);
}

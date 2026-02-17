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
import fs from "fs";
import path from "path";
import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { groupByDomain, computeDomainStats } from "@/lib/domain/scoring";

// ---------------------------------------------------------------------------
// Databricks logo — loaded once from public/databricks-icon.svg as base64 PNG
// pptxgenjs needs the image as a base64 data URI.
// ---------------------------------------------------------------------------

let _logoBase64: string | null = null;

function getLogoBase64(): string | null {
  if (_logoBase64 !== null) return _logoBase64;
  try {
    const svgPath = path.join(process.cwd(), "public", "databricks-icon.svg");
    const svgContent = fs.readFileSync(svgPath, "utf-8");
    _logoBase64 = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString("base64")}`;
    return _logoBase64;
  } catch {
    _logoBase64 = "";
    return null;
  }
}

// ---------------------------------------------------------------------------
// Official Databricks brand constants (hex without # for pptxgenjs)
// ---------------------------------------------------------------------------

const DB_DARK = "1B3139"; // Brand Dark — dark teal-charcoal
const DB_RED = "FF3621"; // Databricks Red — primary accent
const TEXT_COLOR = "2D3E50"; // Charcoal for body text on light slides
const TEXT_LIGHT = "BECBD2"; // De-saturated light text on dark slides
const WARM_WHITE = "FAFAFA";
const WHITE = "FFFFFF";
const FOOTER_COLOR = "8899A6";
const BORDER_COLOR = "D1D5DB";
const MID_GRAY = "5E6E7D";
const SCORE_GREEN = "2EA44F";
const SCORE_AMBER = "E8912D";

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

/** Add branded footer with logo to a slide */
function addFooter(
  slide: PptxGenJS.Slide,
  variant: "light" | "dark" = "light"
): void {
  const logo = getLogoBase64();
  if (logo) {
    slide.addImage({ data: logo, x: CONTENT_MARGIN, y: 6.98, w: 0.25, h: 0.26 });
  }
  slide.addText(`Databricks Forge AI  |  ${today()}`, {
    x: CONTENT_MARGIN + 0.35,
    y: 7.0,
    w: CONTENT_W - 0.35,
    fontSize: 10,
    color: variant === "dark" ? TEXT_LIGHT : FOOTER_COLOR,
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

/** Add red separator line across a slide */
function addRedSeparator(
  slide: PptxGenJS.Slide,
  x: number,
  y: number,
  w: number
): void {
  slide.addShape("rect", { x, y, w, h: 0.04, fill: { color: DB_RED } });
}

/** Add subtle geometric brand shapes to dark slides */
function addBrandShapes(slide: PptxGenJS.Slide): void {
  // Top-right subtle circle
  slide.addShape("ellipse", {
    x: 11.3,
    y: -0.3,
    w: 2.5,
    h: 2.5,
    fill: { color: WHITE, transparency: 92 },
  });
  // Bottom-left subtle circle
  slide.addShape("ellipse", {
    x: -0.5,
    y: 5.8,
    w: 2.0,
    h: 2.0,
    fill: { color: WHITE, transparency: 92 },
  });
  // Small red accent dot
  slide.addShape("ellipse", {
    x: 12.0,
    y: 6.5,
    w: 0.6,
    h: 0.6,
    fill: { color: DB_RED, transparency: 50 },
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
      fill: { color: DB_DARK },
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
  pptx.author = "Databricks Forge AI";
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
  titleSlide.background = { color: DB_DARK };
  addBrandShapes(titleSlide);

  // Databricks logo (top-left)
  const logo = getLogoBase64();
  if (logo) {
    titleSlide.addImage({ data: logo, x: 0.6, y: 0.5, w: 0.55, h: 0.58 });
  }

  // Red separator above the title
  addRedSeparator(titleSlide, 1.5, 1.3, 3.5);

  titleSlide.addText("Databricks Forge AI", {
    x: 1.5,
    y: 1.6,
    w: 10,
    fontSize: 44,
    bold: true,
    color: WHITE,
    fontFace: "Calibri",
  });
  titleSlide.addText("Strategic AI Use Case Discovery", {
    x: 1.5,
    y: 2.6,
    w: 10,
    fontSize: 24,
    color: TEXT_LIGHT,
    fontFace: "Calibri",
  });

  // Red separator above the business name
  addRedSeparator(titleSlide, 1.5, 3.6, 2.5);

  titleSlide.addText(`For ${run.config.businessName}`, {
    x: 1.5,
    y: 3.9,
    w: 10,
    fontSize: 32,
    bold: true,
    color: DB_RED,
    fontFace: "Calibri",
  });
  titleSlide.addText(today(), {
    x: 1.5,
    y: 5.2,
    w: 10,
    fontSize: 20,
    color: TEXT_LIGHT,
    fontFace: "Calibri",
  });
  addFooter(titleSlide, "dark");

  // =====================================================================
  // 2. EXECUTIVE SUMMARY (paginated across multiple slides when long)
  // =====================================================================

  // Collect all summary bullets
  const bc = run.businessContext;
  const summaryBullets: Array<{ text: string; options: PptxGenJS.TextPropsOptions }> = [];

  const bulletOpts: PptxGenJS.TextPropsOptions = {
    fontSize: 14,
    color: TEXT_COLOR,
    bullet: true,
    breakLine: true,
  };

  if (bc) {
    if (bc.industries) {
      summaryBullets.push({ text: `Industry: ${bc.industries}`, options: { ...bulletOpts } });
    }
    if (bc.strategicGoals) {
      summaryBullets.push({ text: `Strategic Goals: ${bc.strategicGoals}`, options: { ...bulletOpts } });
    }
    if (bc.valueChain) {
      summaryBullets.push({ text: `Value Chain: ${bc.valueChain}`, options: { ...bulletOpts } });
    }
    if (bc.revenueModel) {
      summaryBullets.push({ text: `Revenue Model: ${bc.revenueModel}`, options: { ...bulletOpts } });
    }
  }

  summaryBullets.push({
    text: `${useCases.length} use cases discovered across ${domainStats.length} domains`,
    options: { ...bulletOpts },
  });
  summaryBullets.push({
    text: `${aiCount} AI use cases, ${statsCount} Statistical use cases`,
    options: { ...bulletOpts },
  });
  summaryBullets.push({
    text: `Average overall score: ${avgScore}%`,
    options: { ...bulletOpts },
  });
  summaryBullets.push({
    text: `Business Priorities: ${run.config.businessPriorities.join(", ")}`,
    options: { ...bulletOpts },
  });

  // Paginate bullets across slides based on estimated text height
  const EXEC_CONTENT_Y = 1.2;
  const EXEC_MAX_Y = 6.7;
  const EXEC_AVAILABLE_H = EXEC_MAX_Y - EXEC_CONTENT_Y;
  const EXEC_CONTENT_W = CONTENT_W - 0.6;
  const CHARS_PER_LINE_EXEC = 110; // approx chars per line at font 14 in content width
  const LINE_HEIGHT_EXEC = 0.22; // approx line height at font 14
  const BULLET_GAP = 0.12;

  function estimateBulletH(text: string): number {
    const lines = Math.ceil(text.length / CHARS_PER_LINE_EXEC);
    return Math.max(LINE_HEIGHT_EXEC, lines * LINE_HEIGHT_EXEC) + BULLET_GAP;
  }

  const execPages: Array<typeof summaryBullets> = [];
  let currentPage: typeof summaryBullets = [];
  let currentH = 0;

  for (const bullet of summaryBullets) {
    const h = estimateBulletH(bullet.text);
    if (currentH + h > EXEC_AVAILABLE_H && currentPage.length > 0) {
      execPages.push(currentPage);
      currentPage = [];
      currentH = 0;
    }
    currentPage.push(bullet);
    currentH += h;
  }
  if (currentPage.length > 0) execPages.push(currentPage);

  for (let ep = 0; ep < execPages.length; ep++) {
    const execSlide = pptx.addSlide();

    addAccentBar(execSlide, DB_RED, 0, 0.8, 0.1, 3.0);

    const pageLabel = execPages.length > 1 ? ` (${ep + 1}/${execPages.length})` : "";
    execSlide.addText(`Executive Summary${pageLabel}`, {
      x: CONTENT_MARGIN,
      y: 0.3,
      w: CONTENT_W,
      fontSize: 36,
      bold: true,
      color: DB_DARK,
      fontFace: "Calibri",
    });
    addRedSeparator(execSlide, CONTENT_MARGIN, 0.95, 4);

    execSlide.addText(execPages[ep], {
      x: CONTENT_MARGIN + 0.3,
      y: EXEC_CONTENT_Y,
      w: EXEC_CONTENT_W,
      h: EXEC_AVAILABLE_H,
      valign: "top",
      fontFace: "Calibri",
    });

    addFooter(execSlide);
  }

  // =====================================================================
  // 3. TABLE OF CONTENTS (paginated)
  // =====================================================================
  const ROWS_PER_TOC = 10;
  const tocPages = Math.ceil(domainStats.length / ROWS_PER_TOC);

  for (let page = 0; page < tocPages; page++) {
    const tocSlide = pptx.addSlide();

    // Brand accent bar
    addAccentBar(tocSlide, DB_RED, 0, 0.8, 0.1, 3.0);

    const pageLabel = tocPages > 1 ? ` (${page + 1}/${tocPages})` : "";
    tocSlide.addText(`Table of Contents${pageLabel}`, {
      x: CONTENT_MARGIN,
      y: 0.3,
      w: CONTENT_W,
      fontSize: 36,
      bold: true,
      color: DB_DARK,
      fontFace: "Calibri",
    });
    addRedSeparator(tocSlide, CONTENT_MARGIN, 0.95, 4);

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
    divSlide.background = { color: DB_DARK };
    addBrandShapes(divSlide);

    addRedSeparator(divSlide, 1.5, 2.0, 3);

    const domainFontSize = domain.length > 40 ? 30 : domain.length > 25 ? 36 : 44;
    divSlide.addText(domain, {
      x: 1.5,
      y: 2.3,
      w: 10,
      h: 1.2,
      fontSize: domainFontSize,
      bold: true,
      color: WHITE,
      fontFace: "Calibri",
      wrap: true,
    });
    divSlide.addText(`${cases.length} Use Cases`, {
      x: 1.5,
      y: 3.6,
      w: 10,
      fontSize: 28,
      color: DB_RED,
      fontFace: "Calibri",
    });
    addFooter(divSlide, "dark");

    // ── 4b. Domain Summary ────────────────────────────────────────────
    const sumSlide = pptx.addSlide();
    addAccentBar(sumSlide, DB_RED, 0, 0.8, 0.1, 3.0);

    const sumFontSize = domain.length > 40 ? 24 : domain.length > 25 ? 28 : 32;
    sumSlide.addText(domain, {
      x: CONTENT_MARGIN,
      y: 0.3,
      w: CONTENT_W,
      h: 0.7,
      fontSize: sumFontSize,
      bold: true,
      color: DB_DARK,
      fontFace: "Calibri",
      wrap: true,
    });
    addRedSeparator(sumSlide, CONTENT_MARGIN, 1.05, 4);

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
      addAccentBar(ucSlide, DB_RED, 0, 0.4, 0.1, 6.0);

      // Title — shrink font for long names so they fit
      const titleText = `${uc.id}: ${uc.name}`;
      const titleLen = titleText.length;
      const titleFontSize = titleLen > 80 ? 18 : titleLen > 55 ? 20 : 22;
      const titleH = titleLen > 80 ? 0.8 : titleLen > 55 ? 0.65 : 0.5;

      ucSlide.addText(titleText, {
        x: CONTENT_MARGIN,
        y: 0.2,
        w: CONTENT_W,
        h: titleH,
        fontSize: titleFontSize,
        bold: true,
        color: DB_DARK,
        fontFace: "Calibri",
        valign: "top",
        wrap: true,
      });

      // Red separator under title
      const sepY = 0.2 + titleH + 0.05;
      addRedSeparator(ucSlide, CONTENT_MARGIN, sepY, 5);

      // Subtitle line: Subdomain | Type | Technique
      const subtitleParts = [
        uc.subdomain,
        uc.type,
        uc.analyticsTechnique,
      ].filter(Boolean);
      ucSlide.addText(subtitleParts.join("  |  "), {
        x: CONTENT_MARGIN,
        y: sepY + 0.08,
        w: CONTENT_W,
        fontSize: 13,
        bold: true,
        color: DB_RED,
        fontFace: "Calibri",
      });

      // Detail fields
      let yPos = sepY + 0.45;
      const lineH = 0.18;
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

        // Estimate height: ~100 chars per line at font 12
        const estLines = Math.ceil(field.value.length / 100);
        const fieldH = Math.max(0.3, estLines * lineH + 0.12);

        // Don't overflow the slide
        if (yPos + fieldH > 6.3) break;

        ucSlide.addText(
          [
            {
              text: `${field.label}: `,
              options: {
                bold: true,
                fontSize: 12,
                color: DB_DARK,
              },
            },
            {
              text: field.value,
              options: {
                fontSize: 12,
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
        // Background strip for scores
        ucSlide.addShape("rect", {
          x: CONTENT_MARGIN + 0.2,
          y: scoreY - 0.05,
          w: CONTENT_W - 0.4,
          h: 0.4,
          fill: { color: WARM_WHITE },
          rectRadius: 0.05,
        });

        const scores = [
          { label: "Priority", value: Math.round(uc.priorityScore * 100) },
          {
            label: "Feasibility",
            value: Math.round(uc.feasibilityScore * 100),
          },
          { label: "Impact", value: Math.round(uc.impactScore * 100) },
          { label: "Overall", value: Math.round(uc.overallScore * 100) },
        ];

        const scoreSegments: PptxGenJS.TextProps[] = [];
        scores.forEach((s, i) => {
          const scoreColor = s.value >= 70 ? SCORE_GREEN : s.value >= 40 ? SCORE_AMBER : DB_RED;
          scoreSegments.push({
            text: `${s.label}: `,
            options: { bold: true, fontSize: 13, color: DB_DARK },
          });
          scoreSegments.push({
            text: `${s.value}%`,
            options: { bold: true, fontSize: 13, color: scoreColor },
          });
          if (i < scores.length - 1) {
            scoreSegments.push({
              text: "    |    ",
              options: { fontSize: 13, color: MID_GRAY },
            });
          }
        });

        ucSlide.addText(scoreSegments, {
          x: CONTENT_MARGIN + 0.3,
          y: scoreY,
          w: CONTENT_W - 0.6,
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

/**
 * PDF export using PDFKit.
 *
 * Generates a Databricks-branded executive PDF catalog matching the PPTX
 * output structure:
 *
 *  1. Cover page (decorative shapes, brand colours)
 *  2. Executive summary (narrative bullets from business context)
 *  3. Table of contents (paginated domain/count table)
 *  4. Per-domain sequence:
 *     a. Domain divider (full-bleed branded page)
 *     b. Domain summary (bullet points)
 *     c. Individual use case pages (one per use case)
 */

import PDFDocument from "pdfkit";
import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { groupByDomain, computeDomainStats } from "@/lib/domain/scoring";

// ---------------------------------------------------------------------------
// Brand constants (hex for PDFKit)
// ---------------------------------------------------------------------------

const DATABRICKS_BLUE = "#003366";
const DATABRICKS_ORANGE = "#FF6900";
const TEXT_COLOR = "#333333";
const LIGHT_GRAY = "#FAFAFA";
const WHITE = "#FFFFFF";
const FOOTER_COLOR = "#888888";
const BORDER_COLOR = "#D1D5DB";
const MID_GRAY = "#666666";

const TEAL_ACCENT = "#00BCD4";
const PURPLE_ACCENT = "#9C27B0";
const GREEN_ACCENT = "#4CAF50";

// Page dimensions (A4 landscape for a presentation-style feel)
const PAGE_W = 842; // A4 landscape width in points
const PAGE_H = 595; // A4 landscape height in points
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().split("T")[0];
}

/** Convert hex to RGB array for PDFKit opacity drawing */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

/** Add branded footer to a page */
function addFooter(doc: PDFKit.PDFDocument): void {
  doc
    .fontSize(9)
    .fillColor(FOOTER_COLOR)
    .text(`Databricks Inspire AI  |  ${today()}`, MARGIN, PAGE_H - 35, {
      width: CONTENT_W,
      align: "right",
    });
}

/** Add a coloured accent bar (rectangle) */
function addAccentBar(
  doc: PDFKit.PDFDocument,
  color: string,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

/** Draw a decorative circle with transparency */
function addCircle(
  doc: PDFKit.PDFDocument,
  cx: number,
  cy: number,
  r: number,
  color: string,
  opacity: number
): void {
  doc.save().opacity(opacity).circle(cx, cy, r).fill(color).restore();
}

/** Build domain summary bullet points from data (no AI call) */
function buildDomainSummary(domain: string, cases: UseCase[]): string[] {
  const aiCount = cases.filter((c) => c.type === "AI").length;
  const statsCount = cases.length - aiCount;
  const avgScore = Math.round(
    (cases.reduce((s, c) => s + c.overallScore, 0) / cases.length) * 100
  );
  const top = [...cases].sort((a, b) => b.overallScore - a.overallScore)[0];
  const subdomains = [
    ...new Set(cases.map((c) => c.subdomain).filter(Boolean)),
  ];
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

/** Draw a simple table with header row */
function drawTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: string[][],
  x: number,
  y: number,
  colWidths: number[],
  options?: { maxRows?: number }
): number {
  const rowH = 28;
  const headerH = 32;
  const fontSize = 10;
  const headerFontSize = 11;
  const cellPadding = 8;
  const maxRows = options?.maxRows ?? rows.length;
  const tableW = colWidths.reduce((a, b) => a + b, 0);

  // Header
  doc.save().rect(x, y, tableW, headerH).fill(DATABRICKS_BLUE).restore();

  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    doc
      .fontSize(headerFontSize)
      .fillColor(WHITE)
      .font("Helvetica-Bold")
      .text(headers[i], cx + cellPadding, y + 9, {
        width: colWidths[i] - cellPadding * 2,
        align: i === 0 ? "left" : "center",
      });
    cx += colWidths[i];
  }

  let ry = y + headerH;
  const displayRows = rows.slice(0, maxRows);

  for (let r = 0; r < displayRows.length; r++) {
    // Alternating row background
    if (r % 2 === 1) {
      doc
        .save()
        .rect(x, ry, tableW, rowH)
        .fill(LIGHT_GRAY)
        .restore();
    }
    // Bottom border
    doc
      .save()
      .moveTo(x, ry + rowH)
      .lineTo(x + tableW, ry + rowH)
      .strokeColor(BORDER_COLOR)
      .lineWidth(0.5)
      .stroke()
      .restore();

    cx = x;
    for (let c = 0; c < displayRows[r].length; c++) {
      doc
        .fontSize(fontSize)
        .fillColor(TEXT_COLOR)
        .font(c === 0 ? "Helvetica-Bold" : "Helvetica")
        .text(displayRows[r][c], cx + cellPadding, ry + 8, {
          width: colWidths[c] - cellPadding * 2,
          align: c === 0 ? "left" : "center",
        });
      cx += colWidths[c];
    }
    ry += rowH;
  }

  return ry;
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generatePdf(
  run: PipelineRun,
  useCases: UseCase[]
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H], // A4 landscape
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: `${run.config.businessName} - Use Case Catalog`,
        Author: "Databricks Inspire AI",
        Subject: "AI Use Case Discovery Report",
      },
    });

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

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

    // ===================================================================
    // 1. COVER PAGE
    // ===================================================================
    // Blue background
    doc.save().rect(0, 0, PAGE_W, PAGE_H).fill(DATABRICKS_BLUE).restore();

    // Decorative circles
    addCircle(doc, PAGE_W - 100, 60, 55, TEAL_ACCENT, 0.4);
    addCircle(doc, 80, PAGE_H - 90, 70, PURPLE_ACCENT, 0.4);
    addCircle(doc, PAGE_W - 60, PAGE_H - 50, 40, GREEN_ACCENT, 0.4);
    addCircle(doc, 100, 100, 22, DATABRICKS_ORANGE, 0.5);
    addCircle(doc, PAGE_W - 80, 250, 28, TEAL_ACCENT, 0.35);

    // Title text
    doc
      .fontSize(40)
      .fillColor(WHITE)
      .font("Helvetica-Bold")
      .text("Databricks Inspire AI", MARGIN + 60, 140, { width: CONTENT_W });

    doc
      .fontSize(20)
      .fillColor(LIGHT_GRAY)
      .font("Helvetica")
      .text("Strategic AI Use Case Discovery", MARGIN + 60, 200, {
        width: CONTENT_W,
      });

    doc
      .fontSize(28)
      .fillColor(DATABRICKS_ORANGE)
      .font("Helvetica-Bold")
      .text(`For ${run.config.businessName}`, MARGIN + 60, 280, {
        width: CONTENT_W,
      });

    doc
      .fontSize(16)
      .fillColor(LIGHT_GRAY)
      .font("Helvetica")
      .text(today(), MARGIN + 60, 370, { width: CONTENT_W });

    doc
      .fontSize(12)
      .fillColor(LIGHT_GRAY)
      .font("Helvetica")
      .text(
        `${useCases.length} use cases  |  ${domainStats.length} domains`,
        MARGIN + 60,
        400,
        { width: CONTENT_W }
      );

    // ===================================================================
    // 2. EXECUTIVE SUMMARY
    // ===================================================================
    doc.addPage();

    // Accent bars
    addAccentBar(doc, DATABRICKS_ORANGE, 0, 60, 8, 180);
    addAccentBar(doc, TEAL_ACCENT, 0, 250, 6, 140);

    doc
      .fontSize(30)
      .fillColor(DATABRICKS_BLUE)
      .font("Helvetica-Bold")
      .text("Executive Summary", MARGIN, MARGIN, { width: CONTENT_W });

    let yPos = MARGIN + 50;

    // Business context bullets
    const bc = run.businessContext;
    const summaryItems: string[] = [];

    if (bc) {
      if (bc.industries) summaryItems.push(`Industry: ${bc.industries}`);
      if (bc.strategicGoals)
        summaryItems.push(`Strategic Goals: ${bc.strategicGoals}`);
      if (bc.valueChain) summaryItems.push(`Value Chain: ${bc.valueChain}`);
      if (bc.revenueModel)
        summaryItems.push(`Revenue Model: ${bc.revenueModel}`);
    }
    summaryItems.push(
      `${useCases.length} use cases discovered across ${domainStats.length} domains`
    );
    summaryItems.push(
      `${aiCount} AI use cases, ${statsCount} Statistical use cases`
    );
    summaryItems.push(`Average overall score: ${avgScore}%`);
    summaryItems.push(
      `Business Priorities: ${run.config.businessPriorities.join(", ")}`
    );

    for (const item of summaryItems) {
      doc
        .fontSize(13)
        .fillColor(TEXT_COLOR)
        .font("Helvetica")
        .text(`•  ${item}`, MARGIN + 20, yPos, {
          width: CONTENT_W - 40,
          lineGap: 4,
        });
      yPos = doc.y + 10;
    }

    // Disclaimer
    doc
      .fontSize(9)
      .fillColor(FOOTER_COLOR)
      .font("Helvetica-Oblique")
      .text(
        "Disclaimer: This analysis is based on Unity Catalog metadata only. No actual data was accessed or read during this process.",
        MARGIN,
        PAGE_H - 60,
        { width: CONTENT_W }
      );

    addFooter(doc);

    // ===================================================================
    // 3. TABLE OF CONTENTS (paginated)
    // ===================================================================
    const ROWS_PER_TOC = 12;
    const tocPages = Math.ceil(domainStats.length / ROWS_PER_TOC);

    for (let page = 0; page < tocPages; page++) {
      doc.addPage();

      // Accent bars
      addAccentBar(doc, DATABRICKS_ORANGE, 0, 60, 6, 100);
      addAccentBar(doc, TEAL_ACCENT, 0, 170, 6, 80);
      addAccentBar(doc, PURPLE_ACCENT, 0, 260, 6, 60);

      const pageLabel = tocPages > 1 ? ` (${page + 1}/${tocPages})` : "";
      doc
        .fontSize(30)
        .fillColor(DATABRICKS_BLUE)
        .font("Helvetica-Bold")
        .text(`Table of Contents${pageLabel}`, MARGIN, MARGIN, {
          width: CONTENT_W,
        });

      const pageStats = domainStats.slice(
        page * ROWS_PER_TOC,
        (page + 1) * ROWS_PER_TOC
      );

      const headers = ["Domain", "Use Cases", "Avg Score", "AI", "Statistical"];
      const rows = pageStats.map((ds) => [
        ds.domain,
        String(ds.count),
        `${Math.round(ds.avgScore * 100)}%`,
        String(ds.aiCount),
        String(ds.statsCount),
      ]);

      drawTable(doc, headers, rows, MARGIN + 10, MARGIN + 55, [
        280, 80, 90, 80, 90,
      ]);

      addFooter(doc);
    }

    // ===================================================================
    // 4. PER-DOMAIN SEQUENCE
    // ===================================================================
    for (const domain of domainOrder) {
      const cases = (domainGroups[domain] ?? []).sort(
        (a, b) => b.overallScore - a.overallScore
      );
      if (cases.length === 0) continue;

      // ── 4a. Domain Divider ────────────────────────────────────────
      doc.addPage();
      doc.save().rect(0, 0, PAGE_W, PAGE_H).fill(DATABRICKS_BLUE).restore();

      // Decorative shapes
      addCircle(doc, PAGE_W - 80, 60, 40, TEAL_ACCENT, 0.45);
      addCircle(doc, 60, PAGE_H - 70, 30, PURPLE_ACCENT, 0.45);

      doc
        .fontSize(38)
        .fillColor(DATABRICKS_ORANGE)
        .font("Helvetica-Bold")
        .text(domain, MARGIN + 50, 180, { width: CONTENT_W - 50 });

      doc
        .fontSize(26)
        .fillColor(WHITE)
        .font("Helvetica")
        .text(`${cases.length} Use Cases`, MARGIN + 50, 240, {
          width: CONTENT_W - 50,
        });

      // ── 4b. Domain Summary ────────────────────────────────────────
      doc.addPage();
      addAccentBar(doc, DATABRICKS_ORANGE, 0, 60, 8, 280);

      doc
        .fontSize(28)
        .fillColor(DATABRICKS_BLUE)
        .font("Helvetica-Bold")
        .text(domain, MARGIN, MARGIN, { width: CONTENT_W });

      doc
        .fontSize(14)
        .fillColor(DATABRICKS_ORANGE)
        .font("Helvetica")
        .text("Domain Summary", MARGIN, MARGIN + 38, { width: CONTENT_W });

      const bullets = buildDomainSummary(domain, cases);
      yPos = MARGIN + 70;

      for (const bullet of bullets) {
        doc
          .fontSize(13)
          .fillColor(TEXT_COLOR)
          .font("Helvetica")
          .text(`•  ${bullet}`, MARGIN + 20, yPos, {
            width: CONTENT_W - 40,
            lineGap: 4,
          });
        yPos = doc.y + 10;
      }

      // Quick stats grid
      yPos += 15;
      const statBoxW = 150;
      const statBoxH = 55;
      const statsData = [
        { label: "Use Cases", value: String(cases.length) },
        {
          label: "AI Cases",
          value: String(cases.filter((c) => c.type === "AI").length),
        },
        {
          label: "Avg Score",
          value: `${Math.round(
            (cases.reduce((s, c) => s + c.overallScore, 0) / cases.length) * 100
          )}%`,
        },
        {
          label: "Top Score",
          value: `${Math.round(
            Math.max(...cases.map((c) => c.overallScore)) * 100
          )}%`,
        },
      ];

      for (let i = 0; i < statsData.length; i++) {
        const bx = MARGIN + 20 + i * (statBoxW + 15);
        doc
          .save()
          .roundedRect(bx, yPos, statBoxW, statBoxH, 4)
          .lineWidth(1)
          .strokeColor(BORDER_COLOR)
          .stroke()
          .restore();

        doc
          .fontSize(20)
          .fillColor(DATABRICKS_BLUE)
          .font("Helvetica-Bold")
          .text(statsData[i].value, bx + 10, yPos + 10, {
            width: statBoxW - 20,
            align: "center",
          });

        doc
          .fontSize(9)
          .fillColor(MID_GRAY)
          .font("Helvetica")
          .text(statsData[i].label, bx + 10, yPos + 35, {
            width: statBoxW - 20,
            align: "center",
          });
      }

      addFooter(doc);

      // ── 4c. Individual Use Case Pages ─────────────────────────────
      for (const uc of cases) {
        doc.addPage();
        addAccentBar(doc, DATABRICKS_ORANGE, 0, 55, 8, 400);

        // Title
        doc
          .fontSize(22)
          .fillColor(DATABRICKS_BLUE)
          .font("Helvetica-Bold")
          .text(`${uc.id}: ${uc.name}`, MARGIN, MARGIN - 5, {
            width: CONTENT_W,
          });

        // Subtitle: Subdomain | Type | Technique
        const subtitleParts = [
          uc.subdomain,
          uc.type,
          uc.analyticsTechnique,
        ].filter(Boolean);
        doc
          .fontSize(12)
          .fillColor(DATABRICKS_ORANGE)
          .font("Helvetica-Bold")
          .text(subtitleParts.join("  |  "), MARGIN, doc.y + 6, {
            width: CONTENT_W,
          });

        yPos = doc.y + 16;

        // Detail fields
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
          if (yPos > PAGE_H - 100) break; // Don't overflow

          // Label
          doc
            .fontSize(11)
            .fillColor(DATABRICKS_BLUE)
            .font("Helvetica-Bold")
            .text(`${field.label}:`, MARGIN + 15, yPos, {
              width: CONTENT_W - 30,
              continued: false,
            });

          // Value
          doc
            .fontSize(11)
            .fillColor(TEXT_COLOR)
            .font("Helvetica")
            .text(field.value, MARGIN + 15, doc.y + 2, {
              width: CONTENT_W - 30,
              lineGap: 3,
            });

          yPos = doc.y + 12;
        }

        // Score bar at bottom
        const scoreBarY = Math.max(yPos + 10, PAGE_H - 80);
        if (scoreBarY < PAGE_H - 50) {
          // Score background strip
          doc
            .save()
            .roundedRect(MARGIN + 15, scoreBarY - 5, CONTENT_W - 30, 30, 3)
            .fill("#EBF0F5")
            .restore();

          const scores = [
            {
              label: "Priority",
              value: Math.round(uc.priorityScore * 100),
            },
            {
              label: "Feasibility",
              value: Math.round(uc.feasibilityScore * 100),
            },
            { label: "Impact", value: Math.round(uc.impactScore * 100) },
            { label: "Overall", value: Math.round(uc.overallScore * 100) },
          ];

          const scoreBlockW = (CONTENT_W - 30) / 4;
          for (let i = 0; i < scores.length; i++) {
            const sx = MARGIN + 15 + i * scoreBlockW;
            const scoreColor =
              scores[i].value >= 70
                ? GREEN_ACCENT
                : scores[i].value >= 40
                  ? DATABRICKS_ORANGE
                  : "#E53935";

            doc
              .fontSize(10)
              .fillColor(MID_GRAY)
              .font("Helvetica")
              .text(scores[i].label, sx + 5, scoreBarY, {
                width: scoreBlockW - 10,
                align: "center",
                continued: false,
              });

            doc
              .fontSize(12)
              .fillColor(scoreColor)
              .font("Helvetica-Bold")
              .text(`${scores[i].value}%`, sx + 5, scoreBarY + 13, {
                width: scoreBlockW - 10,
                align: "center",
              });
          }
        }

        addFooter(doc);
      }
    }

    // ===================================================================
    // Finalize
    // ===================================================================
    doc.end();
  });
}

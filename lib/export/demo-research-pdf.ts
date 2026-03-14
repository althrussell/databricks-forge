import PDFDocument from "pdfkit";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";
import { PDF, today } from "./brand";

const PAGE_W = 842;
const PAGE_H = 595;
const M = 50;
const CW = PAGE_W - M * 2;

function sectionHeading(doc: PDFKit.PDFDocument, y: number, title: string): number {
  if (y > PAGE_H - 80) {
    doc.addPage();
    y = M;
  }
  doc.save().rect(0, y, 5, 24).fill(PDF.DB_RED).restore();
  doc.fontSize(16).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text(title, M, y + 2, {
    width: CW - 10,
  });
  return doc.y + 12;
}

function tableRow(
  doc: PDFKit.PDFDocument,
  y: number,
  cells: string[],
  widths: number[],
  altRow: boolean,
): number {
  if (altRow) {
    doc.save().rect(M, y, CW, 20).fill(PDF.WARM_WHITE).restore();
  }
  doc
    .save()
    .moveTo(M, y + 20)
    .lineTo(M + CW, y + 20)
    .strokeColor(PDF.BORDER_COLOR)
    .lineWidth(0.5)
    .stroke()
    .restore();
  let x = M + 8;
  doc.fontSize(9).fillColor(PDF.TEXT_COLOR).font("Helvetica");
  for (let i = 0; i < cells.length; i++) {
    doc.text(cells[i], x, y + 5, { width: widths[i] - 16 });
    x += widths[i];
  }
  return y + 20;
}

export async function generateDemoResearchPdf(
  research: ResearchEngineResult,
  customerName: string,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const doc = new PDFDocument({
      size: [PAGE_W, PAGE_H],
      margins: { top: M, bottom: M, left: M, right: M },
      bufferPages: true,
      info: {
        Title: `${customerName} Demo Preparation`,
        Author: "Databricks Forge",
      },
    });

    doc.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.save().rect(0, 0, PAGE_W, 55).fill(PDF.DB_DARK).restore();
    doc
      .fontSize(24)
      .fillColor(PDF.WHITE)
      .font("Helvetica-Bold")
      .text(`${customerName} Demo Preparation`, M, 18, { width: CW });
    doc
      .fontSize(12)
      .fillColor(PDF.TEXT_LIGHT)
      .font("Helvetica")
      .text(`${research.industryId}  |  ${today()}`, M, 42, { width: CW });

    let y = 70;

    const companyProfile = research.companyProfile;
    if (companyProfile) {
      y = sectionHeading(doc, y, "Company Overview");
      if (companyProfile.statedPriorities?.length) {
        doc.fontSize(12).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text("Stated Priorities", M, y);
        y = doc.y + 4;
        for (const p of companyProfile.statedPriorities) {
          doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica").text(`• ${p.priority} (${p.source})`, M + 10, y, { width: CW - 20 });
          y = doc.y + 4;
        }
        y += 4;
      }
      if (companyProfile.inferredPriorities?.length) {
        doc.fontSize(12).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text("Inferred Priorities", M, y);
        y = doc.y + 4;
        for (const p of companyProfile.inferredPriorities) {
          doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica").text(`• ${p.priority}: ${p.evidence}`, M + 10, y, { width: CW - 20 });
          y = doc.y + 4;
        }
        y += 4;
      }
      if (companyProfile.urgencySignals?.length) {
        doc.fontSize(12).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text("Urgency Signals", M, y);
        y = doc.y + 4;
        for (const s of companyProfile.urgencySignals) {
          doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica").text(`• ${s.signal} (${s.type}${s.date ? `, ${s.date}` : ""})`, M + 10, y, { width: CW - 20 });
          y = doc.y + 4;
        }
        y += 4;
      }
      y += 8;
    }

    if (companyProfile?.swotSummary) {
      const swot = companyProfile.swotSummary;
      y = sectionHeading(doc, y, "SWOT Analysis");
      doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica");
      doc.text(`Strengths: ${(swot.strengths ?? []).join("; ")}`, M, y, { width: CW / 2 - 10 });
      doc.text(`Weaknesses: ${(swot.weaknesses ?? []).join("; ")}`, M + CW / 2 + 5, y, { width: CW / 2 - 10 });
      y = doc.y + 8;
      doc.text(`Opportunities: ${(swot.opportunities ?? []).join("; ")}`, M, y, { width: CW / 2 - 10 });
      doc.text(`Threats: ${(swot.threats ?? []).join("; ")}`, M + CW / 2 + 5, y, { width: CW / 2 - 10 });
      y = doc.y + 12;
    }

    const industryLandscape = research.industryLandscape;
    if (industryLandscape) {
      y = sectionHeading(doc, y, "Industry Landscape");
      if (industryLandscape.marketForces?.length) {
        const w = [CW * 0.25, CW * 0.55, CW * 0.2];
        doc.save().rect(M, y, CW, 22).fill(PDF.DB_DARK).restore();
        doc.fontSize(9).fillColor(PDF.WHITE).font("Helvetica-Bold");
        doc.text("Force", M + 8, y + 6, { width: w[0] - 16 });
        doc.text("Description", M + 8 + w[0], y + 6, { width: w[1] - 16 });
        doc.text("Urgency", M + 8 + w[0] + w[1], y + 6, { width: w[2] - 16 });
        y += 22;
        industryLandscape.marketForces.forEach((f, i) => {
          y = tableRow(doc, y, [f.force, f.description, f.urgency], w, i % 2 === 1);
        });
        y += 8;
      }
      if (industryLandscape.competitiveDynamics) {
        doc.fontSize(12).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text("Competitive Dynamics", M, y);
        y = doc.y + 4;
        doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica").text(industryLandscape.competitiveDynamics, M, y, { width: CW, lineGap: 2 });
        y = doc.y + 12;
      }
    }

    if (industryLandscape?.keyBenchmarks?.length) {
      y = sectionHeading(doc, y, "Key Benchmarks");
      const w = [CW / 3, CW / 3, CW / 3];
      doc.save().rect(M, y, CW, 22).fill(PDF.DB_DARK).restore();
      doc.fontSize(9).fillColor(PDF.WHITE).font("Helvetica-Bold");
      doc.text("Metric", M + 8, y + 6, { width: w[0] - 16 });
      doc.text("Impact", M + 8 + w[0], y + 6, { width: w[1] - 16 });
      doc.text("Source", M + 8 + w[0] + w[1], y + 6, { width: w[2] - 16 });
      y += 22;
      industryLandscape.keyBenchmarks.forEach((b, i) => {
        y = tableRow(doc, y, [b.metric, b.impact, b.source], w, i % 2 === 1);
      });
      y += 8;
    }

    const dataStrategy = research.dataStrategy;
    if (dataStrategy?.assetDetails?.length) {
      y = sectionHeading(doc, y, "Data Strategy");
      const w = [CW * 0.15, CW * 0.15, CW * 0.5, CW * 0.2];
      doc.save().rect(M, y, CW, 22).fill(PDF.DB_DARK).restore();
      doc.fontSize(9).fillColor(PDF.WHITE).font("Helvetica-Bold");
      doc.text("ID", M + 8, y + 6, { width: w[0] - 16 });
      doc.text("Relevance", M + 8 + w[0], y + 6, { width: w[1] - 16 });
      doc.text("Rationale", M + 8 + w[0] + w[1], y + 6, { width: w[2] - 16 });
      doc.text("Quick Win", M + 8 + w[0] + w[1] + w[2], y + 6, { width: w[3] - 16 });
      y += 22;
      dataStrategy.assetDetails.forEach((a, i) => {
        y = tableRow(doc, y, [a.id, String(a.relevance), a.rationale, a.quickWin ? "Yes" : "No"], w, i % 2 === 1);
      });
      y += 8;
    }

    const demoNarrative = research.demoNarrative;
    if (demoNarrative?.demoFlow && demoNarrative.demoFlow.length > 0) {
      y = sectionHeading(doc, y, "Demo Flow");
      for (const step of demoNarrative.demoFlow) {
        doc.fontSize(11).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text(`${step.step}. ${step.moment} (${step.assetId})`, M, y);
        y = doc.y + 2;
        doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica").text(step.talkingPoint, M + 15, y, { width: CW - 25 });
        y = doc.y + 8;
      }
      y += 4;
    }

    if (demoNarrative?.killerMoments && demoNarrative.killerMoments.length > 0) {
      for (const m of demoNarrative.killerMoments.slice(0, 4)) {
        if (y > PAGE_H - 120) {
          doc.addPage();
          y = M;
        }
        y = sectionHeading(doc, y, m.title);
        doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica");
        doc.text("Scenario: " + m.scenario, M, y, { width: CW });
        y = doc.y + 6;
        doc.text("Insight: " + m.insightStatement, M, y, { width: CW });
        y = doc.y + 6;
        doc.text("Expected Reaction: " + m.expectedReaction, M, y, { width: CW });
        y = doc.y + 12;
      }
    }

    if (demoNarrative?.competitorAngles && demoNarrative.competitorAngles.length > 0) {
      y = sectionHeading(doc, y, "Competitive Positioning");
      const w = [CW * 0.25, CW * 0.375, CW * 0.375];
      doc.save().rect(M, y, CW, 22).fill(PDF.DB_DARK).restore();
      doc.fontSize(9).fillColor(PDF.WHITE).font("Helvetica-Bold");
      doc.text("Competitor", M + 8, y + 6, { width: w[0] - 16 });
      doc.text("Their Move", M + 8 + w[0], y + 6, { width: w[1] - 16 });
      doc.text("Your Opportunity", M + 8 + w[0] + w[1], y + 6, { width: w[2] - 16 });
      y += 22;
      demoNarrative.competitorAngles.forEach((c, i) => {
        y = tableRow(doc, y, [c.competitor, c.theirMove, c.yourOpportunity], w, i % 2 === 1);
      });
      y += 8;
    }

    if (demoNarrative?.executiveTalkingPoints && demoNarrative.executiveTalkingPoints.length > 0) {
      y = sectionHeading(doc, y, "Executive Talking Points");
      for (const tp of demoNarrative.executiveTalkingPoints) {
        doc.fontSize(11).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text(`${tp.assetId}: ${tp.headline}`, M, y);
        y = doc.y + 2;
        doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica").text(tp.benchmarkTieIn, M + 15, y, { width: CW - 25 });
        y = doc.y + 8;
      }
      y += 4;
    }

    if (research.dataNarratives && research.dataNarratives.length > 0) {
      y = sectionHeading(doc, y, "Data Narratives");
      for (const n of research.dataNarratives) {
        doc.fontSize(11).fillColor(PDF.DB_DARK).font("Helvetica-Bold").text(n.title, M, y);
        y = doc.y + 2;
        doc.fontSize(10).fillColor(PDF.TEXT_COLOR).font("Helvetica").text(n.description, M, y, { width: CW });
        y = doc.y + 2;
        doc.fontSize(9).fillColor(PDF.MID_GRAY).font("Helvetica").text(`Pattern: ${n.pattern}`, M, y);
        y = doc.y + 10;
      }
      y += 4;
    }

    if (research.sources && research.sources.length > 0) {
      y = sectionHeading(doc, y, "Sources");
      const w = [CW * 0.2, CW * 0.45, CW * 0.2, CW * 0.15];
      doc.save().rect(M, y, CW, 22).fill(PDF.DB_DARK).restore();
      doc.fontSize(9).fillColor(PDF.WHITE).font("Helvetica-Bold");
      doc.text("Type", M + 8, y + 6, { width: w[0] - 16 });
      doc.text("URL", M + 8 + w[0], y + 6, { width: w[1] - 16 });
      doc.text("Status", M + 8 + w[0] + w[1], y + 6, { width: w[2] - 16 });
      doc.text("Characters", M + 8 + w[0] + w[1] + w[2], y + 6, { width: w[3] - 16 });
      y += 22;
      research.sources.forEach((s, i) => {
        y = tableRow(doc, y, [s.type, s.title, s.status, String(s.charCount)], w, i % 2 === 1);
      });
    }

    doc
      .fontSize(9)
      .fillColor(PDF.FOOTER_COLOR)
      .font("Helvetica")
      .text(`Databricks Forge  |  ${today()}`, M, PAGE_H - 35, { width: CW, align: "right" });

    doc.end();
  });
}

import PptxGenJS from "pptxgenjs";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";
import { PPTX, today } from "./brand";
import {
  addTitleSlide,
  addSectionSlide,
  addFooter,
  headerCell,
  bodyCell,
} from "./pptx-helpers";

export async function generateDemoResearchPptx(
  research: ResearchEngineResult,
  customerName: string,
): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Databricks Forge";
  pptx.title = `${customerName} Demo Preparation`;

  addTitleSlide(
    pptx,
    `${customerName} Demo Preparation`,
    today(),
    research.industryId,
  );

  const companyProfile = research.companyProfile;
  if (companyProfile) {
    const slide = addSectionSlide(pptx, "Company Overview");
    const items: PptxGenJS.TextProps[] = [];
    if (companyProfile.statedPriorities.length > 0) {
      items.push(
        {
          text: "Stated Priorities",
          options: {
            fontSize: 14,
            bold: true,
            color: PPTX.DB_DARK,
            breakLine: true,
            paraSpaceAfter: 4,
          } as PptxGenJS.TextPropsOptions,
        },
        ...companyProfile.statedPriorities.flatMap((p) => [
          {
            text: `• ${p.priority} (${p.source})`,
            options: {
              fontSize: 12,
              color: PPTX.TEXT_COLOR,
              bullet: true,
              breakLine: true,
              paraSpaceAfter: 2,
              indentLevel: 1,
            } as PptxGenJS.TextPropsOptions,
          },
        ]),
      );
    }
    if (companyProfile.inferredPriorities.length > 0) {
      items.push(
        {
          text: "Inferred Priorities",
          options: {
            fontSize: 14,
            bold: true,
            color: PPTX.DB_DARK,
            breakLine: true,
            paraSpaceAfter: 4,
          } as PptxGenJS.TextPropsOptions,
        },
        ...companyProfile.inferredPriorities.flatMap((p) => [
          {
            text: `• ${p.priority}: ${p.evidence}`,
            options: {
              fontSize: 12,
              color: PPTX.TEXT_COLOR,
              bullet: true,
              breakLine: true,
              paraSpaceAfter: 2,
              indentLevel: 1,
            } as PptxGenJS.TextPropsOptions,
          },
        ]),
      );
    }
    if (companyProfile.urgencySignals.length > 0) {
      items.push(
        {
          text: "Urgency Signals",
          options: {
            fontSize: 14,
            bold: true,
            color: PPTX.DB_DARK,
            breakLine: true,
            paraSpaceAfter: 4,
          } as PptxGenJS.TextPropsOptions,
        },
        ...companyProfile.urgencySignals.flatMap((s) => [
          {
            text: `• ${s.signal} (${s.type}${s.date ? `, ${s.date}` : ""})`,
            options: {
              fontSize: 12,
              color: PPTX.TEXT_COLOR,
              bullet: true,
              breakLine: true,
              paraSpaceAfter: 2,
              indentLevel: 1,
            } as PptxGenJS.TextPropsOptions,
          },
        ]),
      );
    }
    if (items.length > 0) {
      slide.addText(items, {
        x: PPTX.CONTENT_MARGIN + 0.3,
        y: 1.2,
        w: PPTX.CONTENT_W - 0.6,
        h: 5.5,
        valign: "top",
        fontFace: "Calibri",
      });
    }
    addFooter(slide);
  }

  if (companyProfile?.swotSummary) {
    const swot = companyProfile.swotSummary;
    const slide = addSectionSlide(pptx, "SWOT Analysis");
    const positions: Array<{ x: number; y: number; label: string; items: string[] }> = [
      { x: 0.5, y: 1.5, label: "Strengths", items: swot.strengths },
      { x: 5.2, y: 1.5, label: "Weaknesses", items: swot.weaknesses },
      { x: 0.5, y: 4, label: "Opportunities", items: swot.opportunities },
      { x: 5.2, y: 4, label: "Threats", items: swot.threats },
    ];
    const boxW = 4.4;
    const boxH = 2.2;
    for (const { x, y, label, items } of positions) {
      slide.addShape("rect", {
        x,
        y,
        w: boxW,
        h: boxH,
        fill: { color: PPTX.WARM_WHITE },
        line: { color: PPTX.BORDER_COLOR, width: 0.5 },
        rectRadius: 0.08,
      });
      slide.addText(label, {
        x: x + 0.1,
        y: y + 0.1,
        w: boxW - 0.2,
        fontSize: 14,
        bold: true,
        color: PPTX.DB_DARK,
        fontFace: "Calibri",
      });
      const bulletText = items.slice(0, 4).map((i) => `• ${i}`).join("\n");
      if (bulletText) {
        slide.addText(bulletText, {
          x: x + 0.15,
          y: y + 0.45,
          w: boxW - 0.3,
          h: boxH - 0.55,
          fontSize: 10,
          color: PPTX.TEXT_COLOR,
          fontFace: "Calibri",
          valign: "top",
        });
      }
    }
    addFooter(slide);
  }

  const industryLandscape = research.industryLandscape;
  if (industryLandscape) {
    const slide = addSectionSlide(pptx, "Industry Landscape");
    if (industryLandscape.marketForces.length > 0) {
      const forceData: PptxGenJS.TableRow[] = [
        [headerCell("Force"), headerCell("Description"), headerCell("Urgency")],
        ...industryLandscape.marketForces.map(
          (f): PptxGenJS.TableRow => [
            bodyCell(f.force, { bold: true }),
            bodyCell(f.description),
            bodyCell(f.urgency, { align: "center" }),
          ],
        ),
      ];
      slide.addTable(forceData, {
        x: PPTX.CONTENT_MARGIN + 0.3,
        y: 1.2,
        w: PPTX.CONTENT_W - 0.6,
        colW: [2.5, 6, 1.5],
        border: { type: "solid", pt: 0.5, color: PPTX.BORDER_COLOR },
        autoPage: false,
      });
      let compY = 3.8;
      if (industryLandscape.competitiveDynamics) {
        slide.addText("Competitive Dynamics", {
          x: PPTX.CONTENT_MARGIN + 0.3,
          y: compY,
          w: PPTX.CONTENT_W - 0.6,
          fontSize: 14,
          bold: true,
          color: PPTX.DB_DARK,
          fontFace: "Calibri",
        });
        compY += 0.35;
        slide.addText(industryLandscape.competitiveDynamics, {
          x: PPTX.CONTENT_MARGIN + 0.3,
          y: compY,
          w: PPTX.CONTENT_W - 0.6,
          h: 2,
          fontSize: 11,
          color: PPTX.TEXT_COLOR,
          fontFace: "Calibri",
          valign: "top",
        });
      }
    }
    addFooter(slide);
  }

  if (industryLandscape?.keyBenchmarks && industryLandscape.keyBenchmarks.length > 0) {
    const slide = addSectionSlide(pptx, "Key Benchmarks");
    const benchData: PptxGenJS.TableRow[] = [
      [headerCell("Metric"), headerCell("Impact"), headerCell("Source")],
      ...industryLandscape.keyBenchmarks.map(
        (b): PptxGenJS.TableRow => [
          bodyCell(b.metric, { bold: true }),
          bodyCell(b.impact),
          bodyCell(b.source),
        ],
      ),
    ];
    slide.addTable(benchData, {
      x: PPTX.CONTENT_MARGIN + 0.3,
      y: 1.2,
      w: PPTX.CONTENT_W - 0.6,
      colW: [4, 4, 4],
      border: { type: "solid", pt: 0.5, color: PPTX.BORDER_COLOR },
      autoPage: false,
    });
    addFooter(slide);
  }

  const dataStrategy = research.dataStrategy;
  if (dataStrategy && dataStrategy.assetDetails.length > 0) {
    const slide = addSectionSlide(pptx, "Data Strategy");
    const assetData: PptxGenJS.TableRow[] = [
      [headerCell("ID"), headerCell("Relevance"), headerCell("Rationale"), headerCell("Quick Win")],
      ...dataStrategy.assetDetails.map(
        (a): PptxGenJS.TableRow => [
          bodyCell(a.id, { bold: true }),
          bodyCell(String(a.relevance), { align: "center" }),
          bodyCell(a.rationale),
          bodyCell(a.quickWin ? "Yes" : "No", { align: "center" }),
        ],
      ),
    ];
    slide.addTable(assetData, {
      x: PPTX.CONTENT_MARGIN + 0.3,
      y: 1.2,
      w: PPTX.CONTENT_W - 0.6,
      colW: [2, 1.5, 6, 1.5],
      border: { type: "solid", pt: 0.5, color: PPTX.BORDER_COLOR },
      autoPage: false,
    });
    addFooter(slide);
  }

  const demoNarrative = research.demoNarrative;
  if (demoNarrative?.demoFlow && demoNarrative.demoFlow.length > 0) {
    const slide = addSectionSlide(pptx, "Demo Flow");
    const items: PptxGenJS.TextProps[] = demoNarrative.demoFlow.flatMap((step) => [
      {
        text: `${step.step}. ${step.moment} (${step.assetId})`,
        options: {
          fontSize: 14,
          bold: true,
          color: PPTX.DB_DARK,
          breakLine: true,
          paraSpaceAfter: 2,
        } as PptxGenJS.TextPropsOptions,
      },
      {
        text: step.talkingPoint,
        options: {
          fontSize: 12,
          color: PPTX.TEXT_COLOR,
          bullet: true,
          breakLine: true,
          paraSpaceAfter: 6,
          indentLevel: 1,
        } as PptxGenJS.TextPropsOptions,
      },
    ]);
    slide.addText(items, {
      x: PPTX.CONTENT_MARGIN + 0.3,
      y: 1.2,
      w: PPTX.CONTENT_W - 0.6,
      h: 5.5,
      valign: "top",
      fontFace: "Calibri",
    });
    addFooter(slide);
  }

  if (demoNarrative?.killerMoments && demoNarrative.killerMoments.length > 0) {
    const moments = demoNarrative.killerMoments.slice(0, 4);
    for (const m of moments) {
      const slide = addSectionSlide(pptx, m.title);
      const items: PptxGenJS.TextProps[] = [
        {
          text: "Scenario",
          options: {
            fontSize: 12,
            bold: true,
            color: PPTX.DB_DARK,
            breakLine: true,
            paraSpaceAfter: 2,
          } as PptxGenJS.TextPropsOptions,
        },
        {
          text: m.scenario,
          options: {
            fontSize: 11,
            color: PPTX.TEXT_COLOR,
            breakLine: true,
            paraSpaceAfter: 8,
            indentLevel: 1,
          } as PptxGenJS.TextPropsOptions,
        },
        {
          text: "Insight",
          options: {
            fontSize: 12,
            bold: true,
            color: PPTX.DB_DARK,
            breakLine: true,
            paraSpaceAfter: 2,
          } as PptxGenJS.TextPropsOptions,
        },
        {
          text: m.insightStatement,
          options: {
            fontSize: 11,
            color: PPTX.TEXT_COLOR,
            breakLine: true,
            paraSpaceAfter: 8,
            indentLevel: 1,
          } as PptxGenJS.TextPropsOptions,
        },
        {
          text: "Expected Reaction",
          options: {
            fontSize: 12,
            bold: true,
            color: PPTX.DB_DARK,
            breakLine: true,
            paraSpaceAfter: 2,
          } as PptxGenJS.TextPropsOptions,
        },
        {
          text: m.expectedReaction,
          options: {
            fontSize: 11,
            color: PPTX.TEXT_COLOR,
            breakLine: true,
            paraSpaceAfter: 4,
            indentLevel: 1,
          } as PptxGenJS.TextPropsOptions,
        },
      ];
      slide.addText(items, {
        x: PPTX.CONTENT_MARGIN + 0.3,
        y: 1.2,
        w: PPTX.CONTENT_W - 0.6,
        h: 5.5,
        valign: "top",
        fontFace: "Calibri",
      });
      addFooter(slide);
    }
  }

  if (demoNarrative?.competitorAngles && demoNarrative.competitorAngles.length > 0) {
    const slide = addSectionSlide(pptx, "Competitive Positioning");
    const compData: PptxGenJS.TableRow[] = [
      [headerCell("Competitor"), headerCell("Their Move"), headerCell("Your Opportunity")],
      ...demoNarrative.competitorAngles.map(
        (c): PptxGenJS.TableRow => [
          bodyCell(c.competitor, { bold: true }),
          bodyCell(c.theirMove),
          bodyCell(c.yourOpportunity),
        ],
      ),
    ];
    slide.addTable(compData, {
      x: PPTX.CONTENT_MARGIN + 0.3,
      y: 1.2,
      w: PPTX.CONTENT_W - 0.6,
      colW: [2.5, 4.5, 4.5],
      border: { type: "solid", pt: 0.5, color: PPTX.BORDER_COLOR },
      autoPage: false,
    });
    addFooter(slide);
  }

  if (demoNarrative?.executiveTalkingPoints && demoNarrative.executiveTalkingPoints.length > 0) {
    const slide = addSectionSlide(pptx, "Executive Talking Points");
    const items: PptxGenJS.TextProps[] = demoNarrative.executiveTalkingPoints.flatMap((tp) => [
      {
        text: `${tp.assetId}: ${tp.headline}`,
        options: {
          fontSize: 14,
          bold: true,
          color: PPTX.DB_DARK,
          breakLine: true,
          paraSpaceAfter: 2,
        } as PptxGenJS.TextPropsOptions,
      },
      {
        text: tp.benchmarkTieIn,
        options: {
          fontSize: 12,
          color: PPTX.TEXT_COLOR,
          bullet: true,
          breakLine: true,
          paraSpaceAfter: 8,
          indentLevel: 1,
        } as PptxGenJS.TextPropsOptions,
      },
    ]);
    slide.addText(items, {
      x: PPTX.CONTENT_MARGIN + 0.3,
      y: 1.2,
      w: PPTX.CONTENT_W - 0.6,
      h: 5.5,
      valign: "top",
      fontFace: "Calibri",
    });
    addFooter(slide);
  }

  if (research.dataNarratives && research.dataNarratives.length > 0) {
    const slide = addSectionSlide(pptx, "Data Narratives");
    const cardW = 4;
    const cardH = 1.8;
    const gap = 0.3;
    let y = 1.2;
    let x = PPTX.CONTENT_MARGIN + 0.3;
    for (const n of research.dataNarratives.slice(0, 6)) {
      slide.addShape("rect", {
        x,
        y,
        w: cardW,
        h: cardH,
        fill: { color: PPTX.WARM_WHITE },
        line: { color: PPTX.BORDER_COLOR, width: 0.5 },
        rectRadius: 0.08,
      });
      slide.addText(n.title, {
        x: x + 0.1,
        y: y + 0.1,
        w: cardW - 0.2,
        fontSize: 12,
        bold: true,
        color: PPTX.DB_DARK,
        fontFace: "Calibri",
      });
      slide.addText(n.description, {
        x: x + 0.1,
        y: y + 0.45,
        w: cardW - 0.2,
        h: cardH - 0.7,
        fontSize: 10,
        color: PPTX.TEXT_COLOR,
        fontFace: "Calibri",
        valign: "top",
      });
      slide.addText(`Pattern: ${n.pattern}`, {
        x: x + 0.1,
        y: y + cardH - 0.35,
        w: cardW - 0.2,
        fontSize: 9,
        color: PPTX.MID_GRAY,
        fontFace: "Calibri",
      });
      x += cardW + gap;
      if (x + cardW > PPTX.SLIDE_W - PPTX.CONTENT_MARGIN - 0.3) {
        x = PPTX.CONTENT_MARGIN + 0.3;
        y += cardH + gap;
      }
    }
    addFooter(slide);
  }

  if (research.sources && research.sources.length > 0) {
    const slide = addSectionSlide(pptx, "Sources");
    const sourceData: PptxGenJS.TableRow[] = [
      [headerCell("Type"), headerCell("URL"), headerCell("Status"), headerCell("Characters")],
      ...research.sources.map(
        (s): PptxGenJS.TableRow => [
          bodyCell(s.type, { align: "center" }),
          bodyCell(s.title),
          bodyCell(s.status, { align: "center" }),
          bodyCell(String(s.charCount), { align: "right" }),
        ],
      ),
    ];
    slide.addTable(sourceData, {
      x: PPTX.CONTENT_MARGIN + 0.3,
      y: 1.2,
      w: PPTX.CONTENT_W - 0.6,
      colW: [2, 6, 1.5, 1.5],
      border: { type: "solid", pt: 0.5, color: PPTX.BORDER_COLOR },
      autoPage: false,
    });
    addFooter(slide);
  }

  const output = await pptx.write({ outputType: "nodebuffer" });
  return Buffer.from(output as ArrayBuffer);
}

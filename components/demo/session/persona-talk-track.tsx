"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  User,
  MessageSquare,
  Shield,
  Quote,
  HelpCircle,
} from "lucide-react";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";

interface PersonaTalkTrackProps {
  research: ResearchEngineResult;
}

interface Persona {
  id: string;
  label: string;
  caresAbout: string[];
  whatToSay: string;
  objection: string;
  proofToUse: string;
  bestNextQuestion: string;
}

function buildPersonas(research: ResearchEngineResult): Persona[] {
  const profile = research.companyProfile;
  const landscape = research.industryLandscape;
  const narrative = research.demoNarrative;
  const priorities = profile?.statedPriorities?.map((p) => p.priority) ?? [];
  const gaps = profile?.strategicGaps ?? [];
  const moments = narrative?.killerMoments ?? [];
  const competitors = narrative?.competitorAngles ?? [];
  const forces = landscape?.marketForces ?? [];
  const talkingPts = narrative?.executiveTalkingPoints ?? [];

  return [
    {
      id: "ceo",
      label: "CEO",
      caresAbout: [
        priorities[0] ?? "Revenue growth and competitive position",
        gaps[0]?.gap ?? "Strategic execution gaps",
        "Board-level visibility on data ROI",
      ],
      whatToSay:
        moments[0]
          ? `"We've seen companies in your space close the gap on ${moments[0].title} — here's what the leading ones changed first."`
          : `"Your stated priority around ${priorities[0] ?? "transformation"} aligns directly with what we're seeing in top-performing ${research.industryId} companies."`,
      objection: "\"We already have a data team working on this.\"",
      proofToUse:
        talkingPts[0]?.benchmarkTieIn ??
        moments[0]?.benchmarkCitation ??
        "Industry benchmark data showing peer comparison",
      bestNextQuestion:
        "\"What would success look like for your board in the next 12 months on data-driven outcomes?\"",
    },
    {
      id: "coo",
      label: "COO",
      caresAbout: [
        "Operational efficiency and cost reduction",
        gaps[1]?.gap ?? "Process automation gaps",
        "Time-to-insight for operational decisions",
      ],
      whatToSay:
        `"We've mapped ${research.dataStrategy?.assetDetails?.length ?? "your key"} data assets to operational outcomes — the biggest quick win is ${
          research.dataStrategy?.assetDetails?.find((a) => a.quickWin)?.rationale ?? "automating manual reporting"
        }."`,
      objection: "\"Our ops team doesn't trust the data.\"",
      proofToUse:
        forces.find((f) => f.urgency === "accelerating")?.benchmarkCitation ??
        "Data quality metrics showing current state vs potential",
      bestNextQuestion:
        "\"Which operational decision takes the longest to make today because of data gaps?\"",
    },
    {
      id: "cio-cto",
      label: "CIO / CTO",
      caresAbout: [
        "Platform consolidation and technical debt",
        "Data architecture modernisation",
        landscape?.technologyDisruptors ?? "Emerging tech adoption",
      ],
      whatToSay:
        `"Your current architecture ${
          research.dataStrategy?.dataMaturityAssessment === "data-native"
            ? "is strong — the opportunity is accelerating value extraction"
            : "has clear modernisation potential — we can show exactly where to start"
        }."`,
      objection: "\"We're already invested in [competitor platform].\"",
      proofToUse:
        competitors[0]
          ? `Competitive positioning: ${competitors[0].yourOpportunity}`
          : "Architecture comparison showing Databricks differentiation",
      bestNextQuestion:
        "\"What's the biggest technical bottleneck preventing your data team from shipping faster?\"",
    },
    {
      id: "head-digital",
      label: "Head of Digital",
      caresAbout: [
        "Customer experience and personalisation",
        priorities.find((p) => p.toLowerCase().includes("digital") || p.toLowerCase().includes("customer")) ?? "Digital transformation velocity",
        "AI/ML adoption roadmap",
      ],
      whatToSay:
        moments[1]
          ? `"${moments[1].insightStatement} — and we can demonstrate this with your own data patterns."`
          : `"The leading ${research.industryId} companies are using their data assets to drive ${priorities[0]?.toLowerCase() ?? "personalisation"} at scale."`,
      objection: "\"We need to fix our data quality before doing anything with AI.\"",
      proofToUse:
        talkingPts[1]?.benchmarkTieIn ?? "Case study showing iterative approach to data + AI value",
      bestNextQuestion:
        "\"What customer-facing use case would have the most impact if you had the data ready tomorrow?\"",
    },
    {
      id: "risk-compliance",
      label: "Risk / Compliance",
      caresAbout: [
        landscape?.regulatoryPressures ?? "Regulatory compliance requirements",
        "Data governance and lineage",
        "Audit readiness and risk reduction",
      ],
      whatToSay:
        `"We've identified ${
          profile?.swotSummary?.threats?.length ?? "several"
        } risk factors in your landscape — here's how a unified data platform addresses each one."`,
      objection: "\"Governance tools already cover our compliance needs.\"",
      proofToUse:
        landscape?.regulatoryPressures
          ? `Regulatory landscape: ${landscape.regulatoryPressures.slice(0, 100)}...`
          : "Unity Catalog governance capabilities with lineage tracking",
      bestNextQuestion:
        "\"How long does it currently take to respond to a regulatory data request?\"",
    },
  ];
}

export function PersonaTalkTrack({ research }: PersonaTalkTrackProps) {
  const personas = buildPersonas(research);
  const [activePersona, setActivePersona] = useState(personas[0]?.id ?? "ceo");
  const persona = personas.find((p) => p.id === activePersona) ?? personas[0];

  if (!persona) return null;

  return (
    <div className="space-y-4">
      {/* Persona pills */}
      <div className="flex flex-wrap gap-2">
        {personas.map((p) => (
          <button
            key={p.id}
            onClick={() => setActivePersona(p.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              activePersona === p.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            }`}
          >
            <User className="h-3 w-3" />
            {p.label}
          </button>
        ))}
      </div>

      {/* Persona detail */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <User className="h-4 w-4 text-muted-foreground" />
            {persona.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* What they care about */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Badge variant="outline" className="text-[10px] gap-1 font-semibold">
                What they care about
              </Badge>
            </div>
            <ul className="space-y-1">
              {persona.caresAbout.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  {typeof item === "string" ? item : String(item)}
                </li>
              ))}
            </ul>
          </div>

          {/* What to say */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <MessageSquare className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                What to say
              </span>
            </div>
            <div className="rounded-lg border-l-2 border-l-blue-500 bg-blue-500/[0.03] px-3.5 py-2.5">
              <p className="text-sm leading-relaxed italic">{persona.whatToSay}</p>
            </div>
          </div>

          {/* Objection */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Shield className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Expect this objection
              </span>
            </div>
            <p className="text-sm text-muted-foreground italic">{persona.objection}</p>
          </div>

          {/* Proof */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <Quote className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Proof to use
              </span>
            </div>
            <p className="text-sm text-muted-foreground">{persona.proofToUse}</p>
          </div>

          {/* Next question */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <HelpCircle className="h-3.5 w-3.5 text-violet-500" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Best next question
              </span>
            </div>
            <div className="rounded-lg border-l-2 border-l-violet-500 bg-violet-500/[0.03] px-3.5 py-2.5">
              <p className="text-sm leading-relaxed italic">{persona.bestNextQuestion}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

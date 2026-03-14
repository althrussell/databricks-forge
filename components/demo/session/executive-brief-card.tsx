"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Briefcase } from "lucide-react";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";

interface ExecutiveBriefCardProps {
  research: ResearchEngineResult;
}

function deriveBrief(research: ResearchEngineResult) {
  const profile = research.companyProfile;
  const landscape = research.industryLandscape;

  const whoTheyAre =
    profile?.statedPriorities?.[0]
      ? `A ${research.industryId} company prioritising ${profile.statedPriorities
          .slice(0, 2)
          .map((p) => p.priority.toLowerCase())
          .join(" and ")}`
      : `A ${research.industryId} organisation with ${research.sources?.length ?? 0} research sources analysed`;

  const whatTheyCareAbout =
    profile?.inferredPriorities
      ?.slice(0, 3)
      .map((p) => p.priority)
      .join("; ") ??
    profile?.statedPriorities
      ?.slice(0, 3)
      .map((p) => p.priority)
      .join("; ") ??
    "Data-driven transformation and operational efficiency";

  const likelyBroken =
    profile?.strategicGaps?.[0]?.gap ??
    profile?.swotSummary?.weaknesses?.[0] ??
    "Gap between strategic ambition and data capability";

  const bestOpening =
    research.demoNarrative?.killerMoments?.[0]?.scenario ??
    research.demoNarrative?.executiveTalkingPoints?.[0]?.headline ??
    (landscape?.marketForces?.[0]
      ? `Their exposure to "${landscape.marketForces[0].force}" creates a compelling entry point`
      : "Demonstrate the gap between their current state and what best-in-class looks like");

  return { whoTheyAre, whatTheyCareAbout, likelyBroken, bestOpening };
}

export function ExecutiveBriefCard({ research }: ExecutiveBriefCardProps) {
  const brief = deriveBrief(research);

  const rows = [
    { label: "Who they are", value: brief.whoTheyAre },
    { label: "What they care about", value: brief.whatTheyCareAbout },
    { label: "What is likely broken", value: brief.likelyBroken },
    { label: "Best opening angle", value: brief.bestOpening },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Executive Brief
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {row.label}
            </p>
            <p className="mt-0.5 text-sm leading-relaxed">{row.value}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

"use client";

import {
  Target,
  Sparkles,
  AlertTriangle,
  Users,
  ShieldCheck,
} from "lucide-react";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";

interface MeetingSummaryStripProps {
  research: ResearchEngineResult | null;
}

interface SummaryCard {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}

function deriveSummaryCards(research: ResearchEngineResult | null): SummaryCard[] {
  if (!research) return [];

  const cards: SummaryCard[] = [];

  const topPriority =
    research.companyProfile?.statedPriorities?.[0]?.priority ??
    research.companyProfile?.inferredPriorities?.[0]?.priority;
  if (topPriority) {
    cards.push({
      label: "Top Priority",
      value: topPriority,
      icon: Target,
      accent: "text-blue-600 dark:text-blue-400",
    });
  }

  const bestUseCase =
    research.demoNarrative?.killerMoments?.[0]?.title ??
    research.dataStrategy?.prioritisedUseCases?.[0]?.name;
  if (bestUseCase) {
    cards.push({
      label: "Best Use Case",
      value: bestUseCase,
      icon: Sparkles,
      accent: "text-violet-600 dark:text-violet-400",
    });
  }

  const mainRisk =
    research.companyProfile?.swotSummary?.threats?.[0] ??
    research.companyProfile?.strategicGaps?.[0]?.gap;
  if (mainRisk) {
    cards.push({
      label: "Main Risk",
      value: mainRisk,
      icon: AlertTriangle,
      accent: "text-amber-600 dark:text-amber-400",
    });
  }

  const buyerPersona = research.demoNarrative?.executiveTalkingPoints?.[0]?.headline
    ? "CxO / Digital Leader"
    : "Line of Business Owner";
  cards.push({
    label: "Best Buyer",
    value: buyerPersona,
    icon: Users,
    accent: "text-emerald-600 dark:text-emerald-400",
  });

  const sourceCount = research.sources?.filter((s) => s.status === "ready").length ?? 0;
  const conf = research.confidence ?? 0;
  const proofLabel =
    conf >= 0.75 && sourceCount >= 3
      ? "Strong"
      : conf >= 0.45
        ? "Moderate"
        : "Limited";
  cards.push({
    label: "Proof Strength",
    value: `${proofLabel} (${sourceCount} sources)`,
    icon: ShieldCheck,
    accent: conf >= 0.75 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400",
  });

  return cards.slice(0, 5);
}

export function MeetingSummaryStrip({ research }: MeetingSummaryStripProps) {
  const cards = deriveSummaryCards(research);

  if (cards.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className="flex items-start gap-2.5 rounded-lg border bg-card px-3.5 py-3"
        >
          <card.icon className={`mt-0.5 h-4 w-4 shrink-0 ${card.accent}`} />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              {card.label}
            </p>
            <p className="mt-0.5 text-sm font-medium leading-snug line-clamp-2">
              {card.value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

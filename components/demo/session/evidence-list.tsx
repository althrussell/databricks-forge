"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Clock, FileText } from "lucide-react";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";

interface EvidenceListProps {
  research: ResearchEngineResult;
}

interface EvidenceItem {
  claim: string;
  confidence: "high" | "medium" | "low";
  evidenceCount: number;
  freshness: "recent" | "dated" | "unknown";
  snippets: string[];
}

function buildEvidence(research: ResearchEngineResult): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const readySources = research.sources?.filter((s) => s.status === "ready") ?? [];
  const sourceCount = readySources.length;

  const moments = research.demoNarrative?.killerMoments ?? [];
  for (const m of moments) {
    items.push({
      claim: m.title,
      confidence:
        m.benchmarkCitation && sourceCount >= 3 ? "high" : sourceCount >= 2 ? "medium" : "low",
      evidenceCount: m.linkedAssets?.length ?? 0,
      freshness: sourceCount >= 3 ? "recent" : "unknown",
      snippets: [
        m.insightStatement,
        m.benchmarkCitation ?? "",
        m.dataStory,
      ].filter(Boolean),
    });
  }

  const talkingPoints = research.demoNarrative?.executiveTalkingPoints ?? [];
  for (const tp of talkingPoints) {
    if (!items.some((i) => i.claim === tp.headline)) {
      items.push({
        claim: tp.headline,
        confidence: tp.benchmarkTieIn ? "medium" : "low",
        evidenceCount: 1,
        freshness: "unknown",
        snippets: [tp.benchmarkTieIn].filter(Boolean),
      });
    }
  }

  const priorities = research.companyProfile?.statedPriorities ?? [];
  for (const p of priorities.slice(0, 3)) {
    if (!items.some((i) => i.claim.includes(p.priority))) {
      items.push({
        claim: p.priority,
        confidence: p.source ? "high" : "medium",
        evidenceCount: p.source ? 1 : 0,
        freshness: p.source ? "recent" : "unknown",
        snippets: p.source ? [`Source: ${p.source}`] : [],
      });
    }
  }

  return items;
}

const confidenceStyles = {
  high: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  low: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20",
};

const freshnessStyles = {
  recent: "text-emerald-600 dark:text-emerald-400",
  dated: "text-amber-600 dark:text-amber-400",
  unknown: "text-muted-foreground",
};

export function EvidenceList({ research }: EvidenceListProps) {
  const items = buildEvidence(research);

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No evidence items generated. Run a Full or Balanced research preset for evidence tracking.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <Card key={i}>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold leading-snug">{item.claim}</h4>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${confidenceStyles[item.confidence]}`}
                  >
                    <ShieldCheck className="mr-1 h-3 w-3" />
                    {item.confidence}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    <FileText className="mr-0.5 inline h-3 w-3" />
                    {item.evidenceCount} evidence point{item.evidenceCount !== 1 ? "s" : ""}
                  </span>
                  <span className={`text-[11px] ${freshnessStyles[item.freshness]}`}>
                    <Clock className="mr-0.5 inline h-3 w-3" />
                    {item.freshness}
                  </span>
                </div>
              </div>
            </div>
            {item.snippets.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t pt-3">
                {item.snippets.map((s, si) => (
                  <p key={si} className="text-xs text-muted-foreground leading-relaxed pl-3 border-l-2 border-muted">
                    {s}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

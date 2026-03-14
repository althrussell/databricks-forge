"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  User,
  Zap,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import type {
  KillerMoment,
  DataAssetDetail,
  ResearchEngineResult,
} from "@/lib/demo/research-engine/types";

interface OpportunityCardProps {
  moment: KillerMoment;
  rank: number;
  assetDetails?: DataAssetDetail[];
  onUseTalkTrack?: () => void;
}

function ConfidenceDot({ level }: { level: "high" | "medium" | "low" }) {
  const styles = {
    high: "bg-emerald-500",
    medium: "bg-amber-500",
    low: "bg-red-500",
  };
  return (
    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
      <span className={`h-1.5 w-1.5 rounded-full ${styles[level]}`} />
      {level}
    </span>
  );
}

export function OpportunityCard({
  moment,
  rank,
  assetDetails,
  onUseTalkTrack,
}: OpportunityCardProps) {
  const isTop3 = rank <= 3;
  const linkedAssets =
    assetDetails?.filter((a) => moment.linkedAssets?.includes(a.id)) ?? [];
  const confidence = linkedAssets.some((a) => a.relevance >= 8)
    ? "high"
    : linkedAssets.some((a) => a.relevance >= 5)
      ? "medium"
      : "low";

  return (
    <Card
      className={`transition-colors ${
        isTop3 ? "border-primary/20 shadow-sm" : ""
      }`}
    >
      <CardContent className="pt-5 pb-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              isTop3
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {rank}
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold leading-snug">{moment.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
              {moment.scenario}
            </p>
          </div>
        </div>

        {/* Detail rows */}
        <div className="mt-4 grid gap-2.5 text-sm">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Business Pain
            </span>
            <p className="mt-0.5 text-muted-foreground">{moment.dataStory}</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Value Hypothesis
            </span>
            <p className="mt-0.5 text-muted-foreground">{moment.insightStatement}</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              Discovery Hook
            </span>
            <p className="mt-0.5 text-muted-foreground">{moment.expectedReaction}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {linkedAssets.length > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Sparkles className="h-3 w-3" />
              {linkedAssets.length} data asset{linkedAssets.length > 1 ? "s" : ""}
            </Badge>
          )}
          {moment.benchmarkCitation && (
            <Badge variant="secondary" className="text-[10px]">
              {moment.benchmarkCitation}
            </Badge>
          )}
          <ConfidenceDot level={confidence} />
          <Badge
            variant="outline"
            className="text-[10px] gap-1 border-amber-500/20 text-amber-600 dark:text-amber-400"
          >
            <Zap className="h-3 w-3" />
            {isTop3 ? "High" : "Medium"} urgency
          </Badge>
        </div>

        {/* CTA */}
        {onUseTalkTrack && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <User className="h-3 w-3" />
              Ideal buyer: {linkedAssets.length > 0 ? "CxO / Head of Data" : "Line of Business"}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onUseTalkTrack}
            >
              <MessageSquare className="h-3 w-3" />
              Use in Talk Track
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface OpportunitiesTabProps {
  research: ResearchEngineResult;
  onSwitchToTalkTrack?: () => void;
}

export function OpportunitiesTab({ research, onSwitchToTalkTrack }: OpportunitiesTabProps) {
  const moments = research.demoNarrative?.killerMoments ?? [];
  const assetDetails = research.dataStrategy?.assetDetails ?? [];

  if (moments.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No opportunities generated yet. Run a Full research preset for detailed opportunity cards.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {moments.map((m, i) => (
        <OpportunityCard
          key={i}
          moment={m}
          rank={i + 1}
          assetDetails={assetDetails}
          onUseTalkTrack={onSwitchToTalkTrack}
        />
      ))}
    </div>
  );
}

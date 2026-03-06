"use client";

import { SummaryCard } from "./summary-card";
import { CoverageGapCard } from "./coverage-gap-card";
import { effectiveScores } from "@/lib/domain/scoring";
import { RUN_DETAIL } from "@/lib/help-text";
import type { UseCase } from "@/lib/domain/types";
import type { CoverageResult } from "@/lib/domain/industry-coverage";

export function SummaryCardsSection({
  useCases,
  coverageData,
  onUseCasesClick,
  onOverviewClick,
  onInsightsOpen,
}: {
  useCases: UseCase[];
  coverageData: CoverageResult | null;
  onUseCasesClick: () => void;
  onOverviewClick: () => void;
  onInsightsOpen: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-5">
      <SummaryCard
        title="Total Use Cases"
        value={String(useCases.length)}
        tip={RUN_DETAIL.totalUseCases}
        onClick={onUseCasesClick}
      />
      <SummaryCard
        title="Domains"
        value={String(new Set(useCases.map((uc) => uc.domain)).size)}
        tip={RUN_DETAIL.domainCount}
        onClick={() => {
          onOverviewClick();
          onInsightsOpen();
        }}
      />
      <SummaryCard
        title="AI Use Cases"
        value={String(useCases.filter((uc) => uc.type === "AI").length)}
        tip={RUN_DETAIL.aiUseCases}
        onClick={onUseCasesClick}
      />
      <SummaryCard
        title="Avg Score"
        value={
          useCases.length > 0
            ? `${Math.round(
                (useCases.reduce((s, uc) => s + effectiveScores(uc).overall, 0) / useCases.length) *
                  100,
              )}%`
            : "N/A"
        }
        tip={RUN_DETAIL.avgScore}
        onClick={onOverviewClick}
      />
      <CoverageGapCard
        coverageData={coverageData}
        onClick={() => {
          onOverviewClick();
          onInsightsOpen();
        }}
      />
    </div>
  );
}

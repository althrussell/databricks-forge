"use client";

import { Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface CoverageGapCardProps {
  coverageData: {
    overallCoverage: number;
    gapCount: number;
  } | null;
  onClick?: () => void;
}

export function CoverageGapCard({ coverageData, onClick }: CoverageGapCardProps) {
  if (!coverageData) {
    return (
      <Card className="opacity-60">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Coverage</p>
          <p className="text-2xl font-bold text-muted-foreground">N/A</p>
          <p className="text-xs text-muted-foreground">No industry map</p>
        </CardContent>
      </Card>
    );
  }

  const pct = Math.round(coverageData.overallCoverage * 100);
  const colorClass =
    pct >= 75
      ? "text-green-600 dark:text-green-400"
      : pct >= 25
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  return (
    <Card
      className={
        onClick
          ? "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30"
          : ""
      }
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-violet-500" />
          <p className="text-sm text-muted-foreground">Coverage</p>
        </div>
        <p className={`text-2xl font-bold ${colorClass}`}>{pct}%</p>
        {coverageData.gapCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {coverageData.gapCount} gap{coverageData.gapCount !== 1 ? "s" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

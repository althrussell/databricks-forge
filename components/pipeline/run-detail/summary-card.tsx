"use client";

import { Card, CardContent } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";

export interface SummaryCardProps {
  title: string;
  value: string;
  tip?: string;
  onClick?: () => void;
}

export function SummaryCard({ title, value, tip, onClick }: SummaryCardProps) {
  return (
    <Card
      className={
        onClick ? "cursor-pointer transition-colors hover:border-primary/40 hover:bg-muted/30" : ""
      }
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-1.5">
          <p className="text-sm text-muted-foreground">{title}</p>
          {tip && <InfoTip tip={tip} />}
        </div>
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}

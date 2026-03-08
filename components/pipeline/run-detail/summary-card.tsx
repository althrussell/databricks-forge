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
        onClick
          ? "cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
          : ""
      }
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {title}
          </p>
          {tip && <InfoTip tip={tip} />}
        </div>
        <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/environment/stat-card";
import type { GovernanceQualityStats } from "@/app/environment/types";
import { BarChart3, Clock, Search, ShieldAlert } from "lucide-react";

function pctOrNA(value: number | null | undefined): string {
  if (value == null) return "N/A";
  return `${Math.round(value * 100)}%`;
}

export interface GovernanceQualityViewProps {
  quality: GovernanceQualityStats | null;
}

export function GovernanceQualityView({ quality }: GovernanceQualityViewProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Governance Quality</CardTitle>
          <CardDescription>
            Quality and governance KPIs moved from dashboard into this Estate-focused view.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard
              title="Consultant Readiness"
              value={pctOrNA(quality?.avgConsultantReadiness)}
              icon={<BarChart3 className="h-4 w-4" />}
              tooltip="30-day average consultant-readiness across completed runs."
            />
            <StatCard
              title="Assistant Quality"
              value={pctOrNA(quality?.avgAssistantScore)}
              icon={<Search className="h-4 w-4" />}
              tooltip="30-day average assistant response quality score."
            />
            <StatCard
              title="Gate Pass Rate"
              value={pctOrNA(quality?.releaseGatePassRate)}
              icon={<ShieldAlert className="h-4 w-4" />}
              tooltip="Share of runs passing consultant-readiness release gates."
            />
            <StatCard
              title="Benchmark Freshness"
              value={pctOrNA(quality?.benchmarkFreshnessRate)}
              icon={<Clock className="h-4 w-4" />}
              tooltip="Share of published benchmarks still within freshness TTL."
            />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Benchmark industry coverage: {quality?.benchmarkIndustryCoverage ?? 0} industries.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import { useState, useMemo } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UseCase } from "@/lib/domain/types";

/**
 * Palette of distinguishable colours for overlaying multiple use cases.
 * Using oklch for perceptual uniformity with high chroma.
 */
const PALETTE = [
  "oklch(0.65 0.22 160)", // teal-green
  "oklch(0.65 0.22 280)", // violet
  "oklch(0.70 0.20 40)",  // orange
  "oklch(0.60 0.22 330)", // magenta-pink
  "oklch(0.70 0.18 200)", // sky-blue
  "oklch(0.68 0.20 90)",  // lime-gold
  "oklch(0.58 0.18 250)", // indigo
  "oklch(0.72 0.16 15)",  // coral
  "oklch(0.62 0.20 140)", // emerald
  "oklch(0.66 0.22 310)", // purple-rose
];

type ViewMode = "top10" | "domain-avg" | "all";

interface ScoreRadarOverviewProps {
  useCases: UseCase[];
}

export function ScoreRadarOverview({ useCases }: ScoreRadarOverviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>(
    useCases.length <= 10 ? "all" : "top10"
  );

  // Compute domain averages
  const domainAverages = useMemo(() => {
    const map = new Map<string, { sum: number[]; count: number }>();
    for (const uc of useCases) {
      const entry = map.get(uc.domain) ?? { sum: [0, 0, 0, 0], count: 0 };
      entry.sum[0] += uc.priorityScore;
      entry.sum[1] += uc.feasibilityScore;
      entry.sum[2] += uc.impactScore;
      entry.sum[3] += uc.overallScore;
      entry.count++;
      map.set(uc.domain, entry);
    }
    return [...map.entries()]
      .map(([domain, { sum, count }]) => ({
        label: domain,
        priority: Math.round((sum[0] / count) * 100),
        feasibility: Math.round((sum[1] / count) * 100),
        impact: Math.round((sum[2] / count) * 100),
        overall: Math.round((sum[3] / count) * 100),
        count,
      }))
      .sort((a, b) => b.overall - a.overall);
  }, [useCases]);

  // Select the series to show based on the view mode
  const series = useMemo(() => {
    if (viewMode === "domain-avg") {
      return domainAverages.slice(0, 10).map((d) => ({
        key: d.label,
        label: `${d.label} (${d.count})`,
        priority: d.priority,
        feasibility: d.feasibility,
        impact: d.impact,
        overall: d.overall,
      }));
    }

    const sorted = [...useCases].sort(
      (a, b) => b.overallScore - a.overallScore
    );
    const subset = viewMode === "top10" ? sorted.slice(0, 10) : sorted;
    return subset.map((uc) => ({
      key: uc.id,
      label: uc.name.length > 35 ? uc.name.slice(0, 32) + "..." : uc.name,
      priority: Math.round(uc.priorityScore * 100),
      feasibility: Math.round(uc.feasibilityScore * 100),
      impact: Math.round(uc.impactScore * 100),
      overall: Math.round(uc.overallScore * 100),
    }));
  }, [viewMode, useCases, domainAverages]);

  // Build radar data
  const metrics = ["Priority", "Feasibility", "Impact", "Overall"] as const;
  const radarData = metrics.map((metric) => {
    const row: Record<string, string | number> = { metric };
    for (const s of series) {
      const fieldMap: Record<string, keyof typeof s> = {
        Priority: "priority",
        Feasibility: "feasibility",
        Impact: "impact",
        Overall: "overall",
      };
      row[s.key] = s[fieldMap[metric]];
    }
    return row;
  });

  // Limit to 10 series maximum for readability
  const displaySeries = series.slice(0, 10);
  const isTruncated = series.length > 10;

  if (useCases.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-sm font-medium">
            Score Landscape
          </CardTitle>
          <CardDescription>
            Compare score profiles across{" "}
            {viewMode === "domain-avg" ? "domains" : "use cases"}
            {isTruncated && (
              <span className="text-muted-foreground"> (top 10 shown)</span>
            )}
          </CardDescription>
        </div>
        <Select
          value={viewMode}
          onValueChange={(v) => setViewMode(v as ViewMode)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="top10">Top 10 Use Cases</SelectItem>
            <SelectItem value="domain-avg">Domain Averages</SelectItem>
            {useCases.length <= 20 && (
              <SelectItem value="all">All Use Cases</SelectItem>
            )}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={340}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid
              stroke="hsl(var(--border))"
              strokeOpacity={0.5}
            />
            <PolarAngleAxis
              dataKey="metric"
              tick={{ fontSize: 12, fontWeight: 600, fill: "hsl(var(--foreground))" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 100]}
              tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
              tickCount={5}
              axisLine={false}
            />
            {displaySeries.map((s, i) => (
              <Radar
                key={s.key}
                name={s.label}
                dataKey={s.key}
                stroke={PALETTE[i % PALETTE.length]}
                fill={PALETTE[i % PALETTE.length]}
                fillOpacity={0.05}
                strokeWidth={2}
                dot={displaySeries.length <= 5}
              />
            ))}
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                borderColor: "hsl(var(--border))",
                borderRadius: "var(--radius)",
                fontSize: 12,
                maxWidth: 260,
              }}
              formatter={(value: number) => [`${value}%`, undefined]}
            />
            {displaySeries.length <= 8 && (
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                iconType="circle"
                iconSize={8}
              />
            )}
          </RadarChart>
        </ResponsiveContainer>

        {/* Compact legend for many series */}
        {displaySeries.length > 8 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {displaySeries.map((s, i) => (
              <Badge
                key={s.key}
                variant="outline"
                className="gap-1.5 text-xs font-normal"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
                />
                {s.label}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

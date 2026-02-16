"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface ScoreRadarChartProps {
  priority: number;
  feasibility: number;
  impact: number;
  overall: number;
  size?: number;
}

export function ScoreRadarChart({
  priority,
  feasibility,
  impact,
  overall,
  size = 200,
}: ScoreRadarChartProps) {
  const data = [
    { metric: "Priority", score: Math.round(priority * 100) },
    { metric: "Feasibility", score: Math.round(feasibility * 100) },
    { metric: "Impact", score: Math.round(impact * 100) },
    { metric: "Overall", score: Math.round(overall * 100) },
  ];

  return (
    <ResponsiveContainer width="100%" height={size}>
      <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid className="stroke-border" />
        <PolarAngleAxis
          dataKey="metric"
          tick={{ fontSize: 11 }}
          className="fill-muted-foreground"
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fontSize: 9 }}
          className="fill-muted-foreground"
        />
        <Radar
          dataKey="score"
          stroke="var(--color-chart-1)"
          fill="var(--color-chart-1)"
          fillOpacity={0.25}
          strokeWidth={2}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--card))",
            borderColor: "hsl(var(--border))",
            borderRadius: "var(--radius)",
            fontSize: 12,
          }}
          formatter={(value) => [`${value}%`, "Score"]}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface DomainBreakdownChartProps {
  data: { domain: string; count: number }[];
  title?: string;
}

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "oklch(0.60 0.15 180)",
  "oklch(0.65 0.18 320)",
  "oklch(0.70 0.12 90)",
];

export function DomainBreakdownChart({
  data,
  title = "Use Cases by Domain",
}: DomainBreakdownChartProps) {
  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-visible">
        <ResponsiveContainer width="100%" height={240} style={{ overflow: "visible" }}>
          <PieChart>
            <Pie
              data={data}
              dataKey="count"
              nameKey="domain"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
              label={({ name, value }) =>
                data.length <= 6 ? `${name} (${value})` : `${value}`
              }
              labelLine={false}
              fontSize={10}
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-card)",
                color: "var(--color-card-foreground)",
                borderColor: "var(--color-border)",
                borderRadius: "var(--radius)",
                fontSize: 12,
              }}
            />
            {data.length > 6 && (
              <Legend
                wrapperStyle={{ fontSize: 11 }}
                iconType="circle"
                iconSize={8}
              />
            )}
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TypeSplitChartProps {
  aiCount: number;
  statisticalCount: number;
  title?: string;
}

export function TypeSplitChart({
  aiCount,
  statisticalCount,
  title = "AI vs Statistical",
}: TypeSplitChartProps) {
  const data = [
    { name: "AI", value: aiCount },
    { name: "Statistical", value: statisticalCount },
  ].filter((d) => d.value > 0);

  if (data.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={45}
              outerRadius={75}
              paddingAngle={4}
              label={({ name, value }) => `${name} (${value})`}
              labelLine={false}
              fontSize={12}
            >
              <Cell fill="oklch(0.55 0.18 280)" />
              <Cell fill="oklch(0.60 0.15 175)" />
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
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

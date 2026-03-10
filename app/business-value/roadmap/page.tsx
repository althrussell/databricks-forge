import { Suspense } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { getPortfolioData } from "@/lib/lakebase/portfolio";
import { DeliveryTimelineChart } from "@/components/business-value/delivery-timeline-chart";
import type { RoadmapPhase } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const PHASE_CONFIG: Record<RoadmapPhase, { label: string; timeframe: string }> = {
  quick_wins: { label: "Quick Wins", timeframe: "0-3 months" },
  foundation: { label: "Foundation", timeframe: "3-9 months" },
  transformation: { label: "Transformation", timeframe: "9-18 months" },
};

function RoadmapSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

async function RoadmapContent() {
  let portfolio;
  try {
    portfolio = await getPortfolioData();
  } catch {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">Failed to load roadmap data.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/runs">Select a run to see detailed roadmap</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const byPhase = portfolio.byPhase;
  const totalPhases = Object.values(byPhase).reduce((s, p) => s + p.count, 0);

  if (totalPhases === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-muted-foreground">No roadmap phases yet.</p>
            <Button asChild variant="outline" className="mt-4">
              <Link href="/runs">Select a run to see detailed roadmap</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const phaseOrder: RoadmapPhase[] = ["quick_wins", "foundation", "transformation"];
  const chartData = phaseOrder.map((phase) => ({
    name: PHASE_CONFIG[phase].label,
    count: byPhase[phase].count,
  }));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-lg font-semibold">Phase Summary</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {phaseOrder.map((phase) => {
            const config = PHASE_CONFIG[phase];
            const { count } = byPhase[phase];
            return (
              <Card key={phase}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground">{config.timeframe}</p>
                  <p className="text-2xl font-bold">{count}</p>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/runs">View Details</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <DeliveryTimelineChart phases={chartData} />
      </section>

      <section>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-8">
            <p className="text-sm text-muted-foreground">
              Select a run to see detailed roadmap with use case assignments and dependencies.
            </p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/runs">Select a run to see detailed roadmap</Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

export default function RoadmapPage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="Implementation Roadmap"
        subtitle="Phase-based delivery timeline across discovery runs"
      />

      <Suspense fallback={<RoadmapSkeleton />}>
        <RoadmapContent />
      </Suspense>
    </div>
  );
}

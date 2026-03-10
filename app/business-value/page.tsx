import { Suspense } from "react";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { getPortfolioData } from "@/lib/lakebase/portfolio";
import { formatCurrency } from "@/lib/utils";
import type { BusinessValuePortfolio } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

function PortfolioSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function formatValueRange(low: number, mid: number, high: number): string {
  if (low === 0 && mid === 0 && high === 0) return "$0";
  return `${formatCurrency(low)} - ${formatCurrency(high)}`;
}

function InsightCard({
  title,
  description,
  severity,
}: {
  title: string;
  description: string;
  severity: "opportunity" | "risk" | "insight";
}) {
  const borderColor =
    severity === "opportunity"
      ? "border-l-green-500"
      : severity === "risk"
        ? "border-l-red-500"
        : "border-l-blue-500";

  return (
    <Card className={`border-l-4 ${borderColor}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

async function PortfolioContent() {
  let portfolio: BusinessValuePortfolio;
  try {
    portfolio = await getPortfolioData();
  } catch {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">Failed to load portfolio data.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/configure">Run a discovery pipeline first</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const hasData =
    portfolio.totalUseCases > 0 ||
    portfolio.deliveredValue > 0 ||
    Object.values(portfolio.byPhase).some((p) => p.count > 0);

  if (!hasData) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">No portfolio data yet.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link href="/configure">Run a discovery pipeline first</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const synthesis = portfolio.latestSynthesis;
  const keyFindings = synthesis?.keyFindings ?? [];
  const displayFindings = keyFindings.slice(0, 5);

  const topDomains = [...portfolio.byDomain]
    .sort((a, b) => (b.valueMid || b.useCaseCount) - (a.valueMid || a.useCaseCount))
    .slice(0, 6);

  const maxDomainValue = Math.max(
    ...portfolio.byDomain.map((d) => d.valueMid || d.useCaseCount),
    1,
  );

  return (
    <div className="space-y-8">
      {displayFindings.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Key Findings</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {displayFindings.map((f, i) => (
              <InsightCard
                key={i}
                title={f.title}
                description={f.description}
                severity={f.severity}
              />
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">Value Overview</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Estimated Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {formatValueRange(
                  portfolio.totalEstimatedValue.low,
                  portfolio.totalEstimatedValue.mid,
                  portfolio.totalEstimatedValue.high,
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Quick Wins
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">
                {synthesis?.quickWinCount ?? portfolio.byPhase.quick_wins.count}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Delivered Value
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(portfolio.deliveredValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Use Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{portfolio.totalUseCases}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {topDomains.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Strategic Themes</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {topDomains.map((d) => (
              <Card key={d.domain}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{d.domain}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold">
                      {formatCurrency(d.valueMid || d.useCaseCount * 1000)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {d.useCaseCount} use cases
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 text-lg font-semibold">Phase Distribution</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Quick Wins</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{portfolio.byPhase.quick_wins.count}</p>
              <p className="text-xs text-muted-foreground">0-3 months</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Foundation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{portfolio.byPhase.foundation.count}</p>
              <p className="text-xs text-muted-foreground">3-9 months</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Transformation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{portfolio.byPhase.transformation.count}</p>
              <p className="text-xs text-muted-foreground">9-18 months</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {portfolio.byDomain.length > 0 && (
        <section>
          <h2 className="mb-4 text-lg font-semibold">Domain Heatmap</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead className="text-right">Feasibility</TableHead>
                    <TableHead className="text-right">Use Cases</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...portfolio.byDomain]
                    .sort((a, b) => (b.valueMid || b.useCaseCount) - (a.valueMid || a.useCaseCount))
                    .map((d) => {
                      const intensity = (d.valueMid || d.useCaseCount) / maxDomainValue;
                      const bg =
                        intensity > 0.7
                          ? "bg-primary/15"
                          : intensity > 0.4
                            ? "bg-primary/8"
                            : intensity > 0
                              ? "bg-primary/4"
                              : "";
                      return (
                        <TableRow key={d.domain} className={bg}>
                          <TableCell className="font-medium">{d.domain}</TableCell>
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{(d.avgScore * 100).toFixed(0)}%</span>
                              </TooltipTrigger>
                              <TooltipContent>Overall score</TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>{(d.avgFeasibility * 100).toFixed(0)}%</span>
                              </TooltipTrigger>
                              <TooltipContent>Feasibility score</TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-right">{d.useCaseCount}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(d.valueMid || d.useCaseCount * 1000)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}

export default function BusinessValuePage() {
  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="Business Value Portfolio"
        subtitle="Executive overview of data-driven value across your organization"
      />

      <Suspense fallback={<PortfolioSkeleton />}>
        <PortfolioContent />
      </Suspense>
    </div>
  );
}

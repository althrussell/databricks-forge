"use client";

import { useState, useEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, LayoutDashboard, BarChart3, Search } from "lucide-react";

interface DiscoveredSpace {
  spaceId: string;
  title: string;
  tables: string[];
  metricViews: string[];
  sampleQuestionCount: number;
  measureCount: number;
  filterCount: number;
}

interface DiscoveredDash {
  dashboardId: string;
  displayName: string;
  tables: string[];
  isPublished: boolean;
  datasetCount: number;
  widgetCount: number;
}

interface CoverageData {
  allTables: string[];
  uncoveredTables: string[];
  coveragePercent: number;
  genieSpaceCount: number;
  dashboardCount: number;
  metricViewCount: number;
}

interface DiscoveryData {
  genieSpaces: DiscoveredSpace[];
  dashboards: DiscoveredDash[];
  coverage: CoverageData | null;
}

export function ExistingAssetsTab({ runId }: { runId: string }) {
  const [data, setData] = useState<DiscoveryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/runs/${runId}/discovery`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!data || (data.genieSpaces.length === 0 && data.dashboards.length === 0 && !data.coverage)) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <Search className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          No existing assets discovered for this run. Enable Asset Discovery in settings to scan for existing Genie spaces, dashboards, and metric views.
        </p>
      </div>
    );
  }

  const { coverage } = data;

  return (
    <div className="space-y-6">
      {coverage && (
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard
            label="Table Coverage"
            value={`${coverage.coveragePercent}%`}
            sub={`${coverage.allTables.length - coverage.uncoveredTables.length} of ${coverage.allTables.length} tables`}
          />
          <StatCard label="Genie Spaces" value={String(coverage.genieSpaceCount)} />
          <StatCard label="Dashboards" value={String(coverage.dashboardCount)} />
          <StatCard label="Metric Views" value={String(coverage.metricViewCount)} />
        </div>
      )}

      {coverage && coverage.uncoveredTables.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Uncovered Tables</CardTitle>
            <CardDescription>
              Tables not referenced by any existing Genie space, dashboard, or metric view
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {coverage.uncoveredTables.slice(0, 30).map((t) => (
                <Badge key={t} variant="outline" className="text-[10px] font-mono">
                  {t}
                </Badge>
              ))}
              {coverage.uncoveredTables.length > 30 && (
                <Badge variant="secondary" className="text-[10px]">
                  +{coverage.uncoveredTables.length - 30} more
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {data.genieSpaces.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4" />
              Existing Genie Spaces ({data.genieSpaces.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.genieSpaces.map((s) => (
                <div
                  key={s.spaceId}
                  className="flex items-start justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {s.tables.length} tables
                      </Badge>
                      {s.measureCount > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {s.measureCount} measures
                        </Badge>
                      )}
                      {s.filterCount > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {s.filterCount} filters
                        </Badge>
                      )}
                      {s.sampleQuestionCount > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {s.sampleQuestionCount} questions
                        </Badge>
                      )}
                      {s.metricViews.length > 0 && (
                        <Badge variant="secondary" className="text-[10px]">
                          {s.metricViews.length} metric views
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {data.dashboards.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <LayoutDashboard className="h-4 w-4" />
              Existing Dashboards ({data.dashboards.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.dashboards.map((d) => (
                <div
                  key={d.dashboardId}
                  className="flex items-start justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{d.displayName}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Badge variant="secondary" className="text-[10px]">
                        {d.datasetCount} datasets
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {d.widgetCount} widgets
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        {d.tables.length} tables
                      </Badge>
                      {d.isPublished && (
                        <Badge className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          Published
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

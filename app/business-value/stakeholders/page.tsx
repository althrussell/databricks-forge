import { getStakeholderProfilesForLatestRun } from "@/lib/lakebase/stakeholder-profiles";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import type { StakeholderProfile } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

function ChangeComplexityBadge({
  complexity,
}: {
  complexity: StakeholderProfile["changeComplexity"];
}) {
  if (!complexity) {
    return <Badge variant="secondary">-</Badge>;
  }
  const config: Record<string, { label: string; className: string }> = {
    low: {
      label: "Low",
      className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
    },
    medium: {
      label: "Medium",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
    },
    high: {
      label: "High",
      className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
    },
  };
  const c = config[complexity] ?? { label: complexity, className: "" };
  return (
    <Badge variant="outline" className={c.className}>
      {c.label}
    </Badge>
  );
}

function aggregateUseCaseTypes(profiles: StakeholderProfile[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const p of profiles) {
    for (const [k, v] of Object.entries(p.useCaseTypes ?? {})) {
      acc[k] = (acc[k] ?? 0) + v;
    }
  }
  return acc;
}

function departmentSummary(profiles: StakeholderProfile[]) {
  const byDept = new Map<
    string,
    { count: number; roles: Set<string>; complexities: ("low" | "medium" | "high")[] }
  >();
  for (const p of profiles) {
    const d = p.department || "Unknown";
    const existing = byDept.get(d) ?? {
      count: 0,
      roles: new Set<string>(),
      complexities: [] as ("low" | "medium" | "high")[],
    };
    existing.count += p.useCaseCount;
    if (p.role) existing.roles.add(p.role);
    if (p.changeComplexity) existing.complexities.push(p.changeComplexity);
    byDept.set(d, existing);
  }
  return Array.from(byDept.entries()).map(([dept, data]) => ({
    department: dept,
    useCaseCount: data.count,
    primaryRole: Array.from(data.roles)[0] ?? "-",
    changeComplexity: (data.complexities.filter((c) => c === "high").length > 0
      ? "high"
      : data.complexities.filter((c) => c === "medium").length > 0
        ? "medium"
        : "low") as "low" | "medium" | "high",
  }));
}

export default async function StakeholderIntelligencePage() {
  const { runId, profiles } = await getStakeholderProfilesForLatestRun();

  if (!runId || profiles.length === 0) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-8">
        <PageHeader
          title="Stakeholder Intelligence"
          subtitle="Organizational impact and readiness assessment"
        />
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-muted-foreground">
              Run a discovery pipeline to generate stakeholder intelligence
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const champions = profiles.filter((p) => p.isChampion).slice(0, 3);
  const departments = departmentSummary(profiles);
  const typeDistribution = aggregateUseCaseTypes(profiles);
  const totalTypes = Object.values(typeDistribution).reduce((a, b) => a + b, 0);

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="Stakeholder Intelligence"
        subtitle="Organizational impact and readiness assessment"
      />

      {champions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommended Champions</CardTitle>
            <CardDescription>Top stakeholders by total value, flagged as champions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3">
              {champions.map((p) => (
                <Card key={p.id} className="border-2 border-primary/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{p.role}</CardTitle>
                    <CardDescription>{p.department}</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{p.useCaseCount} use cases</Badge>
                      <Badge variant="outline">${(p.totalValue / 1000).toFixed(0)}k value</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Department Summary</CardTitle>
          <CardDescription>Use case distribution by department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {departments.map((d) => (
              <Card key={d.department}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{d.department}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{d.useCaseCount} use cases</Badge>
                    <span className="text-muted-foreground text-xs">{d.primaryRole}</span>
                    <ChangeComplexityBadge complexity={d.changeComplexity} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Stakeholder Table</CardTitle>
          <CardDescription>Full profile list with roles, domains, and flags</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Use Cases</TableHead>
                  <TableHead>Domains</TableHead>
                  <TableHead>Types</TableHead>
                  <TableHead>Change Complexity</TableHead>
                  <TableHead className="w-24">Champion?</TableHead>
                  <TableHead className="w-24">Sponsor?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.role}</TableCell>
                    <TableCell>{p.department}</TableCell>
                    <TableCell>{p.useCaseCount}</TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {p.domains?.length ? p.domains.join(", ") : "-"}
                    </TableCell>
                    <TableCell className="max-w-[150px]">
                      {Object.entries(p.useCaseTypes ?? {})
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ") || "-"}
                    </TableCell>
                    <TableCell>
                      <ChangeComplexityBadge complexity={p.changeComplexity} />
                    </TableCell>
                    <TableCell>
                      {p.isChampion ? (
                        <Badge variant="outline" className="gap-1 bg-green-500/10">
                          <Check className="h-3 w-3" />
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.isSponsor ? (
                        <Badge variant="outline" className="gap-1 bg-green-500/10">
                          <Check className="h-3 w-3" />
                          Yes
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {totalTypes > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Skills Assessment</CardTitle>
            <CardDescription>
              Aggregate use case type distribution (AI, Statistical, etc.)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {Object.entries(typeDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([typeName, count]) => {
                  const pct = totalTypes > 0 ? ((count / totalTypes) * 100).toFixed(1) : "0";
                  return (
                    <div key={typeName} className="flex items-center gap-2">
                      <Badge variant="secondary">{typeName}</Badge>
                      <span className="text-muted-foreground text-sm">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

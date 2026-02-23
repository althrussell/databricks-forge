"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Eye,
  ChevronDown,
  ChevronUp,
  Database,
  Server,
  AlertTriangle,
  Download,
} from "lucide-react";
import type { UseCase } from "@/lib/domain/types";
import {
  type IndustryOutcome,
  type StrategicPriority,
  type ReferenceUseCase,
} from "@/lib/domain/industry-outcomes";
import { useIndustryOutcomes } from "@/lib/hooks/use-industry-outcomes";

// ---------------------------------------------------------------------------
// Coverage computation
// ---------------------------------------------------------------------------

export interface PriorityCoverage {
  priority: StrategicPriority;
  objective: string;
  matchedUseCases: UseCase[];
  unmatchedRefUseCases: ReferenceUseCase[];
  coverageRatio: number;
}

export interface CoverageResult {
  priorities: PriorityCoverage[];
  overallCoverage: number;
  totalRefUseCases: number;
  coveredRefUseCases: number;
  gapCount: number;
  missingDataEntities: Array<{ entity: string; useCaseCount: number }>;
  missingSourceSystems: Array<{ system: string; useCaseCount: number }>;
}

export function computeIndustryCoverage(
  industry: IndustryOutcome,
  useCases: UseCase[]
): CoverageResult {
  const priorities: PriorityCoverage[] = [];
  let totalRef = 0;
  let coveredRef = 0;

  const ucNameWords = useCases.map((uc) => ({
    uc,
    words: new Set(
      (uc.name + " " + uc.statement)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    ),
  }));

  const entityCounts = new Map<string, number>();
  const systemCounts = new Map<string, number>();

  for (const objective of industry.objectives) {
    for (const priority of objective.priorities) {
      const matched: UseCase[] = [];
      const unmatched: ReferenceUseCase[] = [];

      for (const refUc of priority.useCases) {
        totalRef++;
        const refWords = new Set(
          (refUc.name + " " + refUc.description)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 3)
        );

        let bestMatch: UseCase | null = null;
        let bestOverlap = 0;
        for (const { uc, words } of ucNameWords) {
          const overlap = [...refWords].filter((w) => words.has(w)).length;
          const overlapRatio = overlap / Math.max(refWords.size, 1);
          if (overlapRatio > bestOverlap && overlapRatio >= 0.25) {
            bestOverlap = overlapRatio;
            bestMatch = uc;
          }
        }
        if (bestMatch && !matched.includes(bestMatch)) {
          matched.push(bestMatch);
          coveredRef++;
        } else if (!bestMatch) {
          unmatched.push(refUc);
          for (const entity of refUc.typicalDataEntities ?? []) {
            entityCounts.set(entity, (entityCounts.get(entity) ?? 0) + 1);
          }
          for (const system of refUc.typicalSourceSystems ?? []) {
            systemCounts.set(system, (systemCounts.get(system) ?? 0) + 1);
          }
        }
      }

      priorities.push({
        priority,
        objective: objective.name,
        matchedUseCases: matched,
        unmatchedRefUseCases: unmatched,
        coverageRatio:
          priority.useCases.length > 0
            ? matched.length / priority.useCases.length
            : 0,
      });
    }
  }

  const missingDataEntities = [...entityCounts.entries()]
    .map(([entity, useCaseCount]) => ({ entity, useCaseCount }))
    .sort((a, b) => b.useCaseCount - a.useCaseCount);

  const missingSourceSystems = [...systemCounts.entries()]
    .map(([system, useCaseCount]) => ({ system, useCaseCount }))
    .sort((a, b) => b.useCaseCount - a.useCaseCount);

  return {
    priorities,
    overallCoverage: totalRef > 0 ? coveredRef / totalRef : 0,
    totalRefUseCases: totalRef,
    coveredRefUseCases: coveredRef,
    gapCount: totalRef - coveredRef,
    missingDataEntities,
    missingSourceSystems,
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IndustryCoverageCard({
  industryId,
  useCases,
  runId,
}: {
  industryId: string;
  useCases: UseCase[];
  runId: string;
}) {
  const { getOutcome } = useIndustryOutcomes();
  const industry = getOutcome(industryId);
  if (!industry) return null;

  const coverage = computeIndustryCoverage(industry, useCases);
  const hasGaps =
    coverage.missingDataEntities.length > 0 ||
    coverage.missingSourceSystems.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Eye className="h-4 w-4 text-violet-500" />
          Industry Outcome Map Coverage ({industry.name})
        </CardTitle>
        <CardDescription>
          Comparison of generated use cases against{" "}
          {coverage.totalRefUseCases} reference use cases from the{" "}
          {industry.name} outcome map
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Overall coverage */}
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <Progress
              value={Math.round(coverage.overallCoverage * 100)}
              className="h-3"
            />
          </div>
          <span className="min-w-[60px] text-right text-sm font-semibold">
            {Math.round(coverage.overallCoverage * 100)}% covered
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {coverage.coveredRefUseCases} of {coverage.totalRefUseCases}{" "}
          reference use cases matched
          {coverage.gapCount > 0 && (
            <span className="ml-1 font-medium text-amber-600 dark:text-amber-400">
              &middot; {coverage.gapCount} gap
              {coverage.gapCount !== 1 ? "s" : ""} identified
            </span>
          )}
        </p>

        <Separator />

        {/* Per-priority breakdown with collapsible gap detail */}
        <div className="space-y-2">
          {coverage.priorities.map((pc) => (
            <PriorityRow
              key={`${pc.objective}-${pc.priority.name}`}
              pc={pc}
            />
          ))}
        </div>

        {/* Aggregate Data Gap Summary */}
        {hasGaps && (
          <>
            <Separator />
            <DataGapSummary coverage={coverage} runId={runId} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Priority row (collapsible)
// ---------------------------------------------------------------------------

function PriorityRow({ pc }: { pc: PriorityCoverage }) {
  const [open, setOpen] = useState(false);
  const pctCovered = Math.round(pc.coverageRatio * 100);
  const statusColor =
    pctCovered >= 75
      ? "text-green-600 dark:text-green-400"
      : pctCovered >= 25
        ? "text-amber-600 dark:text-amber-400"
        : "text-red-600 dark:text-red-400";

  const badgeBorder =
    pctCovered >= 75
      ? "border-green-300 dark:border-green-700"
      : pctCovered >= 25
        ? "border-amber-300 dark:border-amber-700"
        : "border-red-300 dark:border-red-700";

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted/30">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{pc.priority.name}</p>
          <p className="text-xs text-muted-foreground">
            {pc.objective} &middot; {pc.priority.useCases.length} reference
            use cases
            {pc.unmatchedRefUseCases.length > 0 && (
              <span className="ml-1 text-amber-600 dark:text-amber-400">
                &middot; {pc.unmatchedRefUseCases.length} gap
                {pc.unmatchedRefUseCases.length !== 1 ? "s" : ""}
              </span>
            )}
          </p>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-2">
          <Badge variant="outline" className={`${statusColor} ${badgeBorder}`}>
            {pctCovered}%
          </Badge>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="rounded-b-md border border-t-0 px-3 py-3 space-y-3">
          {/* Matched use cases */}
          {pc.matchedUseCases.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
                Matched ({pc.matchedUseCases.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {pc.matchedUseCases.map((uc) => (
                  <Badge
                    key={uc.id}
                    variant="secondary"
                    className="text-xs"
                  >
                    {uc.name}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Gap detail */}
          {pc.unmatchedRefUseCases.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                Gaps ({pc.unmatchedRefUseCases.length})
              </p>
              <div className="space-y-2">
                {pc.unmatchedRefUseCases.map((refUc) => (
                  <div
                    key={refUc.name}
                    className="rounded-md border border-dashed border-amber-300 bg-amber-50/30 p-2.5 dark:border-amber-800 dark:bg-amber-950/10"
                  >
                    <p className="text-sm font-medium">{refUc.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                      {refUc.description}
                    </p>
                    {(refUc.typicalDataEntities?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Database className="h-3 w-3 text-blue-500" />
                        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 mr-1">
                          Data:
                        </span>
                        {refUc.typicalDataEntities!.map((entity) => (
                          <Badge
                            key={entity}
                            variant="outline"
                            className="border-blue-200 text-[10px] text-blue-700 dark:border-blue-800 dark:text-blue-300"
                          >
                            {entity}
                          </Badge>
                        ))}
                      </div>
                    )}
                    {(refUc.typicalSourceSystems?.length ?? 0) > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <Server className="h-3 w-3 text-violet-500" />
                        <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 mr-1">
                          Sources:
                        </span>
                        {refUc.typicalSourceSystems!.map((system) => (
                          <Badge
                            key={system}
                            variant="outline"
                            className="border-violet-200 text-[10px] text-violet-700 dark:border-violet-800 dark:text-violet-300"
                          >
                            {system}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {pc.matchedUseCases.length === 0 &&
            pc.unmatchedRefUseCases.length === 0 && (
              <p className="text-xs italic text-muted-foreground">
                No reference use cases in this priority
              </p>
            )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// Aggregate Data Gap Summary
// ---------------------------------------------------------------------------

function DataGapSummary({
  coverage,
  runId,
}: {
  coverage: CoverageResult;
  runId: string;
}) {
  const topEntities = coverage.missingDataEntities.slice(0, 10);
  const topSystems = coverage.missingSourceSystems.slice(0, 8);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4 dark:border-amber-800 dark:bg-amber-950/10">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h4 className="text-sm font-semibold">Data Gap Summary</h4>
          <span className="text-xs text-muted-foreground">
            Prioritised data to onboard for uncovered use cases
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            window.open(`/api/runs/${runId}/gap-report`, "_blank");
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Gap Report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Data Entities to Onboard */}
        {topEntities.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 text-blue-500" />
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">
                Top Data to Onboard
              </p>
            </div>
            <div className="space-y-1">
              {topEntities.map(({ entity, useCaseCount }) => (
                <div
                  key={entity}
                  className="flex items-center justify-between rounded-md border bg-background/60 px-2.5 py-1"
                >
                  <span className="truncate text-xs">{entity}</span>
                  <Badge
                    variant="secondary"
                    className="ml-2 shrink-0 text-[10px]"
                  >
                    unlocks {useCaseCount} UC
                    {useCaseCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Common Source Systems */}
        {topSystems.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5 text-violet-500" />
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                Common Source Systems
              </p>
            </div>
            <div className="space-y-1">
              {topSystems.map(({ system, useCaseCount }) => (
                <div
                  key={system}
                  className="flex items-center justify-between rounded-md border bg-background/60 px-2.5 py-1"
                >
                  <span className="truncate text-xs">{system}</span>
                  <Badge
                    variant="secondary"
                    className="ml-2 shrink-0 text-[10px]"
                  >
                    {useCaseCount} UC{useCaseCount !== 1 ? "s" : ""}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

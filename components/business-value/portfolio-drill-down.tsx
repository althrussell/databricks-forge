"use client";

import { useState, useMemo, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { ChevronDown, Layers, Clock } from "lucide-react";
import { VoteButton } from "@/components/business-value/vote-button";
import type { PortfolioUseCase } from "@/lib/lakebase/portfolio";

type GroupMode = "domain" | "phase";

const PHASE_LABELS: Record<string, { label: string; time: string }> = {
  quick_wins: { label: "Quick Wins", time: "0–3 months" },
  foundation: { label: "Foundation", time: "3–9 months" },
  transformation: { label: "Transformation", time: "9–18 months" },
};

const EFFORT_LABELS: Record<string, string> = {
  xs: "XS",
  s: "Small",
  m: "Medium",
  l: "Large",
  xl: "XL",
};

export function PortfolioDrillDown({
  useCases,
  runId,
}: {
  useCases: PortfolioUseCase[];
  runId?: string;
}) {
  const [mode, setMode] = useState<GroupMode>("domain");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [votes, setVotes] = useState<Record<string, { total: number; voters: string[] }>>({});

  useEffect(() => {
    if (!runId) return;
    fetch(`/api/business-value/vote?runId=${runId}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then(setVotes)
      .catch(() => {});
  }, [runId]);

  const groups = useMemo(() => {
    const map = new Map<string, PortfolioUseCase[]>();
    for (const uc of useCases) {
      const key = mode === "domain" ? uc.domain : (uc.phase ?? "unassigned");
      const arr = map.get(key) ?? [];
      arr.push(uc);
      map.set(key, arr);
    }
    return Array.from(map.entries())
      .map(([key, ucs]) => ({
        key,
        label: mode === "phase" ? (PHASE_LABELS[key]?.label ?? "Unassigned") : key,
        subtitle: mode === "phase" ? (PHASE_LABELS[key]?.time ?? "") : "",
        useCases: ucs.sort((a, b) => b.overallScore - a.overallScore),
        totalValue: ucs.reduce((s, u) => s + u.valueMid, 0),
        count: ucs.length,
      }))
      .sort((a, b) => b.totalValue - a.totalValue || b.count - a.count);
  }, [useCases, mode]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {mode === "domain" ? (
            <Layers className="h-4 w-4 text-primary" />
          ) : (
            <Clock className="h-4 w-4 text-primary" />
          )}
          Use Case Explorer
        </h2>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <Button
            variant={mode === "domain" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setMode("domain");
              setExpanded(null);
            }}
          >
            By Domain
          </Button>
          <Button
            variant={mode === "phase" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              setMode("phase");
              setExpanded(null);
            }}
          >
            By Phase
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {groups.map((g) => {
          const isOpen = expanded === g.key;
          return (
            <Card key={g.key} className="overflow-hidden">
              <button
                type="button"
                className={`flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-muted/30 ${isOpen ? "bg-muted/20" : ""}`}
                onClick={() => setExpanded(isOpen ? null : g.key)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`h-2 w-2 rounded-full transition-colors ${isOpen ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                  <span className="text-sm font-semibold">{g.label}</span>
                  {g.subtitle && (
                    <span className="text-xs text-muted-foreground">{g.subtitle}</span>
                  )}
                  <Badge variant="secondary" className="text-[10px]">
                    {g.count} use case{g.count !== 1 ? "s" : ""}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(g.totalValue)}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  />
                </div>
              </button>
              {isOpen && (
                <CardContent className="border-t p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Use Case</TableHead>
                        <TableHead>Type</TableHead>
                        {mode === "domain" && <TableHead>Phase</TableHead>}
                        {mode === "phase" && <TableHead>Domain</TableHead>}
                        <TableHead className="text-right">Score</TableHead>
                        <TableHead className="text-right">Feasibility</TableHead>
                        <TableHead>Effort</TableHead>
                        <TableHead className="text-right">Est. Value</TableHead>
                        {runId && <TableHead className="text-center">Vote</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {g.useCases.map((uc) => (
                        <TableRow key={uc.id}>
                          <TableCell>
                            <div>
                              <p className="text-sm font-medium">{uc.name}</p>
                              <p className="max-w-[400px] truncate text-xs text-muted-foreground">
                                {uc.businessValue}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[10px]">
                              {uc.type}
                            </Badge>
                          </TableCell>
                          {mode === "domain" && (
                            <TableCell>
                              <span className="text-xs">
                                {uc.phase ? (PHASE_LABELS[uc.phase]?.label ?? uc.phase) : "—"}
                              </span>
                            </TableCell>
                          )}
                          {mode === "phase" && (
                            <TableCell>
                              <span className="text-xs">{uc.domain}</span>
                            </TableCell>
                          )}
                          <TableCell className="text-right tabular-nums">
                            {(uc.overallScore * 100).toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {(uc.feasibilityScore * 100).toFixed(0)}%
                          </TableCell>
                          <TableCell>
                            <span className="text-xs">
                              {uc.effortEstimate
                                ? (EFFORT_LABELS[uc.effortEstimate] ?? uc.effortEstimate)
                                : "—"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(uc.valueMid)}
                          </TableCell>
                          {runId && (
                            <TableCell className="text-center">
                              <VoteButton
                                runId={runId}
                                useCaseId={uc.id}
                                initialCount={votes[uc.id]?.total ?? 0}
                                compact
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

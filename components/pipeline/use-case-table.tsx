"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import type { UseCase } from "@/lib/domain/types";

interface UseCaseTableProps {
  useCases: UseCase[];
}

export function UseCaseTable({ useCases }: UseCaseTableProps) {
  const [search, setSearch] = useState("");
  const [domainFilter, setDomainFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"score" | "name" | "domain">("score");
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);

  const domains = useMemo(
    () => [...new Set(useCases.map((uc) => uc.domain))].sort(),
    [useCases]
  );

  const filtered = useMemo(() => {
    let result = [...useCases];

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (uc) =>
          uc.name.toLowerCase().includes(q) ||
          uc.statement.toLowerCase().includes(q) ||
          uc.domain.toLowerCase().includes(q)
      );
    }

    if (domainFilter !== "all") {
      result = result.filter((uc) => uc.domain === domainFilter);
    }

    if (typeFilter !== "all") {
      result = result.filter((uc) => uc.type === typeFilter);
    }

    switch (sortBy) {
      case "score":
        result.sort((a, b) => b.overallScore - a.overallScore);
        break;
      case "name":
        result.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "domain":
        result.sort((a, b) => a.domain.localeCompare(b.domain));
        break;
    }

    return result;
  }, [useCases, search, domainFilter, typeFilter, sortBy]);

  return (
    <>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Input
            placeholder="Search use cases..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Select value={domainFilter} onValueChange={setDomainFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Domain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Domains</SelectItem>
              {domains.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="AI">AI</SelectItem>
              <SelectItem value="Statistical">Statistical</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Score</SelectItem>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="domain">Domain</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {filtered.length} of {useCases.length}
          </span>
        </div>

        {/* Table */}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">No</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No use cases match your filters
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((uc) => (
                  <TableRow
                    key={uc.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedUseCase(uc)}
                  >
                    <TableCell className="font-mono text-xs">
                      {uc.useCaseNo}
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate font-medium">{uc.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {uc.statement}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          uc.type === "AI"
                            ? "border-purple-300 text-purple-700"
                            : "border-teal-300 text-teal-700"
                        }
                      >
                        {uc.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="text-sm">{uc.domain}</span>
                        {uc.subdomain && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            / {uc.subdomain}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <ScoreBadge score={uc.overallScore} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedUseCase(uc);
                        }}
                      >
                        Details
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Detail Sheet */}
      <Sheet
        open={!!selectedUseCase}
        onOpenChange={(open) => !open && setSelectedUseCase(null)}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selectedUseCase && (
            <>
              <SheetHeader>
                <SheetTitle>{selectedUseCase.name}</SheetTitle>
              </SheetHeader>
              <div className="mt-6 space-y-4">
                <div className="flex gap-2">
                  <Badge variant="outline">{selectedUseCase.type}</Badge>
                  <Badge variant="secondary">{selectedUseCase.domain}</Badge>
                  {selectedUseCase.subdomain && (
                    <Badge variant="secondary">
                      {selectedUseCase.subdomain}
                    </Badge>
                  )}
                </div>

                <Section title="Statement">
                  {selectedUseCase.statement}
                </Section>
                <Section title="Solution">
                  {selectedUseCase.solution}
                </Section>
                <Section title="Business Value">
                  {selectedUseCase.businessValue}
                </Section>

                <Separator />

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium text-muted-foreground">
                      Technique
                    </p>
                    <p>{selectedUseCase.analyticsTechnique}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">
                      Beneficiary
                    </p>
                    <p>{selectedUseCase.beneficiary}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">
                      Sponsor
                    </p>
                    <p>{selectedUseCase.sponsor}</p>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-4 gap-3 text-center text-sm">
                  <ScoreCard
                    label="Priority"
                    score={selectedUseCase.priorityScore}
                  />
                  <ScoreCard
                    label="Feasibility"
                    score={selectedUseCase.feasibilityScore}
                  />
                  <ScoreCard
                    label="Impact"
                    score={selectedUseCase.impactScore}
                  />
                  <ScoreCard
                    label="Overall"
                    score={selectedUseCase.overallScore}
                  />
                </div>

                {selectedUseCase.tablesInvolved.length > 0 && (
                  <>
                    <Separator />
                    <Section title="Tables Involved">
                      <ul className="space-y-1">
                        {selectedUseCase.tablesInvolved.map((t) => (
                          <li key={t} className="font-mono text-xs">
                            {t}
                          </li>
                        ))}
                      </ul>
                    </Section>
                  </>
                )}

                {selectedUseCase.sqlCode && (
                  <>
                    <Separator />
                    <Section title="SQL Code">
                      <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
                        {selectedUseCase.sqlCode}
                      </pre>
                    </Section>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-muted-foreground">{title}</p>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "text-green-700 bg-green-100"
      : score >= 0.4
        ? "text-yellow-700 bg-yellow-100"
        : "text-red-700 bg-red-100";

  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}
    >
      {pct}%
    </span>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{(score * 100).toFixed(0)}%</p>
    </div>
  );
}

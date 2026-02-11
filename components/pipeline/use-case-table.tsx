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
import {
  BrainCircuit,
  BarChart3,
  FileText,
  Lightbulb,
  TrendingUp,
  Cpu,
  Users,
  UserCheck,
  Database,
  Code2,
  Layers,
  Tag,
  Target,
  Gauge,
  Zap,
  Trophy,
} from "lucide-react";
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
                    className="cursor-pointer transition-colors hover:bg-row-hover"
                    onClick={() => setSelectedUseCase(uc)}
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {uc.useCaseNo}
                    </TableCell>
                    <TableCell className="max-w-[300px]">
                      <p className="truncate font-medium">{uc.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {uc.statement}
                      </p>
                    </TableCell>
                    <TableCell>
                      <TypeBadge type={uc.type} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm">{uc.domain}</span>
                        {uc.subdomain && (
                          <span className="text-xs text-muted-foreground">
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
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedUseCase && (
            <>
              <SheetHeader className="pb-2">
                <SheetTitle className="text-lg leading-snug">
                  {selectedUseCase.name}
                </SheetTitle>
              </SheetHeader>

              {/* Tags row */}
              <div className="mt-3 flex flex-wrap gap-2">
                <TypeBadge type={selectedUseCase.type} />
                <Badge variant="secondary" className="gap-1">
                  <Layers className="h-3 w-3" />
                  {selectedUseCase.domain}
                </Badge>
                {selectedUseCase.subdomain && (
                  <Badge variant="secondary" className="gap-1">
                    <Tag className="h-3 w-3" />
                    {selectedUseCase.subdomain}
                  </Badge>
                )}
              </div>

              <div className="mt-6 space-y-5">
                {/* Statement */}
                <DetailSection
                  icon={<FileText className="h-4 w-4 text-blue-500" />}
                  title="Statement"
                >
                  {selectedUseCase.statement}
                </DetailSection>

                {/* Solution */}
                <DetailSection
                  icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
                  title="Solution"
                >
                  {selectedUseCase.solution}
                </DetailSection>

                {/* Business Value */}
                <DetailSection
                  icon={<TrendingUp className="h-4 w-4 text-green-500" />}
                  title="Business Value"
                >
                  {selectedUseCase.businessValue}
                </DetailSection>

                <Separator />

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-4">
                  <MetaField
                    icon={<Cpu className="h-3.5 w-3.5 text-violet-500" />}
                    label="Technique"
                    value={selectedUseCase.analyticsTechnique}
                  />
                  <MetaField
                    icon={<Users className="h-3.5 w-3.5 text-sky-500" />}
                    label="Beneficiary"
                    value={selectedUseCase.beneficiary}
                  />
                  <MetaField
                    icon={<UserCheck className="h-3.5 w-3.5 text-emerald-500" />}
                    label="Sponsor"
                    value={selectedUseCase.sponsor}
                  />
                </div>

                <Separator />

                {/* Scores */}
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Scoring
                  </p>
                  <div className="grid grid-cols-4 gap-3">
                    <ScoreCard
                      icon={<Target className="h-4 w-4" />}
                      label="Priority"
                      score={selectedUseCase.priorityScore}
                    />
                    <ScoreCard
                      icon={<Gauge className="h-4 w-4" />}
                      label="Feasibility"
                      score={selectedUseCase.feasibilityScore}
                    />
                    <ScoreCard
                      icon={<Zap className="h-4 w-4" />}
                      label="Impact"
                      score={selectedUseCase.impactScore}
                    />
                    <ScoreCard
                      icon={<Trophy className="h-4 w-4" />}
                      label="Overall"
                      score={selectedUseCase.overallScore}
                    />
                  </div>
                </div>

                {/* Tables Involved */}
                {selectedUseCase.tablesInvolved.length > 0 && (
                  <>
                    <Separator />
                    <DetailSection
                      icon={<Database className="h-4 w-4 text-orange-500" />}
                      title="Tables Involved"
                    >
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {selectedUseCase.tablesInvolved.map((t) => (
                          <Badge
                            key={t}
                            variant="outline"
                            className="gap-1 font-mono text-[11px] font-normal"
                          >
                            <Database className="h-2.5 w-2.5 text-muted-foreground" />
                            {t}
                          </Badge>
                        ))}
                      </div>
                    </DetailSection>
                  </>
                )}

                {/* SQL Code */}
                {selectedUseCase.sqlCode && (
                  <>
                    <Separator />
                    <DetailSection
                      icon={<Code2 className="h-4 w-4 text-pink-500" />}
                      title="SQL Code"
                    >
                      <pre className="mt-1 overflow-x-auto rounded-md border bg-muted/50 p-3 font-mono text-xs leading-relaxed">
                        {selectedUseCase.sqlCode}
                      </pre>
                    </DetailSection>
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

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function TypeBadge({ type }: { type: string }) {
  if (type === "AI") {
    return (
      <Badge variant="outline" className="gap-1 border-violet-300 bg-violet-50 text-violet-700">
        <BrainCircuit className="h-3 w-3" />
        AI
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 border-teal-300 bg-teal-50 text-teal-700">
      <BarChart3 className="h-3 w-3" />
      Statistical
    </Badge>
  );
}

function DetailSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold">{title}</p>
      </div>
      <div className="pl-6 text-sm leading-relaxed text-foreground/90">{children}</div>
    </div>
  );
}

function MetaField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2.5">
      <div className="mb-0.5 flex items-center gap-1.5">
        {icon}
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <p className="text-sm">{value}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    score >= 0.7
      ? "text-green-700 bg-green-50 border-green-200"
      : score >= 0.4
        ? "text-amber-700 bg-amber-50 border-amber-200"
        : "text-red-700 bg-red-50 border-red-200";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}
    >
      {pct}%
    </span>
  );
}

function ScoreCard({
  icon,
  label,
  score,
}: {
  icon: React.ReactNode;
  label: string;
  score: number;
}) {
  const pct = Math.round(score * 100);
  const colorClasses =
    score >= 0.7
      ? "border-green-200 bg-green-50/50 text-green-700"
      : score >= 0.4
        ? "border-amber-200 bg-amber-50/50 text-amber-700"
        : "border-red-200 bg-red-50/50 text-red-700";

  return (
    <div className={`flex flex-col items-center gap-1 rounded-lg border p-3 ${colorClasses}`}>
      <div className="opacity-60">{icon}</div>
      <p className="text-xl font-bold">{pct}%</p>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</p>
    </div>
  );
}

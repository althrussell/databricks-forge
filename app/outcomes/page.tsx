"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Building2,
  Target,
  Users,
  BarChart3,
  Search,
  ChevronRight,
  Lightbulb,
  TrendingUp,
  ArrowRight,
  Sparkles,
  Layers,
  Upload,
} from "lucide-react";
import {
  type IndustryOutcome,
  type IndustryObjective,
  type StrategicPriority,
  type ReferenceUseCase,
} from "@/lib/domain/industry-outcomes";
import { useIndustryOutcomes } from "@/lib/hooks/use-industry-outcomes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { InfoTip } from "@/components/ui/info-tip";
import { OUTCOMES } from "@/lib/help-text";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDUSTRY_COLORS: Record<string, string> = {
  banking: "from-blue-500/20 to-blue-600/5 border-blue-200 dark:border-blue-800",
  insurance: "from-indigo-500/20 to-indigo-600/5 border-indigo-200 dark:border-indigo-800",
  hls: "from-emerald-500/20 to-emerald-600/5 border-emerald-200 dark:border-emerald-800",
  rcg: "from-orange-500/20 to-orange-600/5 border-orange-200 dark:border-orange-800",
  manufacturing: "from-slate-500/20 to-slate-600/5 border-slate-200 dark:border-slate-800",
  "energy-utilities": "from-amber-500/20 to-amber-600/5 border-amber-200 dark:border-amber-800",
  communications: "from-cyan-500/20 to-cyan-600/5 border-cyan-200 dark:border-cyan-800",
  "media-advertising": "from-pink-500/20 to-pink-600/5 border-pink-200 dark:border-pink-800",
  "digital-natives": "from-violet-500/20 to-violet-600/5 border-violet-200 dark:border-violet-800",
  games: "from-red-500/20 to-red-600/5 border-red-200 dark:border-red-800",
};

const INDUSTRY_ICON_COLORS: Record<string, string> = {
  banking: "text-blue-600 dark:text-blue-400",
  insurance: "text-indigo-600 dark:text-indigo-400",
  hls: "text-emerald-600 dark:text-emerald-400",
  rcg: "text-orange-600 dark:text-orange-400",
  manufacturing: "text-slate-600 dark:text-slate-400",
  "energy-utilities": "text-amber-600 dark:text-amber-400",
  communications: "text-cyan-600 dark:text-cyan-400",
  "media-advertising": "text-pink-600 dark:text-pink-400",
  "digital-natives": "text-violet-600 dark:text-violet-400",
  games: "text-red-600 dark:text-red-400",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countUseCases(industry: IndustryOutcome): number {
  return industry.objectives.reduce(
    (acc, obj) =>
      acc +
      obj.priorities.reduce((a, p) => a + p.useCases.length, 0),
    0
  );
}

function countPriorities(industry: IndustryOutcome): number {
  return industry.objectives.reduce(
    (acc, obj) => acc + obj.priorities.length,
    0
  );
}

function matchesSearch(
  industry: IndustryOutcome,
  query: string
): boolean {
  const q = query.toLowerCase();
  if (industry.name.toLowerCase().includes(q)) return true;
  if (industry.subVerticals?.some((sv) => sv.toLowerCase().includes(q)))
    return true;
  for (const obj of industry.objectives) {
    if (obj.name.toLowerCase().includes(q)) return true;
    for (const pri of obj.priorities) {
      if (pri.name.toLowerCase().includes(q)) return true;
      for (const uc of pri.useCases) {
        if (uc.name.toLowerCase().includes(q)) return true;
        if (uc.description.toLowerCase().includes(q)) return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OutcomesPage() {
  const { outcomes, loading } = useIndustryOutcomes();
  const [selectedIndustry, setSelectedIndustry] =
    useState<IndustryOutcome | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredIndustries = useMemo(() => {
    if (!searchQuery.trim()) return outcomes;
    return outcomes.filter((i) => matchesSearch(i, searchQuery));
  }, [searchQuery, outcomes]);

  const totalUseCases = useMemo(
    () => outcomes.reduce((acc, i) => acc + countUseCases(i), 0),
    [outcomes]
  );

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
                <Layers className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight">
                    Industry Outcome Maps
                  </h1>
                  <InfoTip tip={OUTCOMES.pageDescription} />
                </div>
              <p className="text-sm text-muted-foreground">
                {loading ? "Loading..." : (
                  <>{outcomes.length} industries &middot;{" "}
                  {totalUseCases} reference use cases</>
                )}
              </p>
            </div>
          </div>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            These outcome maps contain curated high-value use cases, strategic
            priorities, and KPIs for each industry. When you select an industry
            during discovery, this data enriches the AI prompts to generate
            more relevant, strategically-aligned use cases.
          </p>
        </div>
        <Link href="/outcomes/ingest">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            Ingest New Map
          </Button>
        </Link>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search industries, priorities, or use cases..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {selectedIndustry ? (
        /* ------------------------------------------------------------------ */
        /* Industry Detail View                                                */
        /* ------------------------------------------------------------------ */
        <IndustryDetailView
          industry={selectedIndustry}
          onBack={() => setSelectedIndustry(null)}
        />
      ) : (
        /* ------------------------------------------------------------------ */
        /* Industry Grid                                                       */
        /* ------------------------------------------------------------------ */
        <>
          {filteredIndustries.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="mb-3 h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  No industries match &ldquo;{searchQuery}&rdquo;
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setSearchQuery("")}
                >
                  Clear search
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredIndustries.map((industry) => (
                <IndustryCard
                  key={industry.id}
                  industry={industry}
                  onClick={() => setSelectedIndustry(industry)}
                />
              ))}
            </div>
          )}
        </>
      )}
      </div>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Industry Card (Grid View)
// ---------------------------------------------------------------------------

function IndustryCard({
  industry,
  onClick,
}: {
  industry: IndustryOutcome;
  onClick: () => void;
}) {
  const ucCount = countUseCases(industry);
  const priCount = countPriorities(industry);
  const gradientClass =
    INDUSTRY_COLORS[industry.id] ?? "from-gray-500/20 to-gray-600/5";
  const iconColor =
    INDUSTRY_ICON_COLORS[industry.id] ?? "text-gray-600 dark:text-gray-400";

  return (
    <Card
      className={`group flex cursor-pointer flex-col border bg-gradient-to-br transition-all hover:shadow-md ${gradientClass}`}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <Building2 className={`h-5 w-5 ${iconColor}`} />
            <CardTitle className="text-base">{industry.name}</CardTitle>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
        {industry.subVerticals && (
          <CardDescription className="line-clamp-2 text-xs">
            {industry.subVerticals.join(" · ")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between space-y-3">
        {/* Objective pills */}
        <div className="flex flex-wrap gap-1">
          {industry.objectives.map((obj) => (
            <Badge key={obj.name} variant="secondary" className="text-xs">
              {obj.name}
            </Badge>
          ))}
        </div>

        <div>
          <Separator />
          {/* Stats row */}
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Target className="h-3.5 w-3.5" />
              <span>{priCount} priorities</span>
            </div>
            <div className="flex items-center gap-1">
              <Lightbulb className="h-3.5 w-3.5" />
              <span>{ucCount} use cases</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Industry Detail View
// ---------------------------------------------------------------------------

function IndustryDetailView({
  industry,
  onBack,
}: {
  industry: IndustryOutcome;
  onBack: () => void;
}) {
  const ucCount = countUseCases(industry);
  const priCount = countPriorities(industry);
  const personaCount = new Set(
    industry.objectives.flatMap((obj) =>
      obj.priorities.flatMap((p) => p.personas)
    )
  ).size;

  const iconColor =
    INDUSTRY_ICON_COLORS[industry.id] ?? "text-gray-600 dark:text-gray-400";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={onBack}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          All Industries
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium">{industry.name}</span>
      </div>

      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${INDUSTRY_COLORS[industry.id] ?? ""}`}
            >
              <Building2 className={`h-6 w-6 ${iconColor}`} />
            </div>
            <div>
              <CardTitle className="text-xl">{industry.name}</CardTitle>
              {industry.subVerticals && (
                <CardDescription>
                  {industry.subVerticals.join(" · ")}
                </CardDescription>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Stat pills */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatPill
              icon={<Target className="h-4 w-4 text-violet-500" />}
              label="Objectives"
              value={industry.objectives.length}
            />
            <StatPill
              icon={<TrendingUp className="h-4 w-4 text-blue-500" />}
              label="Strategic Priorities"
              value={priCount}
            />
            <StatPill
              icon={<Lightbulb className="h-4 w-4 text-amber-500" />}
              label="Reference Use Cases"
              value={ucCount}
            />
            <StatPill
              icon={<Users className="h-4 w-4 text-emerald-500" />}
              label="Key Personas"
              value={personaCount}
            />
          </div>

          <Separator className="my-4" />

          {/* Suggested config */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Suggested Business Domains
              </p>
              <div className="flex flex-wrap gap-1">
                {industry.suggestedDomains.map((d) => (
                  <Badge key={d} variant="outline" className="text-xs">
                    {d}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                Suggested Priorities
              </p>
              <div className="flex flex-wrap gap-1">
                {industry.suggestedPriorities.map((p) => (
                  <Badge key={p} variant="outline" className="text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <Button asChild size="sm">
            <Link href="/configure">
              <Sparkles className="mr-2 h-4 w-4" />
              Start Discovery with {industry.name}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Objectives */}
      {industry.objectives.map((objective) => (
        <ObjectiveSection
          key={objective.name}
          objective={objective}
          industryId={industry.id}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Objective Section
// ---------------------------------------------------------------------------

function ObjectiveSection({
  objective,
  industryId,
}: {
  objective: IndustryObjective;
  industryId: string;
}) {
  const iconColor =
    INDUSTRY_ICON_COLORS[industryId] ?? "text-gray-600 dark:text-gray-400";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Target className={`h-5 w-5 ${iconColor}`} />
          <CardTitle className="text-lg">{objective.name}</CardTitle>
        </div>
        <CardDescription className="max-w-3xl leading-relaxed">
          {objective.whyChange}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="multiple" className="space-y-2">
          {objective.priorities.map((priority) => (
            <PriorityAccordion
              key={priority.name}
              priority={priority}
            />
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Priority Accordion
// ---------------------------------------------------------------------------

function PriorityAccordion({ priority }: { priority: StrategicPriority }) {
  return (
    <AccordionItem
      value={priority.name}
      className="rounded-lg border bg-muted/20 px-4"
    >
      <AccordionTrigger className="py-3 hover:no-underline">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="text-left">
            <span className="text-sm font-medium">{priority.name}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              {priority.useCases.length} use case
              {priority.useCases.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pb-4 pt-1">
        <div className="space-y-4">
          {/* Use Cases */}
          <div className="space-y-2">
            {priority.useCases.map((uc) => (
              <UseCaseRow key={uc.name} useCase={uc} />
            ))}
          </div>

          {/* KPIs & Personas Footer */}
          {(priority.kpis.length > 0 || priority.personas.length > 0) && (
            <>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                {priority.kpis.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <BarChart3 className="h-3.5 w-3.5" />
                      Key KPIs
                    </p>
                    <ul className="space-y-0.5">
                      {priority.kpis.map((kpi) => (
                        <li key={kpi} className="text-xs text-foreground/80">
                          {kpi}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {priority.personas.length > 0 && (
                  <div>
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      Key Personas
                    </p>
                    <ul className="space-y-0.5">
                      {priority.personas.map((persona) => (
                        <li
                          key={persona}
                          className="text-xs text-foreground/80"
                        >
                          {persona}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

// ---------------------------------------------------------------------------
// Use Case Row
// ---------------------------------------------------------------------------

function UseCaseRow({ useCase }: { useCase: ReferenceUseCase }) {
  return (
    <div className="rounded-md border bg-background p-3 transition-colors">
      <div className="flex items-start gap-2">
        <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-snug">{useCase.name}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {useCase.description}
          </p>
          {useCase.businessValue && (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              {useCase.businessValue}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Pill
// ---------------------------------------------------------------------------

function StatPill({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1 text-xl font-bold">{value}</p>
    </div>
  );
}

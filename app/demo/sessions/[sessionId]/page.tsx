"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Download,
  ArrowLeft,
  ChevronDown,
  Building2,
  Target,
  BarChart3,
  Map,
  Sparkles,
  MessageSquare,
  FileText,
  Globe,
} from "lucide-react";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";

interface SessionDetail {
  sessionId: string;
  customerName: string;
  industryId: string;
  researchPreset: string;
  catalogName: string;
  schemaName: string;
  status: string;
  tablesCreated: number;
  totalRows: number;
  createdAt: string;
  research: ResearchEngineResult | null;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function SectionCard({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group">
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2 text-base">
              <Icon className="h-4 w-4" />
              {title}
              <ChevronDown className="ml-auto h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function DemoSessionPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    let retryCount = 0;
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 2000;

    const fetchSession = async () => {
      try {
        const r = await fetch(`/api/demo/sessions/${sessionId}`);
        if (cancelled) return;
        if (!r.ok) throw new Error(r.status === 404 ? "Session not found" : "Failed to load");
        const data = await r.json();
        if (cancelled) return;

        if (
          !data.research &&
          retryCount < MAX_RETRIES &&
          ["draft", "generating", "completed"].includes(data.status)
        ) {
          retryCount++;
          setTimeout(() => {
            if (!cancelled) fetchSession();
          }, RETRY_DELAY_MS);
          return;
        }

        setSession(data);
        setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    };

    fetchSession();
    return () => { cancelled = true; };
  }, [sessionId]);

  const handleExport = (format: "pptx" | "pdf") => {
    window.open(`/api/demo/sessions/${sessionId}/export?format=${format}`, "_blank");
  };

  if (loading) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading research data...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Demo Sessions
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-destructive">{error ?? "Session not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { research } = session;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Demo Sessions
        </Link>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{session.customerName}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{session.industryId}</Badge>
            <Badge variant="outline">{session.researchPreset}</Badge>
            <Badge variant={session.status === "completed" ? "default" : session.status === "failed" ? "destructive" : "outline"}>
              {session.status}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {session.catalogName}.{session.schemaName}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDate(session.createdAt)} · {session.tablesCreated} tables ·{" "}
            {session.totalRows.toLocaleString()} rows
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => handleExport("pptx")}>
            <Download className="mr-2 h-4 w-4" />
            Export PPTX
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
        </div>
      </div>

      <div className="sticky top-0 z-10 flex gap-2 rounded-md border bg-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button variant="outline" size="sm" onClick={() => handleExport("pptx")}>
          <Download className="mr-2 h-4 w-4" />
          Export PPTX
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleExport("pdf")}>
          <Download className="mr-2 h-4 w-4" />
          Export PDF
        </Button>
      </div>

      <div className="space-y-4">
        {research?.companyProfile && (
          <SectionCard title="Company Overview" icon={Building2}>
            <div className="space-y-4">
              {research.companyProfile.statedPriorities?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Stated Priorities</h4>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.companyProfile.statedPriorities.map((p, i) => (
                      <li key={i}>
                        {p.priority}
                        {p.source && (
                          <span className="ml-1 text-muted-foreground">
                            ({p.source})
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {research.companyProfile.inferredPriorities?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Inferred Priorities</h4>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.companyProfile.inferredPriorities.map((p, i) => (
                      <li key={i}>
                        {p.priority}
                        {p.evidence && (
                          <span className="ml-1 text-muted-foreground">
                            — {p.evidence}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {research.companyProfile.urgencySignals?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Urgency Signals</h4>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.companyProfile.urgencySignals.map((s, i) => (
                      <li key={i}>
                        {s.signal}
                        {s.type && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            {s.type}
                          </Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {research.companyProfile.strategicGaps?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Strategic Gaps</h4>
                  <ul className="space-y-2">
                    {research.companyProfile.strategicGaps.map((g, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium">{g.gap}</span>
                        <span className="text-muted-foreground">
                          {" "}— {g.opportunity}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {research?.companyProfile?.swotSummary && (
          <SectionCard title="SWOT Analysis" icon={Target}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-green-500/30 bg-green-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-green-700 dark:text-green-400">
                    Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.companyProfile.swotSummary.strengths.map(
                      (s, i) => (
                        <li key={i}>{s}</li>
                      )
                    )}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-red-500/30 bg-red-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">
                    Weaknesses
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.companyProfile.swotSummary.weaknesses.map(
                      (w, i) => (
                        <li key={i}>{w}</li>
                      )
                    )}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-blue-500/30 bg-blue-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">
                    Opportunities
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.companyProfile.swotSummary.opportunities.map(
                      (o, i) => (
                        <li key={i}>{o}</li>
                      )
                    )}
                  </ul>
                </CardContent>
              </Card>
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">
                    Threats
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.companyProfile.swotSummary.threats.map(
                      (t, i) => (
                        <li key={i}>{t}</li>
                      )
                    )}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </SectionCard>
        )}

        {research?.industryLandscape && (
          <SectionCard title="Industry Landscape" icon={Globe}>
            <div className="space-y-4">
              {research.industryLandscape.marketForces?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Market Forces</h4>
                  <ul className="space-y-2">
                    {research.industryLandscape.marketForces.map((f, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium">{f.force}</span>
                        <Badge
                          variant="outline"
                          className="ml-2 text-xs"
                        >
                          {f.urgency}
                        </Badge>
                        <p className="mt-1 text-muted-foreground">
                          {f.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {research.industryLandscape.competitiveDynamics && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Competitive Dynamics</h4>
                  <p className="text-sm text-muted-foreground">
                    {research.industryLandscape.competitiveDynamics}
                  </p>
                </div>
              )}
              {research.industryLandscape.regulatoryPressures && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Regulatory Pressures</h4>
                  <p className="text-sm text-muted-foreground">
                    {research.industryLandscape.regulatoryPressures}
                  </p>
                </div>
              )}
              {research.industryLandscape.technologyDisruptors && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Technology Disruptors</h4>
                  <p className="text-sm text-muted-foreground">
                    {research.industryLandscape.technologyDisruptors}
                  </p>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {research?.industryLandscape?.keyBenchmarks &&
          research.industryLandscape.keyBenchmarks.length > 0 && (
            <SectionCard title="Key Benchmarks" icon={BarChart3}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {research.industryLandscape.keyBenchmarks.map((b, i) => (
                    <TableRow key={i}>
                      <TableCell>{b.metric}</TableCell>
                      <TableCell>{b.impact}</TableCell>
                      <TableCell>{b.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          )}

        {research?.dataStrategy && (
          <SectionCard title="Data Strategy" icon={Map}>
            <div className="space-y-4">
              {research.dataStrategy.assetDetails?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Asset Details</h4>
                  <ul className="space-y-2">
                    {research.dataStrategy.assetDetails.map((a, i) => (
                      <li key={i} className="rounded-md border p-3 text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.id}</span>
                          <Badge variant="secondary">
                            relevance: {a.relevance}
                          </Badge>
                          {a.quickWin && (
                            <Badge variant="outline">Quick Win</Badge>
                          )}
                          <Badge variant="outline">{a.criticality}</Badge>
                        </div>
                        <p className="mt-1 text-muted-foreground">
                          {a.rationale}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {research.dataStrategy.dataMaturityAssessment && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Data Maturity</h4>
                  <Badge variant="secondary">
                    {research.dataStrategy.dataMaturityAssessment}
                  </Badge>
                </div>
              )}
              {research.dataStrategy.prioritisedUseCases?.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-medium">Prioritised Use Cases</h4>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    {research.dataStrategy.prioritisedUseCases.map((u, i) => (
                      <li key={i}>
                        {u.name}
                        {u.benchmarkImpact && (
                          <span className="ml-1 text-muted-foreground">
                            — {u.benchmarkImpact}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {research?.demoNarrative?.demoFlow &&
          research.demoNarrative.demoFlow.length > 0 && (
            <SectionCard title="Demo Flow" icon={MessageSquare}>
              <div className="space-y-3">
                {research.demoNarrative.demoFlow.map((step, i) => (
                  <Card key={i}>
                    <CardHeader className="pb-2">
                      <CardTitle className="flex items-center gap-2 text-sm">
                        <span className="rounded bg-primary/10 px-2 py-0.5 font-mono">
                          {step.step}
                        </span>
                        {step.assetId}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        <span className="font-medium">Moment:</span> {step.moment}
                      </p>
                      <p>
                        <span className="font-medium">Talking point:</span>{" "}
                        {step.talkingPoint}
                      </p>
                      {step.transitionToNext && (
                        <p className="text-muted-foreground">
                          <span className="font-medium">Transition:</span>{" "}
                          {step.transitionToNext}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </SectionCard>
          )}

        {research?.demoNarrative?.killerMoments &&
          research.demoNarrative.killerMoments.length > 0 && (
            <SectionCard title="Killer Moments" icon={Sparkles}>
              <div className="space-y-4">
                {research.demoNarrative.killerMoments.map((m, i) => (
                  <Card key={i} className="border-primary/20">
                    <CardHeader>
                      <CardTitle className="text-base">{m.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        <span className="font-medium">Scenario:</span>{" "}
                        {m.scenario}
                      </p>
                      <p>
                        <span className="font-medium">Insight:</span>{" "}
                        {m.insightStatement}
                      </p>
                      <p>
                        <span className="font-medium">Data story:</span>{" "}
                        {m.dataStory}
                      </p>
                      <p>
                        <span className="font-medium">Expected reaction:</span>{" "}
                        {m.expectedReaction}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </SectionCard>
          )}

        {research?.demoNarrative?.competitorAngles &&
          research.demoNarrative.competitorAngles.length > 0 && (
            <SectionCard title="Competitive Positioning" icon={Target}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competitor</TableHead>
                    <TableHead>Their Move</TableHead>
                    <TableHead>Your Opportunity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {research.demoNarrative.competitorAngles.map((c, i) => (
                    <TableRow key={i}>
                      <TableCell>{c.competitor}</TableCell>
                      <TableCell>{c.theirMove}</TableCell>
                      <TableCell>{c.yourOpportunity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </SectionCard>
          )}

        {research?.demoNarrative?.executiveTalkingPoints &&
          research.demoNarrative.executiveTalkingPoints.length > 0 && (
            <SectionCard title="Executive Talking Points" icon={FileText}>
              <div className="space-y-3">
                {research.demoNarrative.executiveTalkingPoints.map((e, i) => (
                  <Card key={i}>
                    <CardContent className="pt-4">
                      <p className="font-medium">{e.headline}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {e.benchmarkTieIn}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </SectionCard>
          )}

        {research?.dataNarratives && research.dataNarratives.length > 0 && (
          <SectionCard title="Data Narratives" icon={BarChart3}>
            <div className="space-y-3">
              {research.dataNarratives.map((n, i) => (
                <Card key={i}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{n.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p className="text-muted-foreground">{n.description}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{n.pattern}</Badge>
                      {n.affectedTables?.length > 0 && (
                        <span className="text-muted-foreground">
                          Tables: {n.affectedTables.join(", ")}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionCard>
        )}

        {research?.sources && research.sources.length > 0 && (
          <SectionCard title="Sources" icon={Globe}>
            <ul className="space-y-2">
              {research.sources.map((s, i) => (
                <li
                  key={i}
                  className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <Badge variant="secondary">{s.type}</Badge>
                  <Badge variant={s.status === "ready" ? "default" : "outline"}>
                    {s.status}
                  </Badge>
                  {s.title && (
                    <span className="truncate text-muted-foreground">
                      {s.title}
                    </span>
                  )}
                  <span className="text-muted-foreground">
                    {s.charCount.toLocaleString()} chars
                  </span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </div>
  );
}

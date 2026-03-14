"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Rocket,
  ScanSearch,
  Copy,
  Database,
  Layers,
  Calendar,
  Loader2,
  ChevronRight,
  Zap,
  TrendingUp,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
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
  durationMs: number;
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

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "completed"
      ? "bg-emerald-500"
      : status === "failed"
        ? "bg-red-500"
        : "bg-amber-500";
  return (
    <span className="relative flex h-2.5 w-2.5">
      {status === "completed" && (
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-40`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

function KPIStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-sm">
      <Icon className="h-4 w-4 shrink-0 text-white/50" />
      <div>
        <p className="text-[11px] uppercase tracking-wider text-white/40">{label}</p>
        <p className="text-lg font-semibold text-white">{value}</p>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  icon: Icon,
  accentColor = "border-l-primary",
  children,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} className="group">
      <Card className={`overflow-hidden border-l-4 ${accentColor}`}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer transition-colors hover:bg-muted/40">
            <CardTitle className="flex items-center gap-2.5 text-[15px] font-semibold tracking-tight">
              <Icon className="h-[18px] w-[18px] text-muted-foreground" />
              {title}
              <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground/60 transition-transform group-data-[state=open]:rotate-180" />
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

function UrgencyBadge({ urgency }: { urgency: string }) {
  const variants: Record<string, string> = {
    accelerating: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400",
    stable: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400",
    emerging: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${variants[urgency] ?? variants.stable}`}>
      {urgency}
    </span>
  );
}

export default function DemoSessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [launching, setLaunching] = useState<"discovery" | "scan" | null>(null);

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

  const handleCopyFqn = useCallback(() => {
    if (!session) return;
    navigator.clipboard.writeText(`${session.catalogName}.${session.schemaName}`);
    toast.success("Schema copied to clipboard");
  }, [session]);

  const handleLaunchDiscovery = useCallback(async () => {
    if (!session) return;
    setLaunching("discovery");
    try {
      const scope = `${session.catalogName}.${session.schemaName}`;
      const createRes = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: session.customerName,
          ucMetadata: scope,
          industry: session.industryId,
          businessPriorities: ["Increase Revenue"],
          discoveryDepth: "balanced",
          estateScanEnabled: false,
        }),
      });
      if (!createRes.ok) throw new Error("Failed to create pipeline run");
      const { runId } = await createRes.json();

      const execRes = await fetch(`/api/runs/${runId}/execute`, { method: "POST" });
      if (!execRes.ok) throw new Error("Failed to start pipeline");

      toast.success("Discovery pipeline started");
      router.push(`/runs/${runId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to launch discovery");
      setLaunching(null);
    }
  }, [session, router]);

  const handleLaunchEstateScan = useCallback(async () => {
    if (!session) return;
    setLaunching("scan");
    try {
      const scope = `${session.catalogName}.${session.schemaName}`;
      const res = await fetch("/api/environment-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ucMetadata: scope }),
      });
      if (!res.ok) throw new Error("Failed to start estate scan");

      toast.success("Estate scan started");
      router.push("/environment");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to launch estate scan");
      setLaunching(null);
    }
  }, [session, router]);

  if (loading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
        <div className="relative">
          <div className="h-12 w-12 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">Loading intelligence briefing...</p>
          <p className="text-xs text-muted-foreground">Assembling research data</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="space-y-4">
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Demo Sessions
        </Link>
        <Card className="border-destructive/30">
          <CardContent className="py-16 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive/60" />
            <p className="text-destructive font-medium">{error ?? "Session not found"}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { research } = session;
  const fqn = `${session.catalogName}.${session.schemaName}`;
  const sourceCount = research?.sources?.filter((s) => s.status === "ready").length ?? 0;
  const isCompleted = session.status === "completed";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link
        href="/demo"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Demo Sessions
      </Link>

      {/* ================================================================
          HERO BANNER
          ================================================================ */}
      <div className="relative overflow-hidden rounded-xl bg-[oklch(0.19_0.015_225)] text-white">
        {/* Decorative elements */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-primary/8" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-primary/6" />
        <div className="pointer-events-none absolute right-1/3 top-0 h-px w-32 bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <div className="relative px-8 py-8">
          {/* Top row: badges + status */}
          <div className="flex items-center gap-2.5">
            <Badge variant="secondary" className="border-white/10 bg-white/10 text-white/80 hover:bg-white/15">
              {session.industryId}
            </Badge>
            <Badge variant="secondary" className="border-white/10 bg-white/10 text-white/60 hover:bg-white/15 font-mono text-[11px]">
              {session.researchPreset}
            </Badge>
            <div className="ml-auto flex items-center gap-2">
              <StatusDot status={session.status} />
              <span className="text-sm font-medium capitalize text-white/70">{session.status}</span>
            </div>
          </div>

          {/* Customer name */}
          <h1 className="mt-5 text-[2.5rem] font-bold leading-none tracking-tight">
            {session.customerName}
          </h1>

          {/* Schema FQN */}
          <button
            onClick={handleCopyFqn}
            className="mt-3 inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <Database className="h-3.5 w-3.5" />
            {fqn}
            <Copy className="h-3 w-3" />
          </button>

          {/* KPI Stats */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KPIStat icon={Layers} label="Tables" value={session.tablesCreated} />
            <KPIStat icon={BarChart3} label="Total Rows" value={session.totalRows.toLocaleString()} />
            <KPIStat icon={Globe} label="Sources" value={sourceCount} />
            <KPIStat
              icon={Calendar}
              label="Created"
              value={formatDate(session.createdAt)}
            />
          </div>
        </div>
      </div>

      {/* ================================================================
          STICKY COMMAND BAR
          ================================================================ */}
      <div className="sticky top-0 z-20 -mx-1 px-1">
        <div className="flex items-center gap-2 rounded-lg border bg-background/90 px-4 py-2.5 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
          {/* Primary actions */}
          {isCompleted && (
            <>
              <Button
                size="sm"
                onClick={handleLaunchDiscovery}
                disabled={launching !== null}
                className="gap-2 shadow-sm"
              >
                {launching === "discovery" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Rocket className="h-4 w-4" />
                )}
                Launch Discovery
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLaunchEstateScan}
                disabled={launching !== null}
                className="gap-2"
              >
                {launching === "scan" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanSearch className="h-4 w-4" />
                )}
                Estate Scan
              </Button>

              <div className="mx-2 h-5 w-px bg-border" />
            </>
          )}

          {/* Export dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                Export
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => handleExport("pptx")}>
                <FileText className="mr-2 h-4 w-4" />
                PowerPoint (.pptx)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport("pdf")}>
                <FileText className="mr-2 h-4 w-4" />
                PDF Document
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Right side: FQN */}
          <button
            onClick={handleCopyFqn}
            className="ml-auto hidden items-center gap-1.5 rounded-md px-2 py-1 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
          >
            <Database className="h-3 w-3" />
            {fqn}
            <Copy className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ================================================================
          RESEARCH SECTIONS
          ================================================================ */}
      <div className="space-y-4">
        {/* ---- Company Overview ---- */}
        {research?.companyProfile && (
          <SectionCard title="Company Overview" icon={Building2} accentColor="border-l-blue-500">
            <div className="space-y-5">
              {research.companyProfile.statedPriorities?.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Stated Priorities</h4>
                  <ul className="space-y-1.5">
                    {research.companyProfile.statedPriorities.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <span>
                          {p.priority}
                          {p.source && (
                            <span className="ml-1.5 text-muted-foreground">({p.source})</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {research.companyProfile.inferredPriorities?.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Inferred Priorities</h4>
                  <ul className="space-y-1.5">
                    {research.companyProfile.inferredPriorities.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500/60" />
                        <span>
                          <span className="font-medium">{p.priority}</span>
                          {p.evidence && (
                            <span className="ml-1 text-muted-foreground"> — {p.evidence}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {research.companyProfile.urgencySignals?.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Urgency Signals</h4>
                  <ul className="space-y-1.5">
                    {research.companyProfile.urgencySignals.map((s, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        <span>{s.signal}</span>
                        {s.type && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{s.type}</Badge>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {research.companyProfile.strategicGaps?.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Strategic Gaps</h4>
                  <ul className="space-y-2">
                    {research.companyProfile.strategicGaps.map((g, i) => (
                      <li key={i} className="text-sm">
                        <span className="font-medium">{g.gap}</span>
                        <span className="text-muted-foreground"> — {g.opportunity}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </SectionCard>
        )}

        {/* ---- SWOT Analysis ---- */}
        {research?.companyProfile?.swotSummary && (
          <SectionCard title="SWOT Analysis" icon={Target} accentColor="border-l-violet-500">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Strengths", items: research.companyProfile.swotSummary.strengths, icon: TrendingUp, color: "border-emerald-500/30 bg-emerald-500/5", textColor: "text-emerald-700 dark:text-emerald-400", iconColor: "text-emerald-500" },
                { label: "Weaknesses", items: research.companyProfile.swotSummary.weaknesses, icon: AlertTriangle, color: "border-red-500/30 bg-red-500/5", textColor: "text-red-700 dark:text-red-400", iconColor: "text-red-500" },
                { label: "Opportunities", items: research.companyProfile.swotSummary.opportunities, icon: Sparkles, color: "border-blue-500/30 bg-blue-500/5", textColor: "text-blue-700 dark:text-blue-400", iconColor: "text-blue-500" },
                { label: "Threats", items: research.companyProfile.swotSummary.threats, icon: Shield, color: "border-amber-500/30 bg-amber-500/5", textColor: "text-amber-700 dark:text-amber-400", iconColor: "text-amber-500" },
              ].map(({ label, items, icon: SIcon, color, textColor, iconColor }) => (
                <Card key={label} className={color}>
                  <CardHeader className="pb-2">
                    <CardTitle className={`flex items-center gap-2 text-sm font-semibold ${textColor}`}>
                      <SIcon className={`h-4 w-4 ${iconColor}`} />
                      {label}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {(items ?? []).map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className={`mt-2 h-1 w-1 shrink-0 rounded-full ${iconColor}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionCard>
        )}

        {/* ---- Industry Landscape ---- */}
        {research?.industryLandscape && (
          <SectionCard title="Industry Landscape" icon={Globe} accentColor="border-l-teal-500">
            <div className="space-y-5">
              {research.industryLandscape.marketForces?.length ? (
                <div>
                  <h4 className="mb-3 text-sm font-semibold tracking-tight">Market Forces</h4>
                  <div className="space-y-3">
                    {research.industryLandscape.marketForces.map((f, i) => (
                      <div key={i} className="rounded-lg border bg-muted/30 p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{f.force}</span>
                          <UrgencyBadge urgency={f.urgency} />
                        </div>
                        <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {research.industryLandscape.competitiveDynamics && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Competitive Dynamics</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{research.industryLandscape.competitiveDynamics}</p>
                </div>
              )}
              {research.industryLandscape.regulatoryPressures && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Regulatory Pressures</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{research.industryLandscape.regulatoryPressures}</p>
                </div>
              )}
              {research.industryLandscape.technologyDisruptors && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Technology Disruptors</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{research.industryLandscape.technologyDisruptors}</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* ---- Key Benchmarks ---- */}
        {research?.industryLandscape?.keyBenchmarks?.length ? (
          <SectionCard title="Key Benchmarks" icon={BarChart3} accentColor="border-l-orange-500" defaultOpen={false}>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Metric</TableHead>
                    <TableHead className="font-semibold">Impact</TableHead>
                    <TableHead className="font-semibold">Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {research.industryLandscape.keyBenchmarks.map((b, i) => (
                    <TableRow key={i} className="even:bg-muted/20">
                      <TableCell className="font-medium">{b.metric}</TableCell>
                      <TableCell className="text-muted-foreground">{b.impact}</TableCell>
                      <TableCell className="text-muted-foreground">{b.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        ) : null}

        {/* ---- Data Strategy ---- */}
        {research?.dataStrategy && (
          <SectionCard title="Data Strategy" icon={Map} accentColor="border-l-indigo-500">
            <div className="space-y-5">
              {research.dataStrategy.assetDetails?.length ? (
                <div className="space-y-2.5">
                  {research.dataStrategy.assetDetails.map((a, i) => (
                    <div key={i} className="rounded-lg border p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-indigo-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-400">{a.id}</span>
                        <Badge variant="secondary" className="text-[10px]">relevance: {a.relevance}</Badge>
                        {a.quickWin && <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 text-[10px]">Quick Win</Badge>}
                        <Badge variant="outline" className="text-[10px]">{a.criticality}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{a.rationale}</p>
                    </div>
                  ))}
                </div>
              ) : null}
              {research.dataStrategy.dataMaturityAssessment && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">Data Maturity:</span>
                  <Badge variant="secondary">{research.dataStrategy.dataMaturityAssessment}</Badge>
                </div>
              )}
              {research.dataStrategy.prioritisedUseCases?.length ? (
                <div>
                  <h4 className="mb-2 text-sm font-semibold tracking-tight">Prioritised Use Cases</h4>
                  <ul className="space-y-1.5">
                    {research.dataStrategy.prioritisedUseCases.map((u, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />
                        <span>
                          {u.name}
                          {u.benchmarkImpact && <span className="ml-1.5 text-muted-foreground">— {u.benchmarkImpact}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </SectionCard>
        )}

        {/* ---- Demo Flow (timeline) ---- */}
        {research?.demoNarrative?.demoFlow?.length ? (
          <SectionCard title="Demo Flow" icon={MessageSquare} accentColor="border-l-primary">
            <div className="relative ml-4 border-l-2 border-primary/20 pl-6 space-y-5">
              {research.demoNarrative.demoFlow.map((step, i) => (
                <div key={i} className="relative">
                  <div className="absolute -left-[33px] flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground shadow-sm">
                    {step.step}
                  </div>
                  <div className="rounded-lg border bg-card p-3.5">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-semibold">{step.moment}</span>
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">{step.assetId}</span>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">{step.talkingPoint}</p>
                    {step.transitionToNext && (
                      <p className="mt-1.5 text-xs italic text-muted-foreground/60">{step.transitionToNext}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {/* ---- Killer Moments ---- */}
        {research?.demoNarrative?.killerMoments?.length ? (
          <SectionCard title="Killer Moments" icon={Sparkles} accentColor="border-l-primary">
            <div className="space-y-4">
              {research.demoNarrative.killerMoments.map((m, i) => (
                <Card key={i} className="border-primary/20 bg-primary/[0.02] shadow-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {m.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 text-sm">
                    <p><span className="font-medium text-foreground">Scenario:</span> <span className="text-muted-foreground">{m.scenario}</span></p>
                    <p><span className="font-medium text-foreground">Insight:</span> <span className="text-muted-foreground">{m.insightStatement}</span></p>
                    <p><span className="font-medium text-foreground">Data story:</span> <span className="text-muted-foreground">{m.dataStory}</span></p>
                    <p><span className="font-medium text-foreground">Expected reaction:</span> <span className="text-muted-foreground">{m.expectedReaction}</span></p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {/* ---- Competitive Positioning ---- */}
        {research?.demoNarrative?.competitorAngles?.length ? (
          <SectionCard title="Competitive Positioning" icon={Target} accentColor="border-l-rose-500" defaultOpen={false}>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Competitor</TableHead>
                    <TableHead className="font-semibold">Their Move</TableHead>
                    <TableHead className="font-semibold">Your Opportunity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {research.demoNarrative.competitorAngles.map((c, i) => (
                    <TableRow key={i} className="even:bg-muted/20">
                      <TableCell className="font-medium">{c.competitor}</TableCell>
                      <TableCell className="text-muted-foreground">{c.theirMove}</TableCell>
                      <TableCell className="text-muted-foreground">{c.yourOpportunity}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        ) : null}

        {/* ---- Executive Talking Points ---- */}
        {research?.demoNarrative?.executiveTalkingPoints?.length ? (
          <SectionCard title="Executive Talking Points" icon={FileText} accentColor="border-l-sky-500" defaultOpen={false}>
            <div className="space-y-2.5">
              {research.demoNarrative.executiveTalkingPoints.map((e, i) => (
                <div key={i} className="rounded-lg border bg-muted/20 p-3.5">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-sky-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-700 dark:text-sky-400">{e.assetId}</span>
                    <p className="text-sm font-medium">{e.headline}</p>
                  </div>
                  <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{e.benchmarkTieIn}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {/* ---- Data Narratives ---- */}
        {research?.dataNarratives?.length ? (
          <SectionCard title="Data Narratives" icon={BarChart3} accentColor="border-l-emerald-500" defaultOpen={false}>
            <div className="grid gap-3 sm:grid-cols-2">
              {research.dataNarratives.map((n, i) => (
                <Card key={i} className="bg-muted/20">
                  <CardContent className="pt-4">
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{n.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{n.pattern}</Badge>
                      {n.affectedTables?.length ? (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {n.affectedTables.join(", ")}
                        </span>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </SectionCard>
        ) : null}

        {/* ---- Sources ---- */}
        {research?.sources?.length ? (
          <SectionCard title="Sources" icon={Globe} accentColor="border-l-gray-400" defaultOpen={false}>
            <div className="flex flex-wrap gap-2">
              {research.sources.map((s, i) => {
                const linkUrl = s.url ?? (s.title?.startsWith("http") ? s.title : undefined);
                const label = s.url && s.title !== s.url ? s.title : (s.title ?? s.url);
                return (
                  <div
                    key={i}
                    className="inline-flex items-center gap-2 rounded-full border bg-muted/30 px-3 py-1.5 text-xs"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${s.status === "ready" ? "bg-emerald-500" : s.status === "failed" ? "bg-red-500" : "bg-amber-500"}`} />
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{s.type}</Badge>
                    {linkUrl ? (
                      <a
                        href={linkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="max-w-[250px] truncate text-primary hover:underline"
                        title={linkUrl}
                      >
                        {label}
                      </a>
                    ) : (
                      label && <span className="max-w-[200px] truncate text-muted-foreground">{label}</span>
                    )}
                    <span className="text-muted-foreground/60">{s.charCount.toLocaleString()}</span>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </div>
  );
}

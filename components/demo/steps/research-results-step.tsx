"use client";

import { useEffect, useState, useRef } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Globe,
  FileText,
  Search,
  BarChart3,
  Building2,
  Map,
  Sparkles,
  CircleDot,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";
import type { ResearchJobStatus } from "@/lib/demo/research-engine/engine-status";
import type { ResearchPhase } from "@/lib/demo/research-engine/types";

interface ResearchResultsStepProps {
  sessionId: string;
  research: ResearchEngineResult | null;
  onResearchComplete: (result: ResearchEngineResult) => void;
}

const PHASE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  "source-collection": { label: "Gathering Sources", icon: <Globe className="h-4 w-4" /> },
  "website-scrape": { label: "Scraping Website", icon: <Globe className="h-4 w-4" /> },
  "ir-discovery": { label: "Investor Relations", icon: <FileText className="h-4 w-4" /> },
  "doc-parsing": { label: "Parsing Documents", icon: <FileText className="h-4 w-4" /> },
  "industry-classification": { label: "Classifying Industry", icon: <Search className="h-4 w-4" /> },
  "outcome-map-generation": { label: "Industry Knowledge", icon: <Map className="h-4 w-4" /> },
  "quick-synthesis": { label: "Quick Synthesis", icon: <Sparkles className="h-4 w-4" /> },
  "industry-landscape": { label: "Industry Landscape", icon: <BarChart3 className="h-4 w-4" /> },
  "strategy-and-narrative": { label: "Strategy & Narrative", icon: <Building2 className="h-4 w-4" /> },
  "company-deep-dive": { label: "Company Deep-Dive", icon: <Building2 className="h-4 w-4" /> },
  "data-strategy-mapping": { label: "Data Strategy Mapping", icon: <Map className="h-4 w-4" /> },
  "demo-narrative": { label: "Demo Narrative Design", icon: <Sparkles className="h-4 w-4" /> },
  complete: { label: "Complete", icon: <CheckCircle2 className="h-4 w-4" /> },
};

const PHASE_ORDER: ResearchPhase[] = [
  "source-collection",
  "website-scrape",
  "ir-discovery",
  "doc-parsing",
  "industry-classification",
  "outcome-map-generation",
  "quick-synthesis",
  "industry-landscape",
  "strategy-and-narrative",
  "company-deep-dive",
  "data-strategy-mapping",
  "demo-narrative",
  "complete",
];

export function ResearchResultsStep({
  sessionId,
  research,
  onResearchComplete,
}: ResearchResultsStepProps) {
  const [status, setStatus] = useState<ResearchJobStatus | null>(null);
  const [completedPhases, setCompletedPhases] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState(0);
  const lastPhaseRef = useRef<string>("");

  useEffect(() => {
    if (research) return;
    if (!sessionId) return;

    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/demo/research/status?sessionId=${sessionId}`);
        const data: ResearchJobStatus = await resp.json();
        setStatus(data);

        if (data.phase && data.phase !== lastPhaseRef.current) {
          if (lastPhaseRef.current) {
            setCompletedPhases((prev) => new Set([...prev, lastPhaseRef.current]));
          }
          lastPhaseRef.current = data.phase;
        }

        if (data.status === "completed") {
          clearInterval(interval);
          setCompletedPhases((prev) => new Set([...prev, "complete"]));
          const detailResp = await fetch(`/api/demo/sessions/${sessionId}`);
          const detail = await detailResp.json();
          if (detail.research) {
            onResearchComplete(detail.research);
          }
        }

        if (data.status === "failed") {
          clearInterval(interval);
        }
      } catch {
        // retry next interval
      }
    }, 2_000);

    return () => clearInterval(interval);
  }, [sessionId, research, onResearchComplete]);

  useEffect(() => {
    if (!status?.startedAt || status.status !== "researching") return;
    const tick = () => setElapsed(Math.floor((Date.now() - status.startedAt) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [status?.startedAt, status?.status]);

  if (research) {
    return <ResearchSummary research={research} sessionId={sessionId} />;
  }

  if (!status) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Connecting...</span>
      </div>
    );
  }

  if (status.status === "failed") {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
        <p className="text-destructive font-medium">Research failed</p>
        <p className="text-sm text-muted-foreground mt-1">{status.error}</p>
      </div>
    );
  }

  const activePhases = PHASE_ORDER.filter((p) => completedPhases.has(p) || p === status.phase);

  return (
    <div className="space-y-6 px-1">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{status.message}</span>
          <span className="text-xs text-muted-foreground">
            {elapsed}s elapsed
          </span>
        </div>
        <Progress value={status.percent} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{status.percent}%</span>
        </div>
      </div>

      <div className="space-y-1.5">
        {activePhases.map((phase) => {
          const meta = PHASE_LABELS[phase] ?? { label: phase, icon: <CircleDot className="h-4 w-4" /> };
          const isCompleted = completedPhases.has(phase);
          const isActive = phase === status.phase && !isCompleted;

          return (
            <div
              key={phase}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                isActive
                  ? "bg-primary/5 border border-primary/20"
                  : isCompleted
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
              ) : isActive ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              ) : (
                <span className="h-4 w-4 shrink-0">{meta.icon}</span>
              )}
              <span className={isActive ? "font-medium text-foreground" : ""}>
                {meta.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ResearchSummary({
  research,
  sessionId,
}: {
  research: ResearchEngineResult;
  sessionId: string;
}) {
  return (
    <div className="space-y-4 px-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-5 w-5" />
          <span className="font-medium">Research Complete</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/demo/sessions/${sessionId}`, "_blank")}
        >
          <ExternalLink className="mr-2 h-3.5 w-3.5" />
          View Full Insights
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Stat label="Industry" value={research.industryId} />
        <Stat label="Data Assets Matched" value={String(research.matchedDataAssetIds.length)} />
        <Stat label="Sources Used" value={String(research.sources.filter((s) => s.status === "ready").length)} />
        <Stat label="Data Narratives" value={String(research.dataNarratives.length)} />
      </div>

      {research.companyProfile?.statedPriorities && research.companyProfile.statedPriorities.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Key Priorities</p>
          <div className="flex flex-wrap gap-2">
            {research.companyProfile.statedPriorities.slice(0, 6).map((p, i) => (
              <Badge key={i} variant="secondary">{p.priority}</Badge>
            ))}
          </div>
        </div>
      )}

      {research.nomenclature && Object.keys(research.nomenclature).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Company Terminology</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(research.nomenclature).slice(0, 8).map(([k, v]) => (
              <Badge key={k} variant="outline">{k}: {v}</Badge>
            ))}
          </div>
        </div>
      )}

      {research.generatedOutcomeMap && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            A new industry outcome map was generated for this customer&apos;s industry and saved for future use.
          </p>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Clock, AlertCircle, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";
import type { ResearchJobStatus } from "@/lib/demo/research-engine/engine-status";

interface ResearchResultsStepProps {
  sessionId: string;
  research: ResearchEngineResult | null;
  onResearchComplete: (result: ResearchEngineResult) => void;
}

export function ResearchResultsStep({
  sessionId,
  research,
  onResearchComplete,
}: ResearchResultsStepProps) {
  const [status, setStatus] = useState<ResearchJobStatus | null>(null);

  useEffect(() => {
    if (research) return;
    if (!sessionId) return;

    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`/api/demo/research/status?sessionId=${sessionId}`);
        const data: ResearchJobStatus = await resp.json();
        setStatus(data);

        if (data.status === "completed") {
          clearInterval(interval);
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

  if (research) {
    return <ResearchSummary research={research} />;
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

  return (
    <div className="space-y-6 px-1">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{status.message}</span>
          <span className="text-xs text-muted-foreground">{status.percent}%</span>
        </div>
        <Progress value={status.percent} />
      </div>

      <div className="text-sm text-muted-foreground">
        <p>
          Phase: <Badge variant="outline">{status.phase}</Badge>
        </p>
      </div>
    </div>
  );
}

function ResearchSummary({ research }: { research: ResearchEngineResult }) {
  return (
    <div className="space-y-4 px-1">
      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-medium">Research Complete</span>
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

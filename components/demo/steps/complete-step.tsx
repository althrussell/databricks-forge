"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  Database,
  Rocket,
  ScanSearch,
  Loader2,
  ExternalLink,
  Layers,
  BarChart3,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import type { DemoSessionSummary } from "@/lib/demo/types";

interface CompleteStepProps {
  sessionId: string;
  catalog: string;
  schema: string;
  customerName?: string;
  industryId?: string;
}

export function CompleteStep({ sessionId, catalog, schema, customerName, industryId }: CompleteStepProps) {
  const router = useRouter();
  const [session, setSession] = useState<DemoSessionSummary | null>(null);
  const [launching, setLaunching] = useState<"discovery" | "scan" | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/demo/sessions/${sessionId}`)
      .then((r) => r.json())
      .then(setSession)
      .catch(() => {});
  }, [sessionId]);

  const fqn = `${catalog}.${schema}`;

  const handleCopyFqn = () => {
    navigator.clipboard.writeText(fqn);
    toast.success("Copied to clipboard");
  };

  const handleLaunchDiscovery = useCallback(async () => {
    setLaunching("discovery");
    try {
      const createRes = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: customerName ?? catalog,
          ucMetadata: fqn,
          industry: industryId ?? "",
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
  }, [fqn, customerName, industryId, catalog, router]);

  const handleLaunchEstateScan = useCallback(async () => {
    setLaunching("scan");
    try {
      const res = await fetch("/api/environment-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ucMetadata: fqn }),
      });
      if (!res.ok) throw new Error("Failed to start estate scan");

      toast.success("Estate scan started");
      router.push("/environment");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to launch estate scan");
      setLaunching(null);
    }
  }, [fqn, router]);

  return (
    <div className="space-y-6 px-1">
      {/* Success header */}
      <div className="flex flex-col items-center gap-3 py-6">
        <div className="relative">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-4 w-4 rounded-full bg-emerald-500" />
          </span>
        </div>
        <h3 className="text-xl font-semibold tracking-tight">Demo Data Ready</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Synthetic demo data has been generated and is ready for analysis.
          Launch a discovery pipeline or estate scan to see Forge in action.
        </p>
      </div>

      {/* Schema card */}
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <code className="text-sm font-mono font-medium">{fqn}</code>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCopyFqn}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>

        {session && (
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-md bg-muted/50 p-2.5 text-center">
              <Layers className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-lg font-semibold">{session.tablesCreated}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tables</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2.5 text-center">
              <BarChart3 className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-lg font-semibold">{session.totalRows.toLocaleString()}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Rows</p>
            </div>
            <div className="rounded-md bg-muted/50 p-2.5 text-center">
              <Clock className="mx-auto h-4 w-4 text-muted-foreground mb-1" />
              <p className="text-lg font-semibold">{Math.round(session.durationMs / 1000)}s</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duration</p>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="space-y-2.5">
        <Button
          className="w-full gap-2"
          size="lg"
          onClick={handleLaunchDiscovery}
          disabled={launching !== null}
        >
          {launching === "discovery" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Rocket className="h-4 w-4" />
          )}
          Launch Discovery Pipeline
        </Button>
        <Button
          variant="outline"
          className="w-full gap-2"
          size="lg"
          onClick={handleLaunchEstateScan}
          disabled={launching !== null}
        >
          {launching === "scan" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
          Run Estate Scan
        </Button>
      </div>

      {/* Session link */}
      <div className="flex justify-center">
        <Button
          variant="link"
          size="sm"
          className="gap-1.5 text-muted-foreground"
          onClick={() => router.push(`/demo/sessions/${sessionId}`)}
        >
          View full research briefing
          <ExternalLink className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

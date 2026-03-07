"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, XCircle, Loader2, LayoutDashboard } from "lucide-react";
import { toast } from "sonner";
import type { DashboardRecommendation } from "@/lib/dashboard/types";
import {
  MetricViewDependencyModal,
  type MissingMetricView,
  type DeployedResult,
} from "@/components/pipeline/metric-view-dependency-modal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "configure" | "mv-deps" | "deploying" | "done";

interface DomainResult {
  domain: string;
  dashboardId?: string;
  dashboardUrl?: string;
  action?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DashboardDeployModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  runId: string;
  recommendations: DashboardRecommendation[];
  databricksHost: string | null;
  onDeployComplete: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardDeployModal({
  open,
  onOpenChange,
  runId,
  recommendations,
  onDeployComplete,
}: DashboardDeployModalProps) {
  const [step, setStep] = useState<Step>("configure");
  const [parentPath, setParentPath] = useState("/Shared/Forge Dashboards/");
  const [publishAfterDeploy, setPublishAfterDeploy] = useState(false);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [deployingIdx, setDeployingIdx] = useState(0);

  // Metric view dependency gate
  const [missingMvs, setMissingMvs] = useState<MissingMetricView[]>([]);
  const [checkingDeps, setCheckingDeps] = useState(false);
  const [defaultMvSchema, setDefaultMvSchema] = useState("");
  const [fqnRewrites, setFqnRewrites] = useState<Record<string, string>>({});

  function handleClose() {
    const wasCompleted = step === "done";
    setStep("configure");
    setResults([]);
    setDeployingIdx(0);
    setMissingMvs([]);
    setCheckingDeps(false);
    setFqnRewrites({});
    onOpenChange(false);
    if (wasCompleted) {
      onDeployComplete();
    }
  }

  async function checkDepsAndDeploy() {
    setCheckingDeps(true);

    try {
      const allMissing: MissingMetricView[] = [];
      let schema = "";

      for (const rec of recommendations) {
        try {
          const res = await fetch("/api/metric-views/check-dependencies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ runId, domain: rec.domain }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.missing && data.missing.length > 0) {
              for (const mv of data.missing) {
                if (!allMissing.some((m) => m.fqn === mv.fqn)) {
                  allMissing.push(mv);
                  if (!schema && mv.fqn) {
                    const parts = mv.fqn.split(".");
                    if (parts.length >= 2) schema = `${parts[0]}.${parts[1]}`;
                  }
                }
              }
            }
          }
        } catch {
          // If check fails for a domain, proceed anyway
        }
      }

      if (allMissing.length > 0) {
        setMissingMvs(allMissing);
        setDefaultMvSchema(schema);
        setStep("mv-deps");
      } else {
        handleDeploy();
      }
    } catch {
      handleDeploy();
    } finally {
      setCheckingDeps(false);
    }
  }

  async function handleDeploy(rewrites?: Record<string, string>) {
    const activeRewrites = rewrites ?? fqnRewrites;
    setStep("deploying");
    setResults([]);
    const deployResults: DomainResult[] = [];

    for (let i = 0; i < recommendations.length; i++) {
      const rec = recommendations[i];
      setDeployingIdx(i);

      try {
        const bodyPayload: Record<string, unknown> = {
          parentPath,
          publish: publishAfterDeploy,
        };
        if (Object.keys(activeRewrites).length > 0) {
          bodyPayload.fqnRewrites = activeRewrites;
        }

        const res = await fetch(
          `/api/runs/${runId}/dashboard-engine/${encodeURIComponent(rec.domain)}/deploy`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(bodyPayload),
          },
        );

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          deployResults.push({
            domain: rec.domain,
            error: data.error ?? `HTTP ${res.status}`,
          });
        } else {
          const data = await res.json();
          deployResults.push({
            domain: rec.domain,
            dashboardId: data.dashboardId,
            dashboardUrl: data.dashboardUrl,
            action: data.action,
          });
        }
      } catch (err) {
        deployResults.push({
          domain: rec.domain,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }

      setResults([...deployResults]);
    }

    setStep("done");

    const successCount = deployResults.filter((r) => !r.error).length;
    if (successCount === deployResults.length) {
      toast.success(`${successCount} dashboard${successCount !== 1 ? "s" : ""} deployed`);
    } else {
      toast.warning(`${successCount}/${deployResults.length} dashboards deployed`);
    }
  }

  const successCount = results.filter((r) => !r.error).length;
  const failCount = results.filter((r) => r.error).length;

  return (
    <Dialog
      open={open}
      onOpenChange={step === "deploying" || step === "mv-deps" ? undefined : handleClose}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5" />
            Deploy Dashboard{recommendations.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            {recommendations.length === 1
              ? `Deploy "${recommendations[0].title}" to your Databricks workspace`
              : `Deploy ${recommendations.length} dashboards to your Databricks workspace`}
          </DialogDescription>
        </DialogHeader>

        {step === "configure" && (
          <div className="space-y-4 py-4">
            {/* Domains to deploy */}
            <div>
              <Label className="text-sm font-medium">Dashboards</Label>
              <div className="mt-2 space-y-1">
                {recommendations.map((rec) => (
                  <div key={rec.domain} className="flex items-center gap-2 py-1">
                    <Badge variant="outline" className="text-xs">
                      {rec.datasetCount} datasets
                    </Badge>
                    <span className="text-sm">{rec.title}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Workspace path */}
            <div>
              <Label htmlFor="parentPath" className="text-sm font-medium">
                Workspace Path
              </Label>
              <Input
                id="parentPath"
                value={parentPath}
                onChange={(e) => setParentPath(e.target.value)}
                placeholder="/Shared/Forge Dashboards/"
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The workspace folder where dashboards will be created
              </p>
            </div>

            {/* Publish option */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="publish"
                checked={publishAfterDeploy}
                onCheckedChange={(checked) => setPublishAfterDeploy(checked === true)}
              />
              <Label htmlFor="publish" className="text-sm cursor-pointer">
                Publish dashboards immediately (makes them viewable by others)
              </Label>
            </div>
          </div>
        )}

        {step === "deploying" && (
          <div className="py-6 space-y-3">
            {recommendations.map((rec, i) => {
              const result = results.find((r) => r.domain === rec.domain);
              const isCurrent = i === deployingIdx && !result;

              return (
                <div key={rec.domain} className="flex items-center gap-3 py-1">
                  {result?.error ? (
                    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                  ) : result ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border shrink-0" />
                  )}
                  <span className="text-sm">{rec.title}</span>
                  {result?.error && (
                    <span className="text-xs text-red-500 ml-auto">{result.error}</span>
                  )}
                  {result?.action && (
                    <Badge variant="outline" className="text-xs ml-auto">
                      {result.action}
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {step === "done" && (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3 justify-center">
              {failCount === 0 ? (
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              ) : (
                <XCircle className="h-8 w-8 text-amber-500" />
              )}
              <div className="text-center">
                <div className="text-lg font-semibold">
                  {successCount} of {results.length} deployed
                </div>
                {failCount > 0 && <div className="text-sm text-red-500">{failCount} failed</div>}
              </div>
            </div>

            <Separator />

            {/* Links to deployed dashboards */}
            {results
              .filter((r) => r.dashboardUrl)
              .map((r) => (
                <a
                  key={r.domain}
                  href={r.dashboardUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {r.domain} Dashboard
                </a>
              ))}
          </div>
        )}

        {/* Metric view dependency modal (overlay) */}
        <MetricViewDependencyModal
          open={step === "mv-deps"}
          onOpenChange={(o) => {
            if (!o) setStep("configure");
          }}
          missing={missingMvs}
          defaultSchema={defaultMvSchema}
          onDeployed={(deployed: DeployedResult[]) => {
            const rewrites: Record<string, string> = {};
            for (const d of deployed) {
              if (d.fqn !== d.deployedFqn) {
                rewrites[d.fqn] = d.deployedFqn;
              }
              // Also rewrite bare name → deployed FQN
              const bareName = d.name.toLowerCase();
              const fqnLower = d.fqn.toLowerCase();
              if (bareName !== fqnLower && !rewrites[d.name]) {
                rewrites[d.name] = d.deployedFqn;
              }
            }
            setFqnRewrites(rewrites);
            handleDeploy(rewrites);
          }}
          onCancel={() => {
            setStep("configure");
          }}
        />

        <DialogFooter>
          {step === "configure" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={checkDepsAndDeploy} disabled={checkingDeps}>
                {checkingDeps ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Checking...
                  </>
                ) : (
                  <>
                    Deploy {recommendations.length} Dashboard
                    {recommendations.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            </>
          )}
          {step === "deploying" && (
            <Button disabled>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Deploying...
            </Button>
          )}
          {step === "done" && <Button onClick={handleClose}>Close</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

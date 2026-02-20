"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { CatalogBrowser } from "@/components/pipeline/catalog-browser";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Layers,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import type {
  GenieEngineRecommendation,
  MetricViewProposal,
  TrustedAssetFunction,
} from "@/lib/genie/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = "select" | "schema" | "deploying" | "done";

interface DeployableAsset {
  id: string;
  domain: string;
  name: string;
  type: "metric_view" | "function";
  ddl: string;
  description?: string;
  hasError: boolean;
}

interface AssetResult {
  name: string;
  type: "metric_view" | "function";
  success: boolean;
  error?: string;
  fqn?: string;
}

interface DomainResult {
  domain: string;
  assets: AssetResult[];
  spaceId?: string;
  spaceError?: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GenieDeployModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domains: GenieEngineRecommendation[];
  runId: string;
  onComplete: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMvProposals(rec: GenieEngineRecommendation): MetricViewProposal[] {
  if (!rec.metricViewProposals) return [];
  try {
    return JSON.parse(rec.metricViewProposals) as MetricViewProposal[];
  } catch {
    return [];
  }
}

function parseTrustedFunctions(rec: GenieEngineRecommendation): TrustedAssetFunction[] {
  if (!rec.trustedFunctions) return [];
  try {
    return JSON.parse(rec.trustedFunctions) as TrustedAssetFunction[];
  } catch {
    return [];
  }
}

function extractDefaultSchema(tables: string[]): string {
  if (tables.length === 0) return "";
  const parts = tables[0].split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenieDeployModal({
  open,
  onOpenChange,
  domains,
  runId,
  onComplete,
}: GenieDeployModalProps) {
  const [step, setStep] = useState<Step>("select");
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [targetSchema, setTargetSchema] = useState<string[]>([]);
  const [results, setResults] = useState<DomainResult[]>([]);
  const [deployLog, setDeployLog] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Build all deployable assets from the selected domains
  const allAssets = useMemo<DeployableAsset[]>(() => {
    const assets: DeployableAsset[] = [];
    for (const rec of domains) {
      const mvs = parseMvProposals(rec);
      for (const mv of mvs) {
        assets.push({
          id: `mv:${rec.domain}:${mv.name}`,
          domain: rec.domain,
          name: mv.name,
          type: "metric_view",
          ddl: mv.ddl,
          description: mv.description,
          hasError: mv.validationStatus === "error",
        });
      }
      const fns = parseTrustedFunctions(rec);
      for (const fn of fns) {
        if (fn.ddl) {
          assets.push({
            id: `fn:${rec.domain}:${fn.name}`,
            domain: rec.domain,
            name: fn.name,
            type: "function",
            ddl: fn.ddl,
            description: fn.description,
            hasError: false,
          });
        }
      }
    }
    return assets;
  }, [domains]);

  // Default schema from first domain's tables
  const defaultSchema = useMemo(
    () => extractDefaultSchema(domains[0]?.tables ?? []),
    [domains]
  );

  const initializeModal = useCallback(() => {
    setStep("select");
    setResults([]);
    setDeployLog([]);
    const initial = new Set(
      allAssets.filter((a) => !a.hasError).map((a) => a.id)
    );
    setSelectedAssets(initial);
    setTargetSchema(defaultSchema ? [defaultSchema] : []);
  }, [allAssets, defaultSchema]);

  // Auto-scroll deploy log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [deployLog]);

  const toggleAsset = useCallback((id: string) => {
    setSelectedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const eligible = allAssets.filter((a) => !a.hasError);
    const allChecked = eligible.every((a) => selectedAssets.has(a.id));
    if (allChecked) {
      setSelectedAssets(new Set());
    } else {
      setSelectedAssets(new Set(eligible.map((a) => a.id)));
    }
  }, [allAssets, selectedAssets]);

  // Schema selection -- single-select in CatalogBrowser "schema" mode
  const handleSchemaChange = useCallback((sources: string[]) => {
    // Keep only the most recently added schema (single-select)
    if (sources.length > 1) {
      setTargetSchema([sources[sources.length - 1]]);
    } else {
      setTargetSchema(sources);
    }
  }, []);

  // Group assets by domain for display
  const assetsByDomain = useMemo(() => {
    const map = new Map<string, DeployableAsset[]>();
    for (const a of allAssets) {
      const list = map.get(a.domain) ?? [];
      list.push(a);
      map.set(a.domain, list);
    }
    return map;
  }, [allAssets]);

  const hasAssets = allAssets.length > 0;
  const selectedCount = selectedAssets.size;
  const mvCount = allAssets.filter(
    (a) => a.type === "metric_view" && selectedAssets.has(a.id)
  ).length;
  const fnCount = allAssets.filter(
    (a) => a.type === "function" && selectedAssets.has(a.id)
  ).length;

  // -------------------------------------------------------------------------
  // Deploy execution
  // -------------------------------------------------------------------------

  async function executeDeploy() {
    setStep("deploying");
    setDeployLog([]);
    setResults([]);

    const schema = targetSchema[0] ?? defaultSchema;
    const log = (msg: string) =>
      setDeployLog((prev) => [...prev, msg]);

    log(`Target schema: ${schema}`);
    log(`Deploying ${domains.length} domain(s)...`);

    // Build request payload
    const domainPayloads = domains.map((rec) => {
      const selectedMvs = parseMvProposals(rec).filter((mv) =>
        selectedAssets.has(`mv:${rec.domain}:${mv.name}`)
      );
      const selectedFns = parseTrustedFunctions(rec).filter(
        (fn) => fn.ddl && selectedAssets.has(`fn:${rec.domain}:${fn.name}`)
      );

      return {
        domain: rec.domain,
        title: rec.title,
        description: rec.description,
        serializedSpace: rec.serializedSpace,
        metricViews: selectedMvs.map((mv) => ({
          name: mv.name,
          ddl: mv.ddl,
          description: mv.description,
        })),
        functions: selectedFns.map((fn) => ({
          name: fn.name,
          ddl: fn.ddl,
        })),
      };
    });

    if (domainPayloads.some((d) => d.metricViews.length > 0)) {
      log(
        `Creating ${domainPayloads.reduce((s, d) => s + d.metricViews.length, 0)} metric view(s)...`
      );
    }
    if (domainPayloads.some((d) => d.functions.length > 0)) {
      log(
        `Creating ${domainPayloads.reduce((s, d) => s + d.functions.length, 0)} function(s)...`
      );
    }

    try {
      const res = await fetch(`/api/runs/${runId}/genie-deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domains: domainPayloads,
          targetSchema: schema,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        log(`ERROR: ${data.error ?? "Deploy request failed"}`);
        setStep("done");
        return;
      }

      const data = (await res.json()) as { results: DomainResult[] };
      setResults(data.results);

      for (const dr of data.results) {
        for (const ar of dr.assets) {
          if (ar.success) {
            log(`  ${ar.type === "metric_view" ? "Metric view" : "Function"} "${ar.name}" created at ${ar.fqn}`);
          } else {
            log(`  ${ar.type === "metric_view" ? "Metric view" : "Function"} "${ar.name}" FAILED: ${ar.error}`);
          }
        }
        if (dr.spaceId) {
          log(`Genie space "${dr.domain}" deployed (${dr.spaceId})`);
        } else if (dr.spaceError) {
          log(`Genie space "${dr.domain}" FAILED: ${dr.spaceError}`);
        }
      }

      log("Done.");
    } catch (err) {
      log(`ERROR: ${err instanceof Error ? err.message : "Unknown error"}`);
    }

    setStep("done");
  }

  // -------------------------------------------------------------------------
  // Summary stats for done step
  // -------------------------------------------------------------------------

  const successSpaces = results.filter((r) => !!r.spaceId).length;
  const failedSpaces = results.filter((r) => !!r.spaceError).length;
  const successAssets = results.flatMap((r) => r.assets).filter((a) => a.success).length;
  const failedAssets = results.flatMap((r) => r.assets).filter((a) => !a.success).length;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (step === "deploying") return;
      if (o) initializeModal();
      if (!o && step === "done") onComplete();
      onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-violet-500" />
            Deploy Genie Spaces
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Select metric views and functions to deploy alongside your Genie spaces."}
            {step === "schema" && "Choose the target schema where metric views and functions will be created."}
            {step === "deploying" && "Deploying assets and creating Genie spaces..."}
            {step === "done" && "Deployment complete."}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground px-1">
          <StepIndicator label="1. Assets" active={step === "select"} done={step !== "select"} />
          <ChevronRight className="h-3 w-3" />
          <StepIndicator label="2. Schema" active={step === "schema"} done={step === "deploying" || step === "done"} />
          <ChevronRight className="h-3 w-3" />
          <StepIndicator label="3. Deploy" active={step === "deploying" || step === "done"} done={step === "done"} />
        </div>

        <Separator />

        {/* Step content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {step === "select" && (
            <SelectAssetsStep
              assetsByDomain={assetsByDomain}
              selectedAssets={selectedAssets}
              toggleAsset={toggleAsset}
              toggleAll={toggleAll}
              allAssets={allAssets}
              hasAssets={hasAssets}
            />
          )}

          {step === "schema" && (
            <SchemaStep
              targetSchema={targetSchema}
              onSchemaChange={handleSchemaChange}
              defaultSchema={defaultSchema}
            />
          )}

          {(step === "deploying" || step === "done") && (
            <DeployStep
              deployLog={deployLog}
              results={results}
              step={step}
              logEndRef={logEndRef}
            />
          )}
        </div>

        <Separator />

        <DialogFooter>
          {step === "select" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              {hasAssets ? (
                <Button onClick={() => setStep("schema")} disabled={selectedCount === 0 && hasAssets}>
                  Next: Choose Schema
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => {
                  setTargetSchema([defaultSchema]);
                  executeDeploy();
                }}>
                  Deploy Spaces (No Assets)
                  <Rocket className="ml-1 h-4 w-4" />
                </Button>
              )}
            </>
          )}

          {step === "schema" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                <ChevronLeft className="mr-1 h-4 w-4" />
                Back
              </Button>
              <div className="flex-1" />
              <div className="text-xs text-muted-foreground mr-2 self-center">
                {mvCount > 0 && `${mvCount} metric view${mvCount !== 1 ? "s" : ""}`}
                {mvCount > 0 && fnCount > 0 && ", "}
                {fnCount > 0 && `${fnCount} function${fnCount !== 1 ? "s" : ""}`}
                {" + "}
                {domains.length} space{domains.length !== 1 ? "s" : ""}
              </div>
              <Button
                onClick={executeDeploy}
                disabled={targetSchema.length === 0}
                className="bg-green-600 hover:bg-green-700"
              >
                <Rocket className="mr-1 h-4 w-4" />
                Deploy All
              </Button>
            </>
          )}

          {step === "deploying" && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Deploying...
            </Button>
          )}

          {step === "done" && (
            <>
              <div className="flex-1 text-xs">
                {successSpaces > 0 && (
                  <span className="text-green-600 mr-3">
                    {successSpaces} space{successSpaces !== 1 ? "s" : ""} deployed
                  </span>
                )}
                {failedSpaces > 0 && (
                  <span className="text-destructive mr-3">
                    {failedSpaces} space{failedSpaces !== 1 ? "s" : ""} failed
                  </span>
                )}
                {successAssets > 0 && (
                  <span className="text-green-600 mr-3">
                    {successAssets} asset{successAssets !== 1 ? "s" : ""} created
                  </span>
                )}
                {failedAssets > 0 && (
                  <span className="text-destructive">
                    {failedAssets} asset{failedAssets !== 1 ? "s" : ""} failed
                  </span>
                )}
              </div>
              <Button onClick={() => { onComplete(); onOpenChange(false); }}>
                Close
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Step indicator chip
// ---------------------------------------------------------------------------

function StepIndicator({
  label,
  active,
  done,
}: {
  label: string;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
        active
          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
          : done
            ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
            : "bg-muted text-muted-foreground"
      }`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Select Assets
// ---------------------------------------------------------------------------

function SelectAssetsStep({
  assetsByDomain,
  selectedAssets,
  toggleAsset,
  toggleAll,
  allAssets,
  hasAssets,
}: {
  assetsByDomain: Map<string, DeployableAsset[]>;
  selectedAssets: Set<string>;
  toggleAsset: (id: string) => void;
  toggleAll: () => void;
  allAssets: DeployableAsset[];
  hasAssets: boolean;
}) {
  if (!hasAssets) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Layers className="h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">
          No metric views or functions available to deploy.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          The Genie spaces will be created without additional assets.
        </p>
      </div>
    );
  }

  const eligible = allAssets.filter((a) => !a.hasError);
  const allChecked = eligible.length > 0 && eligible.every((a) => selectedAssets.has(a.id));

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allChecked}
            onCheckedChange={toggleAll}
          />
          <span className="text-xs font-medium">Select All</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {selectedAssets.size} of {eligible.length} selected
        </span>
      </div>

      {Array.from(assetsByDomain.entries()).map(([domain, assets]) => (
        <div key={domain} className="rounded-md border">
          <div className="bg-muted/30 px-3 py-1.5 text-xs font-medium">
            {domain}
          </div>
          <div className="divide-y">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center gap-3 px-3 py-2"
              >
                <Checkbox
                  checked={selectedAssets.has(asset.id)}
                  onCheckedChange={() => toggleAsset(asset.id)}
                  disabled={asset.hasError}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono truncate">
                      {asset.name}
                    </code>
                    <Badge
                      variant="outline"
                      className={`text-[9px] shrink-0 ${
                        asset.type === "metric_view"
                          ? "border-violet-500/50 text-violet-600"
                          : "border-blue-500/50 text-blue-600"
                      }`}
                    >
                      {asset.type === "metric_view" ? "Metric View" : "Function"}
                    </Badge>
                    {asset.hasError && (
                      <Badge variant="destructive" className="text-[9px] shrink-0">
                        <AlertTriangle className="mr-0.5 h-2.5 w-2.5" />
                        Validation Error
                      </Badge>
                    )}
                  </div>
                  {asset.description && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">
                      {asset.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Schema picker
// ---------------------------------------------------------------------------

function SchemaStep({
  targetSchema,
  onSchemaChange,
  defaultSchema,
}: {
  targetSchema: string[];
  onSchemaChange: (sources: string[]) => void;
  defaultSchema: string;
}) {
  return (
    <div className="space-y-3 py-2">
      <div className="px-1">
        <p className="text-xs text-muted-foreground">
          Choose the target schema where metric views and functions will be created.
          The Genie space will reference these assets from this schema.
        </p>
        {targetSchema.length > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <Layers className="h-3.5 w-3.5 text-violet-500" />
            <span className="text-sm font-medium text-violet-700 dark:text-violet-400">
              {targetSchema[0]}
            </span>
          </div>
        )}
      </div>

      <CatalogBrowser
        selectedSources={targetSchema}
        onSelectionChange={onSchemaChange}
        selectionMode="schema"
        defaultExpandPath={defaultSchema}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Deploy progress + results
// ---------------------------------------------------------------------------

function DeployStep({
  deployLog,
  results,
  step,
  logEndRef,
}: {
  deployLog: string[];
  results: DomainResult[];
  step: Step;
  logEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div className="space-y-3 py-2">
      {/* Log output */}
      <div className="rounded-md border bg-muted/20 p-3 max-h-48 overflow-y-auto font-mono text-[11px] leading-relaxed">
        {deployLog.map((line, i) => (
          <div
            key={i}
            className={
              line.includes("ERROR") || line.includes("FAILED")
                ? "text-destructive"
                : line.includes("deployed") || line.includes("created")
                  ? "text-green-600"
                  : "text-muted-foreground"
            }
          >
            {line}
          </div>
        ))}
        {step === "deploying" && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Processing...
          </div>
        )}
        <div ref={logEndRef} />
      </div>

      {/* Results summary */}
      {step === "done" && results.length > 0 && (
        <div className="space-y-2">
          {results.map((dr) => (
            <div key={dr.domain} className="rounded-md border p-3">
              <div className="flex items-center gap-2 mb-2">
                {dr.spaceId ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm font-medium">{dr.domain}</span>
                {dr.spaceId && (
                  <Badge className="bg-green-500/10 text-green-600 text-[9px]">
                    Deployed
                  </Badge>
                )}
                {dr.spaceError && (
                  <Badge variant="destructive" className="text-[9px]">
                    Failed
                  </Badge>
                )}
              </div>

              {dr.assets.length > 0 && (
                <div className="space-y-1 ml-6">
                  {dr.assets.map((ar, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {ar.success ? (
                        <CheckCircle2 className="h-3 w-3 text-green-600 shrink-0" />
                      ) : (
                        <XCircle className="h-3 w-3 text-destructive shrink-0" />
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[8px] shrink-0 ${
                          ar.type === "metric_view"
                            ? "border-violet-500/50 text-violet-600"
                            : "border-blue-500/50 text-blue-600"
                        }`}
                      >
                        {ar.type === "metric_view" ? "MV" : "Fn"}
                      </Badge>
                      <span className="font-mono truncate">{ar.name}</span>
                      {ar.error && (
                        <span className="text-[10px] text-destructive truncate">
                          {ar.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {dr.spaceError && (
                <p className="text-[10px] text-destructive mt-1 ml-6">
                  {dr.spaceError}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

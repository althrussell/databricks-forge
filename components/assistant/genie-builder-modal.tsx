"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { CatalogBrowser } from "@/components/pipeline/catalog-browser";
import {
  Loader2,
  Rocket,
  Sparkles,
  Check,
  ExternalLink,
  Table2,
  BarChart3,
  Link2,
  MessageSquare,
  FileText,
  AlertTriangle,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Zap,
} from "lucide-react";
import type {
  GenieSpaceRecommendation,
  SerializedSpace,
  MetricViewProposal,
} from "@/lib/genie/types";
import { loadSettings } from "@/lib/settings";
import type { TableEnrichmentData } from "./ask-forge-chat";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Phase = "generating" | "ready" | "deploying" | "deployed" | "error";

interface GenieBuilderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tables: string[];
  domain?: string;
  conversationSummary?: string;
  tableEnrichments?: TableEnrichmentData[];
  sqlBlocks?: string[];
}

function extractDefaultSchema(tables: string[]): string {
  if (tables.length === 0) return "";
  const parts = tables[0].split(".");
  if (parts.length >= 2) return `${parts[0]}.${parts[1]}`;
  return "";
}

function parseMetricViewProposals(rec: GenieSpaceRecommendation): MetricViewProposal[] {
  const raw = rec as unknown as Record<string, unknown>;
  if (typeof raw.metricViewProposals !== "string") return [];
  try {
    return JSON.parse(raw.metricViewProposals) as MetricViewProposal[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GenieBuilderModal({
  open,
  onOpenChange,
  tables,
  domain,
  conversationSummary,
}: GenieBuilderModalProps) {
  const [phase, setPhase] = useState<Phase>("generating");
  const [genMessage, setGenMessage] = useState("Building space from metadata...");
  const [genPercent, setGenPercent] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);

  const [recommendation, setRecommendation] = useState<GenieSpaceRecommendation | null>(null);
  const [parsedSpace, setParsedSpace] = useState<SerializedSpace | null>(null);
  const [resultMode, setResultMode] = useState<"fast" | "full">("fast");

  const [targetSchema, setTargetSchema] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [showSchemaSelector, setShowSchemaSelector] = useState(false);

  const [deployedSpaceId, setDeployedSpaceId] = useState<string | null>(null);
  const [databricksHost, setDatabricksHost] = useState("");

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const generationTriggered = useRef(false);

  const mvProposals = useMemo(
    () => (recommendation ? parseMetricViewProposals(recommendation) : []),
    [recommendation],
  );
  const hasMetricViews = mvProposals.filter((m) => m.validationStatus !== "error").length > 0;

  const defaultSchema = useMemo(() => extractDefaultSchema(tables), [tables]);

  // Fetch host for external links
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.host) setDatabricksHost(d.host.replace(/\/$/, ""));
      })
      .catch(() => {});
  }, []);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPhase("generating");
      setGenMessage("Building space from metadata...");
      setGenPercent(0);
      setGenError(null);
      setRecommendation(null);
      setParsedSpace(null);
      setResultMode("fast");
      setTargetSchema(defaultSchema ? [defaultSchema] : []);
      setShowDetails(false);
      setShowSchemaSelector(false);
      setDeployedSpaceId(null);
      generationTriggered.current = false;
    } else {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [open, defaultSchema]);

  const buildConfig = useCallback(
    (mode: "fast" | "full") => {
      const settings = loadSettings();
      const g = settings.genieEngineDefaults;
      return {
        title: undefined as string | undefined,
        description: undefined as string | undefined,
        domain: domain || undefined,
        llmRefinement: g.llmRefinement,
        autoTimePeriods: g.autoTimePeriods,
        generateTrustedAssets: g.generateTrustedAssets,
        generateBenchmarks: g.generateBenchmarks,
        generateMetricViews: g.generateMetricViews,
        globalInstructions: undefined as string | undefined,
        conversationSummary: conversationSummary || undefined,
        questionComplexity: settings.questionComplexity.adhocGenie,
        mode,
      };
    },
    [domain, conversationSummary],
  );

  const handleGenerationResult = useCallback(
    (rec: GenieSpaceRecommendation, mode: "fast" | "full") => {
      setRecommendation(rec);
      setResultMode(mode);
      try {
        setParsedSpace(JSON.parse(rec.serializedSpace));
      } catch {
        /* ignore */
      }
      setPhase("ready");
    },
    [],
  );

  const runFastGeneration = useCallback(async () => {
    setPhase("generating");
    setGenMessage("Building space from metadata...");
    setGenPercent(50);
    setGenError(null);

    try {
      const res = await fetch("/api/genie-spaces/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables, config: buildConfig("fast") }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to generate");
      }
      const data = await res.json();
      if (data.status === "completed" && data.result) {
        handleGenerationResult(data.result.recommendation, "fast");
      } else {
        throw new Error(data.error || "Unexpected response");
      }
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  }, [tables, buildConfig, handleGenerationResult]);

  const runFullGeneration = useCallback(async () => {
    setPhase("generating");
    setGenMessage("Starting full Genie Engine...");
    setGenPercent(0);
    setGenError(null);

    try {
      const res = await fetch("/api/genie-spaces/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables, config: buildConfig("full") }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start generation");
      }
      const { jobId } = await res.json();

      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/genie-spaces/generate?jobId=${jobId}`);
          if (!pollRes.ok) return;
          const data = await pollRes.json();
          setGenMessage(data.message ?? "");
          setGenPercent(data.percent ?? 0);

          if (data.status === "completed" && data.result) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            handleGenerationResult(data.result.recommendation, "full");
          } else if (data.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setGenError(data.error ?? "Generation failed");
            setPhase("error");
          }
        } catch {
          /* polling error, retry */
        }
      }, 2000);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Unknown error");
      setPhase("error");
    }
  }, [tables, buildConfig, handleGenerationResult]);

  // Auto-trigger fast generation on open
  useEffect(() => {
    if (open && !generationTriggered.current && tables.length > 0) {
      generationTriggered.current = true;
      runFastGeneration();
    }
  }, [open, tables, runFastGeneration]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleSchemaChange = useCallback((sources: string[]) => {
    if (sources.length > 1) {
      setTargetSchema([sources[sources.length - 1]]);
    } else {
      setTargetSchema(sources);
    }
  }, []);

  const handleDeploy = async () => {
    if (!recommendation) return;
    if (
      recommendation.quality?.gateDecision === "warn" &&
      !window.confirm("This space has quality warnings. Deploy anyway?")
    )
      return;
    setPhase("deploying");

    try {
      const settings = loadSettings();
      const deployTitle = recommendation.title;

      const mvPayload =
        hasMetricViews && targetSchema.length > 0
          ? mvProposals
              .filter((m) => m.validationStatus !== "error")
              .map((m) => ({ name: m.name, ddl: m.ddl, description: m.description }))
          : [];

      const res = await fetch("/api/genie-spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deployTitle,
          description: recommendation.description,
          serializedSpace: recommendation.serializedSpace,
          domain: recommendation.domain,
          quality: recommendation.quality,
          authMode: settings.genieDeployAuthMode,
          targetSchema: targetSchema[0] || defaultSchema || undefined,
          metricViews: mvPayload.length > 0 ? mvPayload : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Deployment failed");
      }

      const result = await res.json();
      setDeployedSpaceId(result.spaceId);
      setPhase("deployed");

      fetch("/api/embeddings/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "genie" }),
      }).catch(() => {});
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Deployment failed");
      setPhase("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            {phase === "deployed"
              ? "Genie Space Deployed"
              : phase === "deploying"
                ? "Deploying..."
                : "Create Genie Space"}
          </DialogTitle>
          <DialogDescription>
            {phase === "generating"
              ? `Building from ${tables.length} table${tables.length !== 1 ? "s" : ""}...`
              : phase === "ready"
                ? "Review your space and deploy to Databricks."
                : phase === "deploying"
                  ? "Creating your Genie Space in Databricks..."
                  : phase === "deployed"
                    ? "Your Genie Space is live and ready for queries."
                    : "Something went wrong."}
          </DialogDescription>
        </DialogHeader>

        {/* Generating phase */}
        {phase === "generating" && (
          <div className="space-y-4 py-4">
            <Progress value={genPercent} className="h-2" />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {genMessage}
            </div>
          </div>
        )}

        {/* Error phase */}
        {phase === "error" && (
          <div className="space-y-4 py-4">
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-destructive">
                <AlertTriangle className="size-4" />
                {genError || "An error occurred"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={runFastGeneration}>
                <RefreshCw className="mr-2 size-3.5" />
                Retry Quick Build
              </Button>
              <Button variant="outline" size="sm" onClick={runFullGeneration}>
                <Sparkles className="mr-2 size-3.5" />
                Try Full Engine
              </Button>
            </div>
          </div>
        )}

        {/* Ready phase -- space summary */}
        {phase === "ready" && recommendation && parsedSpace && (
          <div className="space-y-4 py-2">
            {/* Mode badge */}
            <div className="flex items-center gap-2">
              {resultMode === "fast" ? (
                <Badge variant="outline" className="gap-1 text-amber-600 dark:text-amber-400">
                  <Zap className="size-3" />
                  Quick Build
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-green-600 dark:text-green-400">
                  <Sparkles className="size-3" />
                  Full Engine
                </Badge>
              )}
              {recommendation.quality && (
                <Badge variant="secondary" className="text-xs">
                  Quality: {recommendation.quality.score}
                </Badge>
              )}
            </div>

            {/* Title + description */}
            <div>
              <h3 className="text-sm font-semibold">{recommendation.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{recommendation.description}</p>
            </div>

            {/* Stat row */}
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
              <StatItem icon={Table2} label="Tables" value={recommendation.tableCount} />
              <StatItem icon={BarChart3} label="Measures" value={recommendation.measureCount} />
              <StatItem icon={Link2} label="Filters" value={recommendation.filterCount} />
              <StatItem
                icon={MessageSquare}
                label="Dimensions"
                value={recommendation.dimensionCount}
              />
              <StatItem
                icon={FileText}
                label="Instructions"
                value={recommendation.instructionCount}
              />
              <StatItem icon={Link2} label="Joins" value={recommendation.joinCount} />
              <StatItem
                icon={MessageSquare}
                label="Questions"
                value={recommendation.sampleQuestionCount}
              />
            </div>

            {/* Quality warnings */}
            {recommendation.quality && recommendation.quality.degradedReasons.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-900/60 dark:bg-amber-950/30">
                <div className="flex items-center gap-2 text-xs font-medium">
                  <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
                  Quality warnings
                </div>
                <ul className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
                  {recommendation.quality.degradedReasons.map((reason) => (
                    <li key={reason}>- {reason.replace(/_/g, " ")}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Collapsible details */}
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              {showDetails ? (
                <ChevronDown className="size-3.5" />
              ) : (
                <ChevronRight className="size-3.5" />
              )}
              Details
            </button>
            {showDetails && (
              <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-xs">
                {/* Tables */}
                {parsedSpace.data_sources.tables.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">
                      Tables ({parsedSpace.data_sources.tables.length})
                    </p>
                    <div className="space-y-0.5">
                      {parsedSpace.data_sources.tables.map((t) => (
                        <div
                          key={t.identifier}
                          className="flex items-center gap-1.5 font-mono text-[11px]"
                        >
                          <Table2 className="size-3 text-muted-foreground" />
                          {t.identifier}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Joins */}
                {parsedSpace.instructions.join_specs.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">
                      Joins ({parsedSpace.instructions.join_specs.length})
                    </p>
                    <div className="space-y-0.5">
                      {parsedSpace.instructions.join_specs.map((j) => (
                        <div key={j.id} className="font-mono text-[11px]">
                          {j.left.identifier} ↔ {j.right.identifier}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sample questions */}
                {parsedSpace.config.sample_questions.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">
                      Sample Questions ({parsedSpace.config.sample_questions.length})
                    </p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {parsedSpace.config.sample_questions.map((q) => (
                        <li key={q.id}>{q.question.join(" ")}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Example SQL */}
                {parsedSpace.instructions.example_question_sqls.length > 0 && (
                  <div>
                    <p className="mb-1 font-medium">
                      Example SQL ({parsedSpace.instructions.example_question_sqls.length})
                    </p>
                    <div className="space-y-1.5">
                      {parsedSpace.instructions.example_question_sqls.slice(0, 4).map((q) => (
                        <div key={q.id} className="rounded border bg-muted/50 p-1.5">
                          <div className="font-medium">{q.question.join(" ")}</div>
                          <code className="mt-0.5 block whitespace-pre-wrap text-[10px] text-muted-foreground">
                            {q.sql.join("\n")}
                          </code>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metric view schema selector */}
            {hasMetricViews && loadSettings().genieEngineDefaults.generateMetricViews && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-medium">
                        Metric Views (
                        {mvProposals.filter((m) => m.validationStatus !== "error").length})
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Choose a target schema for metric view deployment.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setShowSchemaSelector(!showSchemaSelector)}
                    >
                      {targetSchema[0] || defaultSchema || "Select schema"}
                    </Button>
                  </div>
                  {showSchemaSelector && (
                    <div className="max-h-48 overflow-y-auto rounded-md border">
                      <CatalogBrowser
                        selectedSources={targetSchema}
                        onSelectionChange={handleSchemaChange}
                        selectionMode="schema"
                        defaultExpandPath={defaultSchema}
                      />
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Deploying phase */}
        {phase === "deploying" && (
          <div className="flex items-center gap-3 py-8">
            <Loader2 className="size-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">
              Creating Genie Space in Databricks...
            </span>
          </div>
        )}

        {/* Deployed phase */}
        {phase === "deployed" && deployedSpaceId && (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-medium">
                  {recommendation?.title ?? "Genie Space"} is live
                </p>
                <p className="text-xs text-muted-foreground">Ready for natural language queries.</p>
              </div>
            </div>
            {databricksHost && (
              <Button asChild className="w-full">
                <a
                  href={`${databricksHost}/genie/rooms/${deployedSpaceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="mr-2 size-4" />
                  Open in Databricks
                </a>
              </Button>
            )}
          </div>
        )}

        {/* Footer actions */}
        {phase === "ready" && recommendation && (
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {resultMode === "fast" && (
              <Button variant="outline" size="sm" onClick={runFullGeneration} className="gap-1.5">
                <RefreshCw className="size-3.5" />
                Enhance with Full Engine
              </Button>
            )}
            <Button
              onClick={handleDeploy}
              variant={recommendation.quality?.gateDecision === "warn" ? "outline" : "default"}
              className={`gap-1.5 ${recommendation.quality?.gateDecision === "warn" ? "border-amber-500 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/30" : ""}`}
            >
              <Rocket className="size-3.5" />
              {recommendation.quality?.gateDecision === "warn"
                ? "Deploy with Warnings"
                : "Deploy to Databricks"}
            </Button>
          </DialogFooter>
        )}

        {phase === "deployed" && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function StatItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  if (value === 0) return null;
  return (
    <div className="flex items-center gap-1">
      <Icon className="size-3" />
      <span>
        {value} {label}
      </span>
    </div>
  );
}

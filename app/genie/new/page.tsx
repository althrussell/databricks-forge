"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Loader2,
  Plus,
  Rocket,
  Sparkles,
  Table2,
  X,
  BarChart3,
  MessageSquare,
  Link2,
  FileText,
  Zap,
  RefreshCw,
} from "lucide-react";
import type {
  GenieSpaceRecommendation,
  SerializedSpace,
} from "@/lib/genie/types";
import { loadSettings } from "@/lib/settings";

type GenerationMode = "fast" | "full";

type WizardStep = "tables" | "config" | "generate" | "preview" | "deploy";

const STEPS: { id: WizardStep; label: string }[] = [
  { id: "tables", label: "Tables" },
  { id: "config", label: "Configure" },
  { id: "generate", label: "Generate" },
  { id: "preview", label: "Preview" },
  { id: "deploy", label: "Deploy" },
];

export default function NewGenieSpacePage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Step state
  const [step, setStep] = useState<WizardStep>("tables");

  // Table selection
  const [tables, setTables] = useState<string[]>([]);
  const [tableInput, setTableInput] = useState("");

  // Config
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [domain, setDomain] = useState("");
  const [llmRefinement, setLlmRefinement] = useState(true);
  const [autoTimePeriods, setAutoTimePeriods] = useState(true);
  const [generateTrustedAssets, setGenerateTrustedAssets] = useState(true);
  const [generateBenchmarks, setGenerateBenchmarks] = useState(true);
  const [generateMetricViews, setGenerateMetricViews] = useState(true);
  const [globalInstructions, setGlobalInstructions] = useState("");
  const [conversationSummary, setConversationSummary] = useState("");

  // Generation
  const [generationMode, setGenerationMode] = useState<GenerationMode>("fast");
  const [jobId, setJobId] = useState<string | null>(null);
  const [genStatus, setGenStatus] = useState<"idle" | "generating" | "completed" | "failed">("idle");
  const [genMessage, setGenMessage] = useState("");
  const [genPercent, setGenPercent] = useState(0);
  const [genError, setGenError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Result
  const [recommendation, setRecommendation] = useState<GenieSpaceRecommendation | null>(null);
  const [parsedSpace, setParsedSpace] = useState<SerializedSpace | null>(null);
  const [resultMode, setResultMode] = useState<GenerationMode>("fast");

  // Deploy
  const [deploying, setDeploying] = useState(false);
  const [deployedSpaceId, setDeployedSpaceId] = useState<string | null>(null);
  const [databricksHost, setDatabricksHost] = useState("");

  // Enhancing (running full engine on a fast result)
  const [enhancing, setEnhancing] = useState(false);

  // Load user settings as defaults + read query params from Ask Forge
  useEffect(() => {
    const settings = loadSettings();
    const g = settings.genieEngineDefaults;
    setLlmRefinement(g.llmRefinement);
    setAutoTimePeriods(g.autoTimePeriods);
    setGenerateBenchmarks(g.generateBenchmarks);
    setGenerateMetricViews(g.generateMetricViews);
    setGenerateTrustedAssets(g.generateTrustedAssets ?? true);

    const tablesParam = searchParams.get("tables");
    if (tablesParam) {
      const parsed = tablesParam.split(",").map((t) => t.trim()).filter(Boolean);
      if (parsed.length > 0) setTables(parsed);
    }
    const domainParam = searchParams.get("domain");
    if (domainParam) setDomain(domainParam);
    const contextParam = searchParams.get("context");
    if (contextParam) setConversationSummary(contextParam);
  }, [searchParams]);

  // Fetch host for external links
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.host) setDatabricksHost(d.host.replace(/\/$/, ""));
      })
      .catch(() => {});
  }, []);

  const addTable = useCallback(() => {
    const fqn = tableInput.trim();
    if (!fqn) return;
    if (fqn.split(".").length < 3) {
      toast.error("Table must be fully qualified: catalog.schema.table");
      return;
    }
    if (tables.includes(fqn)) {
      toast.error("Table already added");
      return;
    }
    setTables((prev) => [...prev, fqn]);
    setTableInput("");
  }, [tableInput, tables]);

  const removeTable = (fqn: string) => {
    setTables((prev) => prev.filter((t) => t !== fqn));
  };

  const buildConfig = (mode: GenerationMode) => ({
    title: title || undefined,
    description: description || undefined,
    domain: domain || undefined,
    llmRefinement,
    autoTimePeriods,
    generateTrustedAssets,
    generateBenchmarks,
    generateMetricViews,
    globalInstructions: globalInstructions || undefined,
    conversationSummary: conversationSummary || undefined,
    mode,
  });

  const handleFastGeneration = async () => {
    setGenerationMode("fast");
    setGenStatus("generating");
    setGenMessage("Building space from metadata...");
    setGenPercent(50);
    setGenError(null);
    setStep("generate");

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
        setGenStatus("completed");
        setRecommendation(data.result.recommendation);
        setResultMode("fast");
        try {
          setParsedSpace(JSON.parse(data.result.recommendation.serializedSpace));
        } catch { /* ignore parse error */ }
        setStep("preview");
      } else {
        throw new Error(data.error || "Unexpected response");
      }
    } catch (err) {
      setGenStatus("failed");
      setGenError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleFullGeneration = async () => {
    setGenerationMode("full");
    setGenStatus("generating");
    setGenMessage("Starting full Genie Engine...");
    setGenPercent(0);
    setGenError(null);
    setStep("generate");

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

      const { jobId: id } = await res.json();
      setJobId(id);

      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/genie-spaces/generate?jobId=${id}`);
          if (!pollRes.ok) return;
          const data = await pollRes.json();

          setGenMessage(data.message ?? "");
          setGenPercent(data.percent ?? 0);

          if (data.status === "completed" && data.result) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setGenStatus("completed");
            setRecommendation(data.result.recommendation);
            setResultMode("full");
            try {
              setParsedSpace(JSON.parse(data.result.recommendation.serializedSpace));
            } catch { /* ignore parse error */ }
            setStep("preview");
          } else if (data.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setGenStatus("failed");
            setGenError(data.error ?? "Generation failed");
          }
        } catch { /* polling error, retry */ }
      }, 2000);
    } catch (err) {
      setGenStatus("failed");
      setGenError(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const handleEnhance = async () => {
    setEnhancing(true);
    setGenerationMode("full");
    setGenStatus("generating");
    setGenMessage("Running full Genie Engine...");
    setGenPercent(0);
    setGenError(null);
    setStep("generate");

    try {
      const res = await fetch("/api/genie-spaces/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tables, config: buildConfig("full") }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to start enhancement");
      }

      const { jobId: id } = await res.json();
      setJobId(id);

      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch(`/api/genie-spaces/generate?jobId=${id}`);
          if (!pollRes.ok) return;
          const data = await pollRes.json();

          setGenMessage(data.message ?? "");
          setGenPercent(data.percent ?? 0);

          if (data.status === "completed" && data.result) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setGenStatus("completed");
            setRecommendation(data.result.recommendation);
            setResultMode("full");
            try {
              setParsedSpace(JSON.parse(data.result.recommendation.serializedSpace));
            } catch { /* ignore parse error */ }
            setStep("preview");
            setEnhancing(false);
            toast.success("Space enhanced with full Genie Engine!");
          } else if (data.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setGenStatus("failed");
            setGenError(data.error ?? "Enhancement failed");
            setEnhancing(false);
          }
        } catch { /* polling error, retry */ }
      }, 2000);
    } catch (err) {
      setGenStatus("failed");
      setGenError(err instanceof Error ? err.message : "Unknown error");
      setEnhancing(false);
    }
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleDeploy = async () => {
    if (!recommendation) return;
    setDeploying(true);

    try {
      const deployTitle = title || recommendation.title;
      const res = await fetch("/api/genie-spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: deployTitle,
          description: description || recommendation.description,
          serializedSpace: recommendation.serializedSpace,
          domain: recommendation.domain,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Deployment failed");
      }

      const result = await res.json();
      setDeployedSpaceId(result.spaceId);
      setStep("deploy");
      toast.success("Genie Space deployed successfully!");

      fetch("/api/embeddings/backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "genie" }),
      }).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setDeploying(false);
    }
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild className="shrink-0">
          <Link href="/genie">
            <ArrowLeft className="size-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Genie Space</h1>
          <p className="text-sm text-muted-foreground">
            Build a Genie Space from your data tables with AI-powered configuration.
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <div
              className={`flex size-7 items-center justify-center rounded-full text-xs font-medium ${
                i < currentStepIndex
                  ? "bg-primary text-primary-foreground"
                  : i === currentStepIndex
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i < currentStepIndex ? <Check className="size-3.5" /> : i + 1}
            </div>
            <span
              className={`text-sm ${
                i === currentStepIndex ? "font-medium" : "text-muted-foreground"
              }`}
            >
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div className="mx-1 h-px w-8 bg-border" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Table Selection */}
      {step === "tables" && (
        <Card>
          <CardHeader>
            <CardTitle>Select Tables</CardTitle>
            <CardDescription>
              Add the fully qualified table names (catalog.schema.table) for your Genie Space.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="catalog.schema.table"
                value={tableInput}
                onChange={(e) => setTableInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTable();
                  }
                }}
              />
              <Button onClick={addTable} variant="secondary">
                <Plus className="mr-2 size-4" />
                Add
              </Button>
            </div>

            {tables.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">
                  {tables.length} table{tables.length !== 1 ? "s" : ""} selected
                </Label>
                <div className="flex flex-wrap gap-2">
                  {tables.map((fqn) => (
                    <Badge
                      key={fqn}
                      variant="secondary"
                      className="gap-1 py-1 pr-1 font-mono text-xs"
                    >
                      <Table2 className="size-3" />
                      {fqn}
                      <button
                        onClick={() => removeTable(fqn)}
                        className="ml-1 rounded-sm p-0.5 hover:bg-muted"
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-4">
              <Button
                onClick={() => setStep("config")}
                disabled={tables.length === 0}
              >
                Next
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Configuration */}
      {step === "config" && (
        <Card>
          <CardHeader>
            <CardTitle>Configure</CardTitle>
            <CardDescription>
              Optionally customize the space title, domain, and generation settings.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Space Title</Label>
                <Input
                  id="title"
                  placeholder="Auto-generated if empty"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="domain">Domain</Label>
                <Input
                  id="domain"
                  placeholder="Auto-detected from schema"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Auto-generated if empty"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id="llmRefinement"
                  checked={llmRefinement}
                  onCheckedChange={(v) => setLlmRefinement(v === true)}
                />
                <div>
                  <Label htmlFor="llmRefinement">LLM Refinement</Label>
                  <p className="text-xs text-muted-foreground">
                    Use AI to enrich columns, generate measures, and infer joins.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="autoTimePeriods"
                  checked={autoTimePeriods}
                  onCheckedChange={(v) => setAutoTimePeriods(v === true)}
                />
                <div>
                  <Label htmlFor="autoTimePeriods">Auto Time Periods</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate date filters and dimensions from date columns.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="generateTrustedAssets"
                  checked={generateTrustedAssets}
                  onCheckedChange={(v) => setGenerateTrustedAssets(v === true)}
                />
                <div>
                  <Label htmlFor="generateTrustedAssets">Trusted Assets</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate parameterised example SQL queries that teach Genie your schema vocabulary.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="generateBenchmarks"
                  checked={generateBenchmarks}
                  onCheckedChange={(v) => setGenerateBenchmarks(v === true)}
                />
                <div>
                  <Label htmlFor="generateBenchmarks">Benchmarks</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate benchmark questions with expected SQL for quality testing.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox
                  id="generateMetricViews"
                  checked={generateMetricViews}
                  onCheckedChange={(v) => setGenerateMetricViews(v === true)}
                />
                <div>
                  <Label htmlFor="generateMetricViews">Metric Views</Label>
                  <p className="text-xs text-muted-foreground">
                    Propose metric view definitions (YAML + DDL) for governed business metrics.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="instructions">Global Instructions</Label>
              <Textarea
                id="instructions"
                placeholder="Additional instructions for the Genie Space (optional)"
                value={globalInstructions}
                onChange={(e) => setGlobalInstructions(e.target.value)}
                rows={3}
              />
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep("tables")}>
                <ArrowLeft className="mr-2 size-4" />
                Back
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleFullGeneration}>
                  <Sparkles className="mr-2 size-4" />
                  Full Engine
                </Button>
                <Button onClick={handleFastGeneration}>
                  <Zap className="mr-2 size-4" />
                  Quick Build
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Generating */}
      {step === "generate" && (
        <Card>
          <CardHeader>
            <CardTitle>
              {genStatus === "generating"
                ? generationMode === "fast"
                  ? "Building Genie Space..."
                  : enhancing
                    ? "Enhancing with Genie Engine..."
                    : "Running Full Genie Engine..."
                : genStatus === "failed"
                  ? "Generation Failed"
                  : "Generation Complete"}
            </CardTitle>
            <CardDescription>
              {genStatus === "generating"
                ? generationMode === "fast"
                  ? "Analysing schema metadata — this only takes a few seconds."
                  : "Running AI-powered analysis on your tables. This may take 1–3 minutes."
                : genStatus === "failed"
                  ? genError
                  : "Your Genie Space is ready for review."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {genStatus === "generating" && (
              <>
                <Progress value={genPercent} className="h-2" />
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {genMessage}
                </div>
              </>
            )}
            {genStatus === "failed" && (
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep("config")}>
                  <ArrowLeft className="mr-2 size-4" />
                  Back to Config
                </Button>
                <Button onClick={generationMode === "fast" ? handleFastGeneration : handleFullGeneration}>
                  Retry
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Preview */}
      {step === "preview" && recommendation && parsedSpace && (
        <div className="space-y-4">
          {/* Fast mode enhancement banner */}
          {resultMode === "fast" && (
            <Card className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20">
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <Zap className="size-5 text-amber-600 dark:text-amber-400" />
                  <div>
                    <p className="text-sm font-medium">Quick Build</p>
                    <p className="text-xs text-muted-foreground">
                      Built from schema metadata. Enhance with AI for richer measures, trusted assets, and benchmarks.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEnhance}
                  disabled={enhancing}
                >
                  {enhancing ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 size-4" />
                  )}
                  Enhance with Genie Engine
                </Button>
              </CardContent>
            </Card>
          )}

          {resultMode === "full" && (
            <Card className="border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-950/20">
              <CardContent className="flex items-center gap-3 py-3">
                <Sparkles className="size-5 text-green-600 dark:text-green-400" />
                <div>
                  <p className="text-sm font-medium">Full Engine</p>
                  <p className="text-xs text-muted-foreground">
                    AI-enhanced with trusted assets, benchmarks, and semantic expressions.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{recommendation.title}</CardTitle>
              <CardDescription>{recommendation.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <StatItem icon={Table2} label="Tables" value={recommendation.tableCount} />
                <StatItem icon={BarChart3} label="Measures" value={recommendation.measureCount} />
                <StatItem icon={Link2} label="Filters" value={recommendation.filterCount} />
                <StatItem icon={MessageSquare} label="Dimensions" value={recommendation.dimensionCount} />
                <StatItem icon={FileText} label="Instructions" value={recommendation.instructionCount} />
                <StatItem icon={Link2} label="Joins" value={recommendation.joinCount} />
                <StatItem icon={MessageSquare} label="Sample Questions" value={recommendation.sampleQuestionCount} />
              </div>
            </CardContent>
          </Card>

          {/* Space detail accordion */}
          <Accordion type="multiple" className="space-y-2">
            <AccordionItem value="tables" className="rounded-lg border px-4">
              <AccordionTrigger className="text-sm font-medium">
                Tables ({parsedSpace.data_sources.tables.length})
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-1">
                  {parsedSpace.data_sources.tables.map((t) => (
                    <div key={t.identifier} className="flex items-center gap-2 text-xs">
                      <Table2 className="size-3 text-muted-foreground" />
                      <span className="font-mono">{t.identifier}</span>
                      {t.description && t.description.length > 0 && (
                        <span className="text-muted-foreground">
                          — {t.description[0]}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>

            {parsedSpace.instructions.sql_snippets.measures.length > 0 && (
              <AccordionItem value="measures" className="rounded-lg border px-4">
                <AccordionTrigger className="text-sm font-medium">
                  Measures ({parsedSpace.instructions.sql_snippets.measures.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {parsedSpace.instructions.sql_snippets.measures.map((m) => (
                      <div key={m.id} className="text-xs">
                        <span className="font-medium">{m.alias}</span>
                        <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {m.sql.join(" ")}
                        </code>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {parsedSpace.instructions.sql_snippets.filters.length > 0 && (
              <AccordionItem value="filters" className="rounded-lg border px-4">
                <AccordionTrigger className="text-sm font-medium">
                  Filters ({parsedSpace.instructions.sql_snippets.filters.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {parsedSpace.instructions.sql_snippets.filters.map((f) => (
                      <div key={f.id} className="text-xs">
                        <span className="font-medium">{f.display_name}</span>
                        <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {f.sql.join(" ")}
                        </code>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {parsedSpace.instructions.sql_snippets.expressions.length > 0 && (
              <AccordionItem value="dimensions" className="rounded-lg border px-4">
                <AccordionTrigger className="text-sm font-medium">
                  Dimensions ({parsedSpace.instructions.sql_snippets.expressions.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {parsedSpace.instructions.sql_snippets.expressions.map((e) => (
                      <div key={e.id} className="text-xs">
                        <span className="font-medium">{e.alias}</span>
                        <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {e.sql.join(" ")}
                        </code>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {parsedSpace.instructions.join_specs.length > 0 && (
              <AccordionItem value="joins" className="rounded-lg border px-4">
                <AccordionTrigger className="text-sm font-medium">
                  Joins ({parsedSpace.instructions.join_specs.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {parsedSpace.instructions.join_specs.map((j) => (
                      <div key={j.id} className="text-xs">
                        <span className="font-mono">{j.left.identifier}</span>
                        <span className="mx-1 text-muted-foreground">↔</span>
                        <span className="font-mono">{j.right.identifier}</span>
                        <code className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                          {j.sql.join(" ")}
                        </code>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {parsedSpace.instructions.text_instructions.length > 0 && (
              <AccordionItem value="instructions" className="rounded-lg border px-4">
                <AccordionTrigger className="text-sm font-medium">
                  Instructions ({parsedSpace.instructions.text_instructions.length})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-2">
                    {parsedSpace.instructions.text_instructions.map((inst) => (
                      <div key={inst.id} className="whitespace-pre-wrap text-xs text-muted-foreground">
                        {inst.content.join("\n")}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {parsedSpace.config.sample_questions.length > 0 && (
              <AccordionItem value="questions" className="rounded-lg border px-4">
                <AccordionTrigger className="text-sm font-medium">
                  Sample Questions ({parsedSpace.config.sample_questions.length})
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {parsedSpace.config.sample_questions.map((q) => (
                      <li key={q.id} className="text-xs text-muted-foreground">
                        {q.question.join(" ")}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>

          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={() => setStep("config")}>
              <ArrowLeft className="mr-2 size-4" />
              Back to Config
            </Button>
            <Button onClick={handleDeploy} disabled={deploying}>
              {deploying ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Rocket className="mr-2 size-4" />
              )}
              Deploy to Databricks
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Deployed */}
      {step === "deploy" && deployedSpaceId && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                <Check className="size-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <CardTitle>Genie Space Deployed</CardTitle>
                <CardDescription>
                  Your Genie Space is live and ready for natural language queries.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {databricksHost && (
                <Button asChild>
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
              <Button variant="outline" asChild>
                <Link href="/genie">View All Spaces</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/ask-forge">
                  <Sparkles className="mr-2 size-4" />
                  Back to Ask Forge
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-3.5" />
      <span>
        {value} {label}
      </span>
    </div>
  );
}

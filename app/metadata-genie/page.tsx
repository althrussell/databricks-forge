"use client";

/**
 * Meta Data Genie page.
 *
 * Multi-step flow: probe -> configure -> generate -> preview -> deploy views -> deploy space.
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Database,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Trash2,
  RefreshCw,
  Sparkles,
  Eye,
  Rocket,
  AlertTriangle,
} from "lucide-react";
import type {
  MetadataGenieSpace,
  ProbeResult,
} from "@/lib/metadata-genie/types";

// ---------------------------------------------------------------------------
// Types for the flow
// ---------------------------------------------------------------------------

type Step =
  | "landing"
  | "probing"
  | "configure"
  | "generating"
  | "preview"
  | "deploying-views"
  | "deploying-space";

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MetadataGeniePage() {
  const [step, setStep] = useState<Step>("landing");
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [existingSpaces, setExistingSpaces] = useState<MetadataGenieSpace[]>(
    []
  );
  const [space, setSpace] = useState<MetadataGenieSpace | null>(null);

  // Config state
  const [catalogScope, setCatalogScope] = useState<string[]>([]);
  const [viewCatalog, setViewCatalog] = useState("");
  const [viewSchema, setViewSchema] = useState("forge_metadata");
  const [title, setTitle] = useState("Meta Data Genie");

  // Deploy state
  const [viewDeployResults, setViewDeployResults] = useState<
    { view: string; success: boolean; error?: string }[] | null
  >(null);

  // Load existing spaces on mount
  useEffect(() => {
    fetchExistingSpaces();
  }, []);

  const fetchExistingSpaces = async () => {
    try {
      const res = await fetch("/api/metadata-genie");
      if (res.ok) {
        const data = await res.json();
        const active = (data.spaces ?? []).filter(
          (s: MetadataGenieSpace) => s.status !== "trashed"
        );
        setExistingSpaces(active);
        if (active.length > 0) {
          setSpace(active[0]);
        }
      }
    } catch {
      // ignore
    }
  };

  // -------------------------------------------------------------------
  // Probe
  // -------------------------------------------------------------------

  const handleProbe = useCallback(async () => {
    setStep("probing");
    try {
      const res = await fetch("/api/metadata-genie/probe");
      const data: ProbeResult = await res.json();
      setProbeResult(data);
      if (data.accessible && data.catalogs?.length) {
        setViewCatalog(data.catalogs[0]);
      }
      setStep(data.accessible ? "configure" : "landing");
      if (!data.accessible) {
        toast.error("Access denied", {
          description: data.error ?? "Cannot access system.information_schema",
        });
      }
    } catch {
      setStep("landing");
      toast.error("Probe failed");
    }
  }, []);

  // -------------------------------------------------------------------
  // Generate
  // -------------------------------------------------------------------

  const handleGenerate = useCallback(async () => {
    if (!viewCatalog || !viewSchema) {
      toast.error("Please select a catalog and schema for view deployment");
      return;
    }

    setStep("generating");
    try {
      const res = await fetch("/api/metadata-genie/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          catalogScope: catalogScope.length > 0 ? catalogScope : undefined,
          viewTarget: { catalog: viewCatalog, schema: viewSchema },
          title,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Generation failed");
      }

      const data: MetadataGenieSpace = await res.json();
      setSpace(data);
      setStep("preview");
      toast.success("Space generated", {
        description: data.industryName
          ? `Detected: ${data.industryName}`
          : "Ready for deployment",
      });
    } catch (err) {
      setStep("configure");
      toast.error(err instanceof Error ? err.message : "Generation failed");
    }
  }, [catalogScope, viewCatalog, viewSchema, title]);

  // -------------------------------------------------------------------
  // Deploy Views
  // -------------------------------------------------------------------

  const handleDeployViews = useCallback(async () => {
    if (!space) return;
    setStep("deploying-views");
    try {
      const res = await fetch("/api/metadata-genie/deploy-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: space.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "View deployment failed");
      }

      const data = await res.json();
      setViewDeployResults(data.results);
      setSpace((prev) =>
        prev
          ? {
              ...prev,
              viewsDeployed: true,
              viewNames: data.viewFqns,
              status: "views_deployed",
            }
          : null
      );
      toast.success("Views deployed", {
        description: `${data.results.filter((r: { success: boolean }) => r.success).length} of ${data.results.length} views created`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "View deployment failed");
    } finally {
      setStep("preview");
    }
  }, [space]);

  // -------------------------------------------------------------------
  // Deploy Space
  // -------------------------------------------------------------------

  const handleDeploySpace = useCallback(async () => {
    if (!space) return;
    setStep("deploying-space");
    try {
      const res = await fetch("/api/metadata-genie/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: space.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Space deployment failed");
      }

      const data = await res.json();
      setSpace((prev) =>
        prev
          ? {
              ...prev,
              spaceId: data.spaceId,
              spaceUrl: data.spaceUrl,
              status: "deployed",
            }
          : null
      );
      toast.success("Genie Space deployed!", {
        description: "Your Meta Data Genie is ready to use",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Deployment failed");
    } finally {
      setStep("preview");
    }
  }, [space]);

  // -------------------------------------------------------------------
  // Trash
  // -------------------------------------------------------------------

  const handleTrash = useCallback(async () => {
    if (!space) return;
    try {
      const res = await fetch("/api/metadata-genie", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: space.id, dropViews: true }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Trash failed");
      }

      setSpace(null);
      setExistingSpaces([]);
      setStep("landing");
      setViewDeployResults(null);
      toast.success("Space trashed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Trash failed");
    }
  }, [space]);

  // -------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------

  const isLoading =
    step === "probing" ||
    step === "generating" ||
    step === "deploying-views" ||
    step === "deploying-space";

  // If there's an existing space, skip to preview
  const activeSpace =
    space && space.status !== "trashed" ? space : null;

  // -------------------------------------------------------------------
  // RENDER
  // -------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Meta Data Genie
          </h1>
          <p className="mt-1 text-muted-foreground">
            Ask natural language questions about your data estate using a
            Databricks Genie Space backed by curated metadata views.
          </p>
        </div>
      </div>

      {/* Existing deployed space */}
      {activeSpace && activeSpace.status === "deployed" && (
        <Card className="border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <CardTitle className="text-lg">{activeSpace.title}</CardTitle>
                <Badge variant="secondary">{activeSpace.status}</Badge>
              </div>
              <div className="flex gap-2">
                {activeSpace.spaceUrl && (
                  <Button size="sm" asChild>
                    <a
                      href={activeSpace.spaceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Open Genie Space
                    </a>
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSpace(null);
                    setStep("landing");
                    setViewDeployResults(null);
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleTrash}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Trash
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <StatItem
                label="Industry"
                value={activeSpace.industryName ?? "Not detected"}
              />
              <StatItem
                label="Tables Scanned"
                value={activeSpace.tableCount.toLocaleString()}
              />
              <StatItem
                label="Domains"
                value={
                  activeSpace.domains?.join(", ") ?? "N/A"
                }
              />
              <StatItem
                label="Views"
                value={
                  activeSpace.viewsDeployed
                    ? `${activeSpace.viewCatalog}.${activeSpace.viewSchema}`
                    : "Not deployed"
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Landing / Get Started */}
      {(step === "landing" || step === "probing") && !activeSpace && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Get Started
            </CardTitle>
            <CardDescription>
              The Meta Data Genie deploys curated views over{" "}
              <code className="text-xs">system.information_schema</code> into a
              schema you choose, then creates a Databricks Genie Space pointing
              at those views. This lets your team ask questions like &ldquo;Do
              we have claims data?&rdquo; or &ldquo;Where is customer data
              stored?&rdquo; using natural language.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-md border p-4">
                <h3 className="font-medium">Prerequisites</h3>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <li>
                    &bull; The deploying user must have{" "}
                    <code className="text-xs">USE CATALOG</code> and{" "}
                    <code className="text-xs">SELECT</code> on the{" "}
                    <code className="text-xs">system</code> catalog
                  </li>
                  <li>
                    &bull; A SQL warehouse with system table access
                  </li>
                  <li>
                    &bull; Genie Space consumers only need{" "}
                    <code className="text-xs">SELECT</code> on the view schema
                    (not system tables)
                  </li>
                </ul>
              </div>
              <Button onClick={handleProbe} disabled={isLoading}>
                {step === "probing" ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Checking access...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Check Access &amp; Get Started
                  </>
                )}
              </Button>

              {probeResult && !probeResult.accessible && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <XCircle className="mt-0.5 h-4 w-4 text-destructive" />
                  <p className="text-sm text-destructive">
                    {probeResult.error}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      {step === "configure" && probeResult?.accessible && (
        <Card>
          <CardHeader>
            <CardTitle>Configure</CardTitle>
            <CardDescription>
              Choose which catalogs to include and where to deploy the metadata
              views.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="title">Space Title</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Meta Data Genie"
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <Label>
                    Catalog Scope{" "}
                    <span className="text-xs text-muted-foreground">
                      (leave empty for all)
                    </span>
                  </Label>
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {(probeResult.catalogs ?? []).map((cat) => (
                      <Button
                        key={cat}
                        variant={
                          catalogScope.includes(cat) ? "default" : "outline"
                        }
                        size="sm"
                        onClick={() =>
                          setCatalogScope((prev) =>
                            prev.includes(cat)
                              ? prev.filter((c) => c !== cat)
                              : [...prev, cat]
                          )
                        }
                      >
                        {cat}
                      </Button>
                    ))}
                  </div>
                  {catalogScope.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Selected: {catalogScope.join(", ")}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label htmlFor="viewCatalog">View Target Catalog</Label>
                  <Select
                    value={viewCatalog}
                    onValueChange={setViewCatalog}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select catalog" />
                    </SelectTrigger>
                    <SelectContent>
                      {(probeResult.catalogs ?? []).map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="viewSchema">View Target Schema</Label>
                  <Input
                    id="viewSchema"
                    value={viewSchema}
                    onChange={(e) => setViewSchema(e.target.value)}
                    placeholder="forge_metadata"
                    className="mt-1.5"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    10 curated views will be created as{" "}
                    <code className="text-xs">
                      {viewCatalog}.{viewSchema}.mdg_*
                    </code>
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <Button onClick={handleGenerate} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Analyzing data estate...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generating spinner */}
      {step === "generating" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-4 text-sm text-muted-foreground">
              Analyzing your data estate and detecting industry context...
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This typically takes 5-8 seconds
            </p>
          </CardContent>
        </Card>
      )}

      {/* Preview */}
      {(step === "preview" ||
        step === "deploying-views" ||
        step === "deploying-space") &&
        space &&
        space.status !== "deployed" && (
          <div className="space-y-4">
            {/* Detection Summary */}
            {(space.industryName || space.domains?.length) && (
              <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
                <CardContent className="flex items-start gap-3 pt-4">
                  <Sparkles className="mt-0.5 h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium">
                      {space.industryName
                        ? `Matched: ${space.industryName}`
                        : "Industry detected"}
                    </p>
                    {space.domains && space.domains.length > 0 && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        Domains: {space.domains.join(", ")}
                      </p>
                    )}
                    {space.detection?.duplication_notes &&
                      space.detection.duplication_notes.length > 0 && (
                        <div className="mt-2 flex items-start gap-1.5">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 text-amber-500" />
                          <p className="text-xs text-muted-foreground">
                            {space.detection.duplication_notes[0]}
                          </p>
                        </div>
                      )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Preview cards */}
            <div className="grid gap-4 md:grid-cols-2">
              <PreviewCard
                title="Sample Questions"
                icon={<Eye className="h-4 w-4" />}
              >
                {(() => {
                  try {
                    const parsed = JSON.parse(space.serializedSpace);
                    const questions =
                      parsed.config?.sample_questions?.slice(0, 8) ?? [];
                    return (
                      <ul className="space-y-1 text-sm">
                        {questions.map(
                          (q: { id: string; question: string[] }) => (
                            <li
                              key={q.id}
                              className="text-muted-foreground"
                            >
                              &ldquo;{q.question[0]}&rdquo;
                            </li>
                          )
                        )}
                      </ul>
                    );
                  } catch {
                    return (
                      <p className="text-sm text-muted-foreground">
                        Unable to parse preview
                      </p>
                    );
                  }
                })()}
              </PreviewCard>

              <PreviewCard
                title="Curated Views"
                icon={<Database className="h-4 w-4" />}
              >
                <div className="space-y-1 text-sm">
                  {[
                    "mdg_catalogs",
                    "mdg_schemas",
                    "mdg_tables",
                    "mdg_columns",
                    "mdg_views",
                    "mdg_volumes",
                    "mdg_table_tags",
                    "mdg_column_tags",
                    "mdg_table_constraints",
                    "mdg_table_privileges",
                  ].map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <code className="text-xs text-muted-foreground">
                        {space.viewCatalog}.{space.viewSchema}.{v}
                      </code>
                      {space.viewsDeployed && (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      )}
                    </div>
                  ))}
                </div>
              </PreviewCard>
            </div>

            {/* View deploy results */}
            {viewDeployResults && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    View Deployment Results
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-1">
                    {viewDeployResults.map((r) => (
                      <div
                        key={r.view}
                        className="flex items-center justify-between text-sm"
                      >
                        <code className="text-xs">{r.view}</code>
                        {r.success ? (
                          <Badge
                            variant="secondary"
                            className="text-green-600"
                          >
                            Created
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            Failed
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {!space.viewsDeployed && (
                <Button
                  onClick={handleDeployViews}
                  disabled={isLoading}
                  variant="outline"
                >
                  {step === "deploying-views" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deploying views...
                    </>
                  ) : (
                    <>
                      <Database className="mr-2 h-4 w-4" />
                      Deploy Views
                    </>
                  )}
                </Button>
              )}

              {space.viewsDeployed && !space.spaceId && (
                <Button
                  onClick={handleDeploySpace}
                  disabled={isLoading}
                >
                  {step === "deploying-space" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deploying Genie Space...
                    </>
                  ) : (
                    <>
                      <Rocket className="mr-2 h-4 w-4" />
                      Deploy Genie Space
                    </>
                  )}
                </Button>
              )}

              <Button
                variant="ghost"
                onClick={() => {
                  setSpace(null);
                  setStep("configure");
                  setViewDeployResults(null);
                }}
              >
                Back to Configure
              </Button>
            </div>
          </div>
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

function PreviewCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

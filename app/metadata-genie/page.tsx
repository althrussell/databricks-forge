"use client";

/**
 * Meta Data Genie page.
 *
 * Three states:
 * 1. List / Empty -- shows deployed spaces or an empty state with Generate button
 * 2. Generating -- spinner while probe + LLM detection runs
 * 3. Summary -- rich preview of what was detected, with Deploy button
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  Database,
  CheckCircle2,
  Loader2,
  ExternalLink,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Rocket,
  AlertTriangle,
  MessageSquare,
  Layers,
  BarChart3,
} from "lucide-react";
import { MetadataGenieDeployModal } from "@/components/metadata-genie/deploy-modal";
import type { MetadataGenieSpace } from "@/lib/metadata-genie/types";

type PageState = "list" | "generating" | "summary";

export default function MetadataGeniePage() {
  const [state, setState] = useState<PageState>("list");
  const [spaces, setSpaces] = useState<MetadataGenieSpace[]>([]);
  const [draft, setDraft] = useState<MetadataGenieSpace | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSpaces = useCallback(async () => {
    try {
      const res = await fetch("/api/metadata-genie");
      if (res.ok) {
        const data = await res.json();
        const all: MetadataGenieSpace[] = data.spaces ?? [];
        setSpaces(all.filter((s) => s.status !== "trashed"));
        const existingDraft = all.find((s) => s.status === "draft");
        if (existingDraft) {
          setDraft(existingDraft);
          setState("summary");
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpaces();
  }, [fetchSpaces]);

  // -------------------------------------------------------------------
  // Generate
  // -------------------------------------------------------------------

  const handleGenerate = useCallback(async () => {
    setState("generating");
    try {
      const res = await fetch("/api/metadata-genie/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Generation failed");
      }

      const data: MetadataGenieSpace = await res.json();
      setDraft(data);
      setState("summary");
      toast.success("Analysis complete", {
        description: data.industryName
          ? `Detected: ${data.industryName}`
          : "Ready for deployment",
      });
    } catch (err) {
      setState("list");
      toast.error(err instanceof Error ? err.message : "Generation failed");
    }
  }, []);

  // -------------------------------------------------------------------
  // Deploy complete callback
  // -------------------------------------------------------------------

  const handleDeployComplete = useCallback(
    (result: { spaceId: string; spaceUrl: string }) => {
      if (draft) {
        setSpaces((prev) => [
          {
            ...draft,
            spaceId: result.spaceId,
            spaceUrl: result.spaceUrl,
            status: "deployed",
            viewsDeployed: true,
          },
          ...prev,
        ]);
      }
      setDraft(null);
      setState("list");
      toast.success("Meta Data Genie deployed!");
    },
    [draft]
  );

  // -------------------------------------------------------------------
  // Trash
  // -------------------------------------------------------------------

  const handleTrash = useCallback(
    async (id: string) => {
      try {
        const res = await fetch("/api/metadata-genie", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, dropViews: true }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error ?? "Trash failed");
        }

        setSpaces((prev) => prev.filter((s) => s.id !== id));
        if (draft?.id === id) {
          setDraft(null);
          setState("list");
        }
        toast.success("Space trashed");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Trash failed");
      }
    },
    [draft]
  );

  // -------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------

  const deployedSpaces = spaces.filter((s) => s.status === "deployed");

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
        {state === "list" && !draft && (
          <Button onClick={handleGenerate}>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Metadata Genie
          </Button>
        )}
      </div>

      {/* -------------------------------------------------------------- */}
      {/* State: Generating                                               */}
      {/* -------------------------------------------------------------- */}
      {state === "generating" && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-4 font-medium">
              Analyzing your data estate...
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Scanning system.information_schema, detecting industry context,
              and generating tailored questions.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              This typically takes 5-10 seconds
            </p>
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------------------- */}
      {/* State: Summary (draft ready for deploy)                         */}
      {/* -------------------------------------------------------------- */}
      {state === "summary" && draft && (
        <div className="space-y-4">
          {/* Industry detection card */}
          <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
            <CardContent className="pt-6">
              <div className="grid gap-6 md:grid-cols-4">
                <SummaryItem
                  icon={<Sparkles className="h-4 w-4 text-blue-600" />}
                  label="Industry"
                  value={draft.industryName ?? "Not detected"}
                />
                <SummaryItem
                  icon={<BarChart3 className="h-4 w-4 text-blue-600" />}
                  label="Tables Scanned"
                  value={draft.tableCount.toLocaleString()}
                />
                <SummaryItem
                  icon={<Layers className="h-4 w-4 text-blue-600" />}
                  label="Domains"
                  value={
                    draft.domains?.length
                      ? draft.domains.join(", ")
                      : "N/A"
                  }
                />
                <SummaryItem
                  icon={<Database className="h-4 w-4 text-blue-600" />}
                  label="Curated Views"
                  value="10 views"
                />
              </div>
            </CardContent>
          </Card>

          {/* Duplication notes */}
          {draft.detection?.duplication_notes &&
            draft.detection.duplication_notes.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
                <CardContent className="flex items-start gap-3 pt-4">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
                  <div>
                    <p className="text-sm font-medium">
                      Potential duplication detected
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {draft.detection.duplication_notes.map((note, i) => (
                        <li
                          key={i}
                          className="text-xs text-muted-foreground"
                        >
                          {note}
                        </li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

          {/* Sample questions */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquare className="h-4 w-4" />
                Sample Questions
              </CardTitle>
              <CardDescription>
                Business-analyst-focused questions tailored to your data
                estate. These will be displayed in the Genie Space.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-1.5 md:grid-cols-2">
                {(draft.sampleQuestions ?? []).map((q, i) => (
                  <li
                    key={i}
                    className="rounded-md border px-3 py-2 text-sm text-muted-foreground"
                  >
                    &ldquo;{q}&rdquo;
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Deploy button */}
          <div className="flex items-center gap-3">
            <Button onClick={() => setDeployModalOpen(true)}>
              <Rocket className="mr-2 h-4 w-4" />
              Deploy
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                handleTrash(draft.id);
              }}
            >
              Discard
            </Button>
          </div>

          {/* Deploy modal */}
          <MetadataGenieDeployModal
            open={deployModalOpen}
            onOpenChange={setDeployModalOpen}
            spaceId={draft.id}
            spaceTitle={draft.title}
            onComplete={handleDeployComplete}
          />
        </div>
      )}

      {/* -------------------------------------------------------------- */}
      {/* State: List (deployed spaces)                                   */}
      {/* -------------------------------------------------------------- */}
      {state === "list" && !loading && (
        <>
          {deployedSpaces.length === 0 && !draft && (
            <Card>
              <CardContent className="py-12 text-center">
                <Database className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="mt-4 font-medium">No Metadata Genie spaces yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Generate a Meta Data Genie to create a Genie Space backed by
                  curated views over{" "}
                  <code className="text-xs">system.information_schema</code>.
                  Your team can then ask natural language questions about what
                  data exists in your environment.
                </p>
                <Button className="mt-6" onClick={handleGenerate}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate Metadata Genie
                </Button>
              </CardContent>
            </Card>
          )}

          {deployedSpaces.length > 0 && (
            <div className="space-y-2">
              {deployedSpaces.map((space) => (
                <Collapsible
                  key={space.id}
                  open={expandedId === space.id}
                  onOpenChange={(open) =>
                    setExpandedId(open ? space.id : null)
                  }
                >
                  {/* Row */}
                  <div className="flex items-center gap-3 rounded-md border px-4 py-3">
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        {expandedId === space.id ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="font-medium">{space.title}</span>
                    {space.industryName && (
                      <Badge variant="secondary">
                        {space.industryName}
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {space.tableCount.toLocaleString()} tables
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                      {space.spaceUrl && (
                        <Button variant="outline" size="sm" asChild>
                          <a
                            href={space.spaceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                            Open
                          </a>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleTrash(space.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  <CollapsibleContent>
                    <div className="rounded-b-md border border-t-0 bg-muted/30 px-4 py-4">
                      <div className="grid gap-4 md:grid-cols-4">
                        <DetailItem
                          label="Industry"
                          value={space.industryName ?? "Not detected"}
                        />
                        <DetailItem
                          label="Tables"
                          value={space.tableCount.toLocaleString()}
                        />
                        <DetailItem
                          label="Domains"
                          value={space.domains?.join(", ") ?? "N/A"}
                        />
                        <DetailItem
                          label="Views"
                          value={
                            space.viewCatalog && space.viewSchema
                              ? `${space.viewCatalog}.${space.viewSchema}`
                              : "N/A"
                          }
                        />
                      </div>

                      {space.sampleQuestions &&
                        space.sampleQuestions.length > 0 && (
                          <div className="mt-4">
                            <p className="mb-2 text-xs font-medium text-muted-foreground">
                              Sample Questions
                            </p>
                            <ul className="grid gap-1 md:grid-cols-2">
                              {space.sampleQuestions
                                .slice(0, 8)
                                .map((q, i) => (
                                  <li
                                    key={i}
                                    className="text-xs text-muted-foreground"
                                  >
                                    &ldquo;{q}&rdquo;
                                  </li>
                                ))}
                            </ul>
                          </div>
                        )}

                      <p className="mt-4 text-xs text-muted-foreground">
                        Created{" "}
                        {new Date(space.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </>
      )}

      {/* Loading skeleton */}
      {loading && state === "list" && (
        <Card>
          <CardContent className="py-8 text-center">
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2">
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value}</p>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import {
  BrainCircuit,
  ExternalLink,
  Sparkles,
  Trash2,
  Loader2,
  Table2,
  BarChart3,
  MessageSquare,
  Link2,
  FlaskConical,
  RefreshCw,
  Search,
  FileText,
  MessageCircle,
  Wrench,
  ArrowRight,
} from "lucide-react";
import type { GenieSpaceResponse, TrackedGenieSpace } from "@/lib/genie/types";
import type { SpaceHealthReport } from "@/lib/genie/health-checks/types";
import type { SpaceMetadata } from "@/lib/genie/space-metadata";
import { PageHeader } from "@/components/page-header";
import { HealthDetailSheet } from "@/components/genie/health-detail-sheet";
import { ImportSpaceDialog } from "@/components/genie/import-space-dialog";
import { HealthCheckSettingsDialog } from "@/components/genie/health-check-settings";

interface SpaceCardData {
  spaceId: string;
  title: string;
  description?: string | null;
  source: "pipeline" | "metadata" | "workspace";
  status: "created" | "updated" | "trashed" | "active";
  domain?: string;
  runId?: string | null;
  tableCount?: number;
  measureCount?: number;
  sampleQuestionCount?: number;
  filterCount?: number;
  updatedAt?: string;
}

function mergeSpaces(
  workspaceSpaces: GenieSpaceResponse[],
  tracked: TrackedGenieSpace[],
): SpaceCardData[] {
  const seen = new Set<string>();
  const result: SpaceCardData[] = [];

  for (const t of tracked) {
    seen.add(t.spaceId);
    result.push({
      spaceId: t.spaceId,
      title: t.title,
      source: "pipeline",
      status: t.status,
      domain: t.domain,
      runId: t.runId,
      updatedAt: t.updatedAt,
    });
  }

  for (const ws of workspaceSpaces) {
    if (seen.has(ws.space_id)) continue;
    result.push({
      spaceId: ws.space_id,
      title: ws.title ?? "Untitled",
      description: ws.description,
      source: "workspace",
      status: "active",
    });
  }

  return result.sort((a, b) => {
    if (a.status === "trashed" && b.status !== "trashed") return 1;
    if (a.status !== "trashed" && b.status === "trashed") return -1;
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

export default function GenieSpacesPage() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<SpaceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);
  const [trashTarget, setTrashTarget] = useState<SpaceCardData | null>(null);
  const [trashing, setTrashing] = useState(false);
  const [databricksHost, setDatabricksHost] = useState("");
  const [healthScores, setHealthScores] = useState<Record<string, SpaceHealthReport | null>>({});
  const [healthSheetOpen, setHealthSheetOpen] = useState(false);
  const [healthSheetTarget, setHealthSheetTarget] = useState<SpaceCardData | null>(null);
  const [improveStatuses, setImproveStatuses] = useState<
    Record<string, { status: string; percent: number; message: string }>
  >({});
  const improveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const spacesRef = useRef(spaces);
  spacesRef.current = spaces;

  const runDiscovery = useCallback(async (spaceIds: string[]) => {
    if (spaceIds.length === 0) return;
    setDiscovering(true);
    try {
      const BATCH_SIZE = 50;
      const chunks: string[][] = [];
      for (let i = 0; i < spaceIds.length; i += BATCH_SIZE) {
        chunks.push(spaceIds.slice(i, i + BATCH_SIZE));
      }

      for (const chunk of chunks) {
        const res = await fetch("/api/genie-spaces/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ spaceIds: chunk }),
        });
        if (!res.ok) continue;

        const data: Record<
          string,
          { metadata: SpaceMetadata | null; healthReport: SpaceHealthReport | null }
        > = await res.json();

        setSpaces((prev) =>
          prev.map((s) => {
            const disc = data[s.spaceId];
            if (!disc?.metadata) return s;
            return {
              ...s,
              tableCount: disc.metadata.tableCount,
              measureCount: disc.metadata.measureCount,
              sampleQuestionCount: disc.metadata.sampleQuestionCount,
              filterCount: disc.metadata.filterCount,
            };
          }),
        );

        const reports: Record<string, SpaceHealthReport | null> = {};
        for (const [id, result] of Object.entries(data)) {
          reports[id] = result.healthReport;
        }
        setHealthScores((prev) => ({ ...prev, ...reports }));
      }
    } catch {
      // Discovery is non-critical
    } finally {
      setDiscovering(false);
    }
  }, []);

  const fetchSpaces = useCallback(async () => {
    try {
      const res = await fetch("/api/genie-spaces");
      if (!res.ok) throw new Error("Failed to load spaces");
      const data = await res.json();
      const merged = mergeSpaces(data.spaces ?? [], data.tracked ?? []);
      setSpaces(merged);

      if ((data.staleCount ?? 0) > 0) {
        toast.info(
          `${data.staleCount} space${data.staleCount !== 1 ? "s" : ""} no longer found in workspace`,
        );
      }

      const activeIds = merged.filter((s) => s.status !== "trashed").map((s) => s.spaceId);
      runDiscovery(activeIds);
    } catch {
      toast.error("Failed to load Genie Spaces");
    } finally {
      setLoading(false);
    }
  }, [runDiscovery]);

  useEffect(() => {
    fetchSpaces();
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => {
        if (d.host) {
          setDatabricksHost(d.host.replace(/\/$/, ""));
          localStorage.setItem("forge-databricks-host", d.host.replace(/\/$/, ""));
        }
      })
      .catch(() => {});
  }, [fetchSpaces]);

  // Poll for active improvement jobs
  useEffect(() => {
    const prevStatuses = new Map<string, string>();

    const pollImproveStatuses = async () => {
      try {
        const res = await fetch("/api/genie-spaces/improve-status");
        if (res.ok) {
          const data: {
            jobs: Record<string, { status: string; percent: number; message: string }>;
          } = await res.json();
          setImproveStatuses(data.jobs);

          for (const [sid, job] of Object.entries(data.jobs)) {
            const prev = prevStatuses.get(sid);
            if (prev === "generating" && job.status === "completed") {
              const space = spacesRef.current.find((s) => s.spaceId === sid);
              toast.success(`"${space?.title ?? "Space"}" improvement complete — click to review`, {
                action: { label: "Review", onClick: () => router.push(`/genie/${sid}`) },
                duration: 8000,
              });
            }
            prevStatuses.set(sid, job.status);
          }

          const hasActive = Object.values(data.jobs).some((j) => j.status === "generating");
          if (!hasActive && improveTimerRef.current) {
            clearInterval(improveTimerRef.current);
            improveTimerRef.current = null;
          }
        }
      } catch {
        // Non-critical
      }
    };

    pollImproveStatuses();
    improveTimerRef.current = setInterval(pollImproveStatuses, 5000);
    return () => {
      if (improveTimerRef.current) clearInterval(improveTimerRef.current);
    };
  }, [router]);

  const handleRefresh = () => {
    setLoading(true);
    setHealthScores({});
    fetchSpaces();
  };

  const handleTrash = async () => {
    if (!trashTarget) return;
    setTrashing(true);
    try {
      const res = await fetch(`/api/genie-spaces/${trashTarget.spaceId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to trash space");
      }
      toast.success(`"${trashTarget.title}" trashed`);
      setTrashTarget(null);
      fetchSpaces();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trash space");
    } finally {
      setTrashing(false);
    }
  };

  const activeSpaces = spaces.filter((s) => s.status !== "trashed");
  const trashedSpaces = spaces.filter((s) => s.status === "trashed");

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="Genie Studio"
        subtitle="Create, manage, and improve Databricks Genie Spaces for natural language SQL exploration."
        actions={
          <div className="flex items-center gap-2">
            <HealthCheckSettingsDialog />
            <ImportSpaceDialog
              onImported={(result) => {
                const importedId = `imported-${Date.now()}`;
                setSpaces((prev) => [
                  {
                    spaceId: importedId,
                    title: result.title,
                    description: "Imported via JSON paste",
                    source: "workspace" as const,
                    status: "active" as const,
                    tableCount: result.metadata?.tableCount,
                    measureCount: result.metadata?.measureCount,
                    sampleQuestionCount: result.metadata?.sampleQuestionCount,
                    filterCount: result.metadata?.filterCount,
                  },
                  ...prev,
                ]);
                setHealthScores((prev) => ({ ...prev, [importedId]: result.healthReport }));
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={loading || discovering}
            >
              {loading || discovering ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 size-4" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      {/* Genie Studio Entry Points */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StudioEntryCard
          icon={Search}
          title="Scan Schema"
          description="Point at a catalog.schema and auto-generate a Genie Space with AI table selection and data profiling."
          href="/genie/create/schema"
          accent="blue"
          badge="New"
        />
        <StudioEntryCard
          icon={FileText}
          title="Upload Requirements"
          description="Upload a PDF, Markdown, or text document. Forge extracts tables, questions, and instructions."
          href="/genie/create/requirements"
          accent="violet"
          badge="New"
        />
        <StudioEntryCard
          icon={MessageCircle}
          title="Describe Your Space"
          description="Tell Ask Forge what you need in plain text. It builds the space from your conversation."
          href="/ask-forge?persona=genie-builder"
          accent="emerald"
        />
        <StudioEntryCard
          icon={Wrench}
          title="Improve Existing"
          description={
            activeSpaces.length > 0
              ? `Run result-based benchmarks with auto-fix loops. ${activeSpaces.length} space${activeSpaces.length !== 1 ? "s" : ""} available.`
              : "Create a Genie Space first, then use benchmarks and auto-fix to improve it."
          }
          href={activeSpaces.length > 0 ? "/genie/improve" : undefined}
          onClick={
            activeSpaces.length === 0
              ? () => toast.info("Create a Genie Space first, then come back to improve it.")
              : undefined
          }
          accent="amber"
          badge="Enhanced"
          disabled={loading || activeSpaces.length === 0}
        />
      </div>

      {/* Spaces List */}
      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : spaces.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Sparkles className="mb-4 size-12 text-muted-foreground/50" />
            <h2 className="text-lg font-semibold">No Genie Spaces yet</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose an entry point above to create your first Genie Space.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="active">
          <TabsList>
            <TabsTrigger value="active">Active ({activeSpaces.length})</TabsTrigger>
            {trashedSpaces.length > 0 && (
              <TabsTrigger value="trashed">Trashed ({trashedSpaces.length})</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="active" className="mt-4">
            {activeSpaces.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No active spaces. Choose an entry point above to get started.
              </p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {activeSpaces.map((space) => (
                  <SpaceCard
                    key={space.spaceId}
                    space={space}
                    databricksHost={databricksHost}
                    onTrash={() => setTrashTarget(space)}
                    onCardClick={() => router.push(`/genie/${space.spaceId}`)}
                    healthReport={healthScores[space.spaceId] ?? undefined}
                    healthLoading={discovering}
                    onHealthClick={() => {
                      setHealthSheetTarget(space);
                      setHealthSheetOpen(true);
                    }}
                    improveStatus={improveStatuses[space.spaceId]}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {trashedSpaces.length > 0 && (
            <TabsContent value="trashed" className="mt-4">
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {trashedSpaces.map((space) => (
                  <SpaceCard key={space.spaceId} space={space} databricksHost={databricksHost} />
                ))}
              </div>
            </TabsContent>
          )}
        </Tabs>
      )}

      {/* Trash confirmation dialog */}
      <AlertDialog open={!!trashTarget} onOpenChange={(open) => !open && setTrashTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Trash Genie Space</AlertDialogTitle>
            <AlertDialogDescription>
              This will trash &quot;{trashTarget?.title}&quot; in Databricks. The space can be
              recovered from the Databricks workspace trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trashing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleTrash}
              disabled={trashing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {trashing ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 size-4" />
              )}
              Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Health detail sheet -- onFix navigates to detail page health tab */}
      <HealthDetailSheet
        open={healthSheetOpen}
        onOpenChange={setHealthSheetOpen}
        spaceId={healthSheetTarget?.spaceId ?? ""}
        spaceTitle={healthSheetTarget?.title ?? ""}
        report={healthSheetTarget ? (healthScores[healthSheetTarget.spaceId] ?? null) : null}
        loading={discovering}
        onFix={() => {
          if (healthSheetTarget) {
            setHealthSheetOpen(false);
            router.push(`/genie/${healthSheetTarget.spaceId}?tab=health`);
          }
        }}
      />
    </div>
  );
}

const ACCENT_CLASSES = {
  blue: "border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30",
  violet: "border-violet-200 bg-violet-50/50 dark:border-violet-800 dark:bg-violet-950/30",
  emerald: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/30",
  amber: "border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/30",
} as const;

const ICON_ACCENT_CLASSES = {
  blue: "text-blue-600 dark:text-blue-400",
  violet: "text-violet-600 dark:text-violet-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  amber: "text-amber-600 dark:text-amber-400",
} as const;

function StudioEntryCard({
  icon: Icon,
  title,
  description,
  href,
  onClick,
  accent,
  badge,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  href?: string;
  onClick?: () => void;
  accent: keyof typeof ACCENT_CLASSES;
  badge?: string;
  disabled?: boolean;
}) {
  const content = (
    <Card
      className={`group relative flex h-full flex-col border transition-all ${
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:shadow-lg hover:-translate-y-0.5"
      } ${ACCENT_CLASSES[accent]}`}
      onClick={disabled ? undefined : onClick}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div
            className={`rounded-lg border bg-background p-2 shadow-sm ${ICON_ACCENT_CLASSES[accent]}`}
          >
            <Icon className="size-5" />
          </div>
          {badge && (
            <Badge variant="secondary" className="text-[10px] font-medium">
              {badge}
            </Badge>
          )}
        </div>
        <CardTitle className="mt-3 text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col pt-0">
        <CardDescription className="text-xs leading-relaxed">{description}</CardDescription>
        <div className="mt-auto flex items-center gap-1 pt-3 text-xs font-medium text-muted-foreground transition-colors group-hover:text-foreground">
          Get started{" "}
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </CardContent>
    </Card>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className="no-underline">
        {content}
      </Link>
    );
  }
  return content;
}

function HealthGradeBadge({
  report,
  loading,
  onClick,
}: {
  report?: SpaceHealthReport;
  loading?: boolean;
  onClick?: () => void;
}) {
  if (loading) return <Skeleton className="size-7 rounded-full" />;
  if (!report) return null;

  const colorClass =
    report.grade === "A" || report.grade === "B"
      ? "bg-green-100 text-green-700 border-green-300 dark:bg-green-900/40 dark:text-green-400"
      : report.grade === "C"
        ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/40 dark:text-amber-400"
        : "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/40 dark:text-red-400";

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`flex size-7 items-center justify-center rounded-full border text-xs font-bold transition-transform hover:scale-110 ${colorClass}`}
      title={`Health: ${report.grade} (${report.overallScore}/100)`}
    >
      {report.grade}
    </button>
  );
}

function SpaceCard({
  space,
  databricksHost,
  onTrash,
  onCardClick,
  healthReport,
  healthLoading,
  onHealthClick,
  improveStatus,
}: {
  space: SpaceCardData;
  databricksHost: string;
  onTrash?: () => void;
  onCardClick?: () => void;
  healthReport?: SpaceHealthReport;
  healthLoading?: boolean;
  onHealthClick?: () => void;
  improveStatus?: { status: string; percent: number; message: string };
}) {
  const isTrashed = space.status === "trashed";
  const genieUrl = databricksHost ? `${databricksHost}/genie/rooms/${space.spaceId}` : "";
  const isImproving = improveStatus?.status === "generating";

  return (
    <Card
      className={`flex h-full flex-col ${isTrashed ? "overflow-hidden opacity-60" : "overflow-hidden"} ${isImproving ? "ring-1 ring-violet-300 dark:ring-violet-700" : ""} ${onCardClick ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
      onClick={onCardClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="line-clamp-2 text-base">{space.title}</CardTitle>
            {space.description && (
              <CardDescription className="mt-1 line-clamp-2 text-xs">
                {space.description}
              </CardDescription>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1">
            {isImproving && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex size-7 items-center justify-center">
                    <BrainCircuit className="size-5 animate-pulse text-violet-500" />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Improving with Genie Engine ({improveStatus.percent}%)
                </TooltipContent>
              </Tooltip>
            )}
            {!isImproving && !isTrashed && (
              <HealthGradeBadge
                report={healthReport}
                loading={healthLoading}
                onClick={onHealthClick}
              />
            )}
            <SourceBadge source={space.source} />
            {isTrashed && (
              <Badge variant="outline" className="text-xs">
                Trashed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col space-y-3">
        {space.domain && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3" />
            <span>{space.domain}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {space.tableCount !== undefined && space.tableCount > 0 && (
            <span className="flex items-center gap-1">
              <Table2 className="size-3" />
              {space.tableCount} tables
            </span>
          )}
          {space.measureCount !== undefined && space.measureCount > 0 && (
            <span className="flex items-center gap-1">
              <BarChart3 className="size-3" />
              {space.measureCount} measures
            </span>
          )}
          {space.sampleQuestionCount !== undefined && space.sampleQuestionCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" />
              {space.sampleQuestionCount} questions
            </span>
          )}
          {space.filterCount !== undefined && space.filterCount > 0 && (
            <span className="flex items-center gap-1">
              <Link2 className="size-3" />
              {space.filterCount} filters
            </span>
          )}
        </div>

        {healthReport && !isTrashed && healthReport.fixableCount > 0 && (
          <button
            className="flex items-center gap-1 text-xs text-amber-600 transition-colors hover:text-amber-700"
            onClick={(e) => {
              e.stopPropagation();
              onHealthClick?.();
            }}
          >
            <Wrench className="size-3" />
            {healthReport.fixableCount} fixable issue{healthReport.fixableCount !== 1 ? "s" : ""}{" "}
            &mdash; Fix now
          </button>
        )}

        {space.updatedAt && (
          <p className="text-xs text-muted-foreground">
            {new Date(space.updatedAt).toLocaleDateString()}
          </p>
        )}

        <div className="mt-auto flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
          {genieUrl && !isTrashed && (
            <Button size="sm" variant="outline" asChild className="h-7 text-xs">
              <a href={genieUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 size-3" />
                Open in Databricks
              </a>
            </Button>
          )}
          {!isTrashed && (
            <Button size="sm" variant="outline" asChild className="h-7 text-xs">
              <Link href={`/genie/${space.spaceId}/benchmarks`}>
                <FlaskConical className="mr-1.5 size-3" />
                Test
              </Link>
            </Button>
          )}
          {space.runId && (
            <Button size="sm" variant="ghost" asChild className="h-7 text-xs">
              <Link href={`/runs/${space.runId}?tab=genie`}>View Run</Link>
            </Button>
          )}
          {onTrash && !isTrashed && (
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 text-xs text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                onTrash();
              }}
            >
              <Trash2 className="size-3" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SourceBadge({ source }: { source: SpaceCardData["source"] }) {
  switch (source) {
    case "pipeline":
      return (
        <Badge variant="secondary" className="text-xs">
          Pipeline
        </Badge>
      );
    case "metadata":
      return (
        <Badge variant="secondary" className="text-xs">
          Metadata
        </Badge>
      );
    case "workspace":
      return (
        <Badge variant="outline" className="text-xs">
          Workspace
        </Badge>
      );
  }
}

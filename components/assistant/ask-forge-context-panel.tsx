"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { TableEnrichmentData, SourceData } from "./ask-forge-chat";
import {
  Database,
  Heart,
  Clock,
  User,
  GitBranch,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  FolderTree,
  ShieldAlert,
  Columns3,
  ExternalLink,
  MessageCircleQuestion,
  Loader2,
  FileSearch,
  Sparkles,
  Network,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface TableDetailData {
  detail: {
    tableFqn: string;
    catalog: string;
    schema: string;
    tableName: string;
    tableType?: string;
    comment?: string;
    generatedDescription?: string;
    format?: string;
    owner?: string;
    sizeInBytes?: string;
    numRows?: string;
    numFiles?: number;
    lastModified?: string;
    dataDomain?: string;
    dataSubdomain?: string;
    dataTier?: string;
    sensitivityLevel?: string;
    governanceScore?: number;
    autoOptimize?: boolean;
    cdfEnabled?: boolean;
    createdBy?: string;
  };
  columns: Array<{
    name: string;
    type_name?: string;
    data_type?: string;
    comment?: string;
    nullable?: boolean;
    is_pii?: boolean;
  }>;
  history: {
    totalWriteOps: number;
    totalStreamingOps: number;
    totalOptimizeOps: number;
    totalVacuumOps: number;
    totalMergeOps: number;
    lastWriteTimestamp?: string;
    lastWriteOperation?: string;
    lastOptimizeTimestamp?: string;
    lastVacuumTimestamp?: string;
    hasStreamingWrites: boolean;
    historyDays: number;
    healthScore?: number;
    issuesJson?: string;
    recommendationsJson?: string;
  } | null;
  lineage: {
    upstream: Array<{ sourceTableFqn: string; targetTableFqn: string; eventCount?: number }>;
    downstream: Array<{ sourceTableFqn: string; targetTableFqn: string; eventCount?: number }>;
  };
  insights: Array<{ insightType: string; payloadJson: string; severity: string }>;
  useCases: Array<{
    id: string;
    name: string;
    domain: string;
    type: string;
    overallScore: number | null;
    runId: string;
  }>;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AskForgeContextPanelProps {
  enrichments: TableEnrichmentData[];
  tableDetails: Map<string, TableDetailData>;
  referencedTables: string[];
  sources: SourceData[];
  loadingTables: boolean;
  onAskAboutTable?: (fqn: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AskForgeContextPanel({
  enrichments,
  tableDetails,
  referencedTables,
  sources,
  loadingTables,
  onAskAboutTable,
}: AskForgeContextPanelProps) {
  const [expandedTables, setExpandedTables] = React.useState<Set<string>>(new Set());
  const [showErdModal, setShowErdModal] = React.useState(false);

  const hasContent = referencedTables.length > 0 || sources.length > 0 || enrichments.length > 0;

  if (!hasContent && !loadingTables) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <Database className="size-10 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-medium text-muted-foreground">Context Panel</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Referenced tables, health scores, lineage, and freshness will appear here when Forge responds.
          </p>
        </div>
      </div>
    );
  }

  const toggleTable = (fqn: string) => {
    setExpandedTables((prev) => {
      const next = new Set(prev);
      if (next.has(fqn)) next.delete(fqn);
      else next.add(fqn);
      return next;
    });
  };

  const tableFqns = referencedTables.length > 0
    ? referencedTables
    : enrichments.map((e) => e.tableFqn);

  return (
    <ScrollArea className="h-full">
      <div className="space-y-5 p-4">
        {/* Referenced Tables */}
        {(tableFqns.length > 0 || loadingTables) && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Database className="size-4 text-primary" />
              Referenced Tables
              {tableFqns.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">{tableFqns.length}</Badge>
              )}
              {loadingTables && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            </h3>

            <div className="mt-2 space-y-3">
              {loadingTables && tableFqns.length === 0 && (
                <>
                  <Skeleton className="h-28 w-full rounded-lg" />
                  <Skeleton className="h-28 w-full rounded-lg" />
                </>
              )}

              {tableFqns.map((fqn) => {
                const detail = tableDetails.get(fqn);
                const enrichment = enrichments.find((e) => e.tableFqn === fqn);
                const isExpanded = expandedTables.has(fqn);

                return (
                  <RichTableCard
                    key={fqn}
                    fqn={fqn}
                    detail={detail}
                    enrichment={enrichment}
                    isExpanded={isExpanded}
                    onToggle={() => toggleTable(fqn)}
                    onAskAbout={() => onAskAboutTable?.(fqn)}
                  />
                );
              })}
            </div>

            {tableFqns.length >= 2 && (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full gap-1.5 text-xs"
                onClick={() => setShowErdModal(true)}
              >
                <Network className="size-3.5" />
                View ERD ({tableFqns.length} tables)
              </Button>
            )}
          </section>
        )}

        {/* Lineage Overview */}
        {tableFqns.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="size-4 text-primary" />
              Lineage
            </h3>
            <div className="mt-2 space-y-1.5">
              {tableFqns.map((fqn) => {
                const detail = tableDetails.get(fqn);
                const enrichment = enrichments.find((e) => e.tableFqn === fqn);
                if (!detail && !enrichment) return null;

                const upstream = detail
                  ? detail.lineage.upstream.map((l) => l.sourceTableFqn)
                  : enrichment?.upstreamTables ?? [];
                const downstream = detail
                  ? detail.lineage.downstream.map((l) => l.targetTableFqn)
                  : enrichment?.downstreamTables ?? [];

                if (upstream.length === 0 && downstream.length === 0) return null;

                return (
                  <LineageSummary
                    key={fqn}
                    fqn={fqn}
                    upstream={upstream}
                    downstream={downstream}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Sources */}
        {sources.length > 0 && (
          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <FileSearch className="size-4 text-primary" />
              Sources
              <Badge variant="secondary" className="text-[10px]">{sources.length}</Badge>
            </h3>
            <div className="mt-2 space-y-1.5">
              {sources.map((src) => (
                <SourceRow key={`${src.kind}-${src.sourceId}-${src.index}`} source={src} />
              ))}
            </div>
          </section>
        )}
      </div>

      {showErdModal && (
        <ErdModalLazy
          tableFqns={tableFqns}
          onClose={() => setShowErdModal(false)}
        />
      )}
    </ScrollArea>
  );
}

// ---------------------------------------------------------------------------
// Rich Table Card
// ---------------------------------------------------------------------------

function RichTableCard({
  fqn,
  detail,
  enrichment,
  isExpanded,
  onToggle,
  onAskAbout,
}: {
  fqn: string;
  detail?: TableDetailData;
  enrichment?: TableEnrichmentData;
  isExpanded: boolean;
  onToggle: () => void;
  onAskAbout: () => void;
}) {
  const parts = fqn.split(".");
  const shortName = parts.length >= 3 ? parts[2] : fqn;
  const schemaPath = parts.length >= 3 ? `${parts[0]}.${parts[1]}` : "";

  const d = detail?.detail;
  const h = detail?.history;

  const healthScore = h?.healthScore ?? enrichment?.healthScore ?? null;
  const owner = d?.owner ?? enrichment?.owner ?? null;
  const numRows = d?.numRows ?? enrichment?.numRows ?? null;
  const sizeInBytes = d?.sizeInBytes ?? enrichment?.sizeInBytes ?? null;
  const lastModified = d?.lastModified ?? enrichment?.lastModified ?? null;
  const domain = d?.dataDomain ?? enrichment?.dataDomain ?? null;
  const tier = d?.dataTier ?? enrichment?.dataTier ?? null;
  const sensitivity = d?.sensitivityLevel ?? null;
  const governanceScore = d?.governanceScore ?? null;
  const description = d?.generatedDescription ?? d?.comment ?? null;

  const piiColumns = detail?.columns.filter((c) => c.is_pii) ?? [];
  const columnCount = detail?.columns.length ?? 0;

  const issues = enrichment?.issues ?? parseJsonArray(h?.issuesJson);
  const useCases = detail?.useCases ?? [];

  return (
    <div className="rounded-lg border bg-card text-xs">
      {/* Header */}
      <button
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link
              href={`/environment/table/${encodeURIComponent(fqn)}`}
              className="font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {shortName}
            </Link>
            <ExternalLink className="size-3 text-muted-foreground" />
          </div>
          {schemaPath && (
            <p className="truncate text-muted-foreground">{schemaPath}</p>
          )}
          {description && !isExpanded && (
            <p className="mt-1 line-clamp-1 text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {sensitivity && sensitivity !== "none" && (
            <Badge variant="destructive" className="text-[9px]">
              <ShieldAlert className="mr-0.5 size-2.5" />
              {sensitivity}
            </Badge>
          )}
          {healthScore !== null && <HealthBadge score={healthScore} />}
        </div>
      </button>

      {/* Summary row (always visible) */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-muted-foreground">
        {domain && (
          <span className="flex items-center gap-1">
            <FolderTree className="size-3" />
            {domain}{tier ? ` (${tier})` : ""}
          </span>
        )}
        {numRows && (
          <span className="flex items-center gap-1">
            <Database className="size-3" />
            {formatNumber(Number(numRows))} rows
          </span>
        )}
        {lastModified && (
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatRelativeDate(lastModified)}
          </span>
        )}
        {piiColumns.length > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <ShieldAlert className="size-3" />
            {piiColumns.length} PII col{piiColumns.length > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="space-y-3 border-t px-3 py-3">
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {owner && <Detail icon={User} label="Owner" value={owner} />}
            {sizeInBytes && <Detail icon={Database} label="Size" value={formatBytes(Number(sizeInBytes))} />}
            {governanceScore !== null && <Detail icon={ShieldAlert} label="Governance" value={`${governanceScore.toFixed(0)}/100`} />}
            {h?.lastWriteTimestamp && (
              <Detail
                icon={Clock}
                label="Last write"
                value={`${formatRelativeDate(h.lastWriteTimestamp)}${h.lastWriteOperation ? ` (${h.lastWriteOperation})` : ""}`}
              />
            )}
            {h && (
              <Detail icon={Database} label="Writes" value={`${h.totalWriteOps} writes, ${h.totalMergeOps} merges`} />
            )}
            {h?.hasStreamingWrites && (
              <Detail icon={Sparkles} label="Streaming" value="Active" />
            )}
          </div>

          {/* Columns preview */}
          {columnCount > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Columns3 className="size-3" />
                Columns ({columnCount})
              </p>
              <div className="flex flex-wrap gap-1">
                {detail!.columns.slice(0, 12).map((col) => (
                  <Badge
                    key={col.name}
                    variant={col.is_pii ? "destructive" : "secondary"}
                    className="text-[9px]"
                  >
                    {col.name}
                    {col.is_pii && " (PII)"}
                  </Badge>
                ))}
                {columnCount > 12 && (
                  <Badge variant="outline" className="text-[9px]">
                    +{columnCount - 12} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Issues */}
          {issues.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400">Issues</p>
              {issues.slice(0, 3).map((issue, i) => (
                <div key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                  <span className="text-[11px]">{issue}</span>
                </div>
              ))}
            </div>
          )}

          {/* Related use cases */}
          {useCases.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Sparkles className="size-3" />
                Related Use Cases ({useCases.length})
              </p>
              <div className="space-y-1">
                {useCases.slice(0, 4).map((uc) => (
                  <div key={uc.id} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1">
                    <Link
                      href={`/runs/${uc.runId}?usecase=${uc.id}`}
                      className="flex-1 truncate text-[11px] font-medium text-primary hover:underline"
                    >
                      {uc.name}
                    </Link>
                    {uc.overallScore !== null && (
                      <Badge variant="outline" className="ml-1 text-[9px]">{uc.overallScore.toFixed(0)}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insights */}
          {detail?.insights && detail.insights.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-medium text-muted-foreground">Insights</p>
              {detail.insights.slice(0, 3).map((insight, i) => (
                <InsightRow key={i} insight={insight} />
              ))}
            </div>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-xs"
            onClick={onAskAbout}
          >
            <MessageCircleQuestion className="size-3.5" />
            Ask Forge about this table
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function InsightRow({ insight }: { insight: { insightType: string; payloadJson: string; severity: string } }) {
  let summary = insight.insightType;
  try {
    const payload = JSON.parse(insight.payloadJson);
    if (payload.summary) summary = payload.summary;
    else if (payload.description) summary = payload.description;
  } catch {
    // use raw insightType
  }

  const severityColor =
    insight.severity === "critical" ? "text-red-600 dark:text-red-400" :
    insight.severity === "warning" ? "text-amber-600 dark:text-amber-400" :
    "text-blue-600 dark:text-blue-400";

  return (
    <div className={`flex items-start gap-1.5 text-[11px] ${severityColor}`}>
      <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
      <span>{summary}</span>
    </div>
  );
}

function LineageSummary({
  fqn,
  upstream,
  downstream,
}: {
  fqn: string;
  upstream: string[];
  downstream: string[];
}) {
  const parts = fqn.split(".");
  const shortName = parts.length >= 3 ? parts[2] : fqn;

  return (
    <div className="rounded border bg-muted/30 p-2 text-[11px]">
      <p className="font-medium">{shortName}</p>
      {upstream.length > 0 && (
        <div className="mt-1 flex items-start gap-1 text-muted-foreground">
          <ArrowDownRight className="mt-0.5 size-3 shrink-0 text-blue-500" />
          <span>From: {upstream.map(shortFqn).join(", ")}</span>
        </div>
      )}
      {downstream.length > 0 && (
        <div className="mt-0.5 flex items-start gap-1 text-muted-foreground">
          <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-green-500" />
          <span>To: {downstream.map(shortFqn).join(", ")}</span>
        </div>
      )}
    </div>
  );
}

function SourceRow({ source }: { source: SourceData }) {
  const kindLabel = SOURCE_KIND_LABELS[source.kind] ?? source.kind;
  const scorePercent = (source.score * 100).toFixed(0);

  return (
    <div className="flex items-center gap-2 rounded border bg-muted/30 px-2 py-1.5 text-[11px]">
      <Badge variant="outline" className="shrink-0 text-[9px]">{kindLabel}</Badge>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{source.label}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">{scorePercent}%</span>
    </div>
  );
}

function HealthBadge({ score }: { score: number }) {
  let color = "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300";
  if (score < 50) color = "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300";
  else if (score < 75) color = "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300";

  return (
    <div className="flex items-center gap-1">
      <Heart className="size-3" />
      <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
        {score}
      </span>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-1.5 text-muted-foreground">
      <Icon className="mt-0.5 size-3 shrink-0" />
      <div className="min-w-0">
        <span className="text-[10px]">{label}</span>
        <p className="truncate font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ERD Modal (lazy loaded)
// ---------------------------------------------------------------------------

function ErdModalLazy({
  tableFqns,
  onClose,
}: {
  tableFqns: string[];
  onClose: () => void;
}) {
  const [ErdModal, setErdModal] = React.useState<React.ComponentType<{
    tableFqns: string[];
    onClose: () => void;
  }> | null>(null);

  React.useEffect(() => {
    import("./erd-modal").then((m) => setErdModal(() => m.ErdModal));
  }, []);

  if (!ErdModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <Loader2 className="size-8 animate-spin text-white" />
      </div>
    );
  }

  return <ErdModal tableFqns={tableFqns} onClose={onClose} />;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SOURCE_KIND_LABELS: Record<string, string> = {
  table_detail: "Table",
  column_profile: "Column",
  table_health: "Health",
  lineage_context: "Lineage",
  environment_insight: "Insight",
  data_product: "Product",
  use_case: "Use Case",
  business_context: "Business",
  genie_recommendation: "Genie",
  genie_question: "Question",
  outcome_map: "Outcome",
  document_chunk: "Document",
};

function shortFqn(fqn: string): string {
  const parts = fqn.split(".");
  return parts.length >= 3 ? parts[2] : fqn;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function parseJsonArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

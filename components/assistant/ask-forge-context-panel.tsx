"use client";

import * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TableEnrichmentData } from "./ask-forge-chat";
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
} from "lucide-react";

interface AskForgeContextPanelProps {
  enrichments: TableEnrichmentData[];
}

export function AskForgeContextPanel({ enrichments }: AskForgeContextPanelProps) {
  if (enrichments.length === 0) {
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

  return (
    <ScrollArea className="h-full">
      <div className="space-y-1 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Database className="size-4 text-primary" />
          Referenced Tables
          <Badge variant="secondary" className="text-[10px]">{enrichments.length}</Badge>
        </h3>

        <div className="space-y-3 pt-2">
          {enrichments.map((t) => (
            <TableCard key={t.tableFqn} table={t} />
          ))}
        </div>

        {enrichments.length >= 2 && (
          <div className="pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="size-4 text-primary" />
              Lineage Overview
            </h3>
            <div className="mt-2 space-y-1">
              {enrichments.map((t) => (
                <LineageSummary key={t.tableFqn} table={t} />
              ))}
            </div>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

function TableCard({ table }: { table: TableEnrichmentData }) {
  const parts = table.tableFqn.split(".");
  const shortName = parts.length >= 3 ? parts[2] : table.tableFqn;
  const schemaPath = parts.length >= 3 ? `${parts[0]}.${parts[1]}` : "";

  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/environment/table/${encodeURIComponent(table.tableFqn)}`}
            className="font-medium text-primary hover:underline"
          >
            {shortName}
          </Link>
          {schemaPath && (
            <p className="truncate text-muted-foreground">{schemaPath}</p>
          )}
        </div>
        {table.healthScore !== null && (
          <HealthBadge score={table.healthScore} />
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {table.dataDomain && (
          <Detail icon={FolderTree} label="Domain" value={table.dataDomain} />
        )}
        {table.dataTier && (
          <Detail icon={FolderTree} label="Tier" value={table.dataTier} />
        )}
        {table.owner && (
          <Detail icon={User} label="Owner" value={table.owner} />
        )}
        {table.createdBy && table.createdBy !== table.owner && (
          <Detail icon={User} label="Created by" value={table.createdBy} />
        )}
        {table.numRows && (
          <Detail icon={Database} label="Rows" value={formatNumber(Number(table.numRows))} />
        )}
        {table.sizeInBytes && (
          <Detail icon={Database} label="Size" value={formatBytes(Number(table.sizeInBytes))} />
        )}
        {table.lastModified && (
          <Detail icon={Clock} label="Modified" value={formatRelativeDate(table.lastModified)} />
        )}
        {table.lastWriteTimestamp && (
          <Detail
            icon={Clock}
            label="Last write"
            value={`${formatRelativeDate(table.lastWriteTimestamp)}${table.lastWriteOperation ? ` (${table.lastWriteOperation})` : ""}`}
          />
        )}
      </div>

      {table.issues.length > 0 && (
        <div className="mt-2 space-y-1">
          {table.issues.slice(0, 3).map((issue, i) => (
            <div key={i} className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span className="text-[11px]">{issue}</span>
            </div>
          ))}
          {table.issues.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{table.issues.length - 3} more
            </span>
          )}
        </div>
      )}

      {table.recommendations.length > 0 && table.issues.length === 0 && (
        <div className="mt-2 space-y-1">
          {table.recommendations.slice(0, 2).map((rec, i) => (
            <div key={i} className="flex items-start gap-1.5 text-blue-600 dark:text-blue-400">
              <CheckCircle2 className="mt-0.5 size-3 shrink-0" />
              <span className="text-[11px]">{rec}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LineageSummary({ table }: { table: TableEnrichmentData }) {
  if (table.upstreamTables.length === 0 && table.downstreamTables.length === 0) return null;

  const parts = table.tableFqn.split(".");
  const shortName = parts.length >= 3 ? parts[2] : table.tableFqn;

  return (
    <div className="rounded border bg-muted/30 p-2 text-[11px]">
      <p className="font-medium">{shortName}</p>
      {table.upstreamTables.length > 0 && (
        <div className="mt-1 flex items-start gap-1 text-muted-foreground">
          <ArrowDownRight className="mt-0.5 size-3 shrink-0 text-blue-500" />
          <span>From: {table.upstreamTables.map(shortFqn).join(", ")}</span>
        </div>
      )}
      {table.downstreamTables.length > 0 && (
        <div className="mt-0.5 flex items-start gap-1 text-muted-foreground">
          <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-green-500" />
          <span>To: {table.downstreamTables.map(shortFqn).join(", ")}</span>
        </div>
      )}
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

function Detail({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
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

"use client";

import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { ResearchSource } from "@/lib/demo/types";

interface SourceListProps {
  sources: ResearchSource[];
}

const statusStyles: Record<string, string> = {
  ready: "bg-emerald-500",
  failed: "bg-red-500",
  pending: "bg-amber-500",
  fetching: "bg-blue-500",
};

export function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        No sources collected.
      </div>
    );
  }

  const ready = sources.filter((s) => s.status === "ready");
  const failed = sources.filter((s) => s.status === "failed");
  const other = sources.filter((s) => s.status !== "ready" && s.status !== "failed");

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span>{sources.length} total</span>
        <span className="h-3 w-px bg-border" />
        <span className="text-emerald-600 dark:text-emerald-400">{ready.length} ready</span>
        {failed.length > 0 && (
          <>
            <span className="h-3 w-px bg-border" />
            <span className="text-red-600 dark:text-red-400">{failed.length} failed</span>
          </>
        )}
        {other.length > 0 && (
          <>
            <span className="h-3 w-px bg-border" />
            <span>{other.length} pending</span>
          </>
        )}
      </div>

      {/* Source rows */}
      <div className="divide-y rounded-lg border">
        {sources.map((s, i) => {
          const linkUrl = s.url ?? (s.title?.startsWith("http") ? s.title : undefined);
          const label = s.url && s.title !== s.url ? s.title : s.title ?? s.url;

          return (
            <div key={i} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusStyles[s.status] ?? statusStyles.pending}`} />
              <Badge variant="secondary" className="text-[10px] shrink-0">{s.type}</Badge>
              <span className="min-w-0 flex-1 truncate">
                {linkUrl ? (
                  <a
                    href={linkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center gap-1"
                    title={linkUrl}
                  >
                    <span className="truncate">{label}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                  </a>
                ) : (
                  <span className="text-muted-foreground truncate">{label}</span>
                )}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {s.charCount.toLocaleString()} chars
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

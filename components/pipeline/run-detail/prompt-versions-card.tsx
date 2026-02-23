"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { FileCode2, AlertTriangle, ChevronDown } from "lucide-react";
import { PROMPT_VERSIONS } from "@/lib/ai/templates";

export function PromptVersionsCard({
  runVersions,
}: {
  runVersions: Record<string, string>;
  runId: string;
}) {
  const entries = Object.entries(runVersions);
  const currentVersions = PROMPT_VERSIONS as Record<string, string>;

  const staleEntries = entries.filter(([key, hash]) => {
    const cur = currentVersions[key];
    return cur === undefined || cur !== hash;
  });
  const changedCount = staleEntries.length;

  const [diffCache, setDiffCache] = useState<
    Record<string, { run: string | null; current: string | null }>
  >({});
  const [loadingDiff, setLoadingDiff] = useState<string | null>(null);

  const fetchDiff = useCallback(
    async (
      promptKey: string,
      runHash: string,
      currentHash: string | undefined
    ) => {
      if (diffCache[promptKey]) return;
      setLoadingDiff(promptKey);
      try {
        const hashes = [runHash, currentHash].filter(Boolean).join(",");
        const res = await fetch(`/api/prompt-templates?hashes=${hashes}`);
        if (res.ok) {
          const data = await res.json();
          const templates = data.templates as Record<
            string,
            { promptKey: string; templateText: string }
          >;
          setDiffCache((prev) => ({
            ...prev,
            [promptKey]: {
              run: templates[runHash]?.templateText ?? null,
              current: currentHash
                ? (templates[currentHash]?.templateText ?? null)
                : null,
            },
          }));
        }
      } catch {
        // Non-critical
      } finally {
        setLoadingDiff(null);
      }
    },
    [diffCache]
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileCode2 className="h-4 w-4 text-violet-500" />
            Prompt Versions
            {changedCount > 0 && (
              <Badge
                variant="outline"
                className="ml-1 border-amber-300 text-amber-700"
              >
                {changedCount} changed since this run
              </Badge>
            )}
          </CardTitle>
        </div>
        <CardDescription>
          Prompt template versions used for this run
          {changedCount > 0
            ? " \u2014 prompts marked with a warning have been updated since. Expand to view differences."
            : " \u2014 all prompts match the current deployed version"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {entries.map(([key, hash]) => {
            const currentHash = currentVersions[key];
            const isStale = currentHash !== undefined && currentHash !== hash;
            const isRemoved = currentHash === undefined;
            const hasDiff = isStale || isRemoved;
            const cached = diffCache[key];

            if (!hasDiff) {
              return (
                <div
                  key={key}
                  className="flex items-center justify-between rounded-md border px-3 py-1.5"
                >
                  <span className="text-xs font-medium">{key}</span>
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    {hash}
                  </code>
                </div>
              );
            }

            return (
              <Collapsible key={key}>
                <CollapsibleTrigger
                  className="flex w-full items-center justify-between rounded-md border border-amber-300 bg-amber-50/50 px-3 py-1.5 text-left transition-colors hover:bg-amber-100/50 dark:border-amber-800 dark:bg-amber-900/10 dark:hover:bg-amber-900/20"
                  onClick={() => {
                    if (!cached && !isRemoved) {
                      fetchDiff(key, hash, currentHash);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                    <span className="text-xs font-medium">{key}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      {hash}
                    </code>
                    {isStale && (
                      <span className="text-[10px] text-amber-600">
                        now:{" "}
                        <code className="rounded bg-muted px-1">
                          {currentHash}
                        </code>
                      </span>
                    )}
                    {isRemoved && (
                      <span className="text-[10px] text-amber-600">
                        removed
                      </span>
                    )}
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-b-md border border-t-0 border-amber-300 px-3 py-3 dark:border-amber-800">
                    {loadingDiff === key && <Skeleton className="h-24" />}
                    {cached ? (
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="mb-1 text-xs font-semibold text-blue-600">
                            This Run ({hash})
                          </p>
                          {cached.run ? (
                            <pre className="max-h-48 overflow-auto rounded-md bg-blue-50 p-2 font-mono text-[11px] leading-relaxed dark:bg-blue-950/30">
                              {cached.run.length > 3000
                                ? cached.run.slice(0, 3000) +
                                  "\n... (truncated)"
                                : cached.run}
                            </pre>
                          ) : (
                            <p className="text-xs italic text-muted-foreground">
                              Template not in archive (run predates prompt
                              versioning)
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold text-violet-600">
                            Current ({currentHash ?? "removed"})
                          </p>
                          {cached.current ? (
                            <pre className="max-h-48 overflow-auto rounded-md bg-violet-50 p-2 font-mono text-[11px] leading-relaxed dark:bg-violet-950/30">
                              {cached.current.length > 3000
                                ? cached.current.slice(0, 3000) +
                                  "\n... (truncated)"
                                : cached.current}
                            </pre>
                          ) : (
                            <p className="text-xs italic text-muted-foreground">
                              {isRemoved
                                ? "This prompt has been removed from the codebase"
                                : "Current template not yet archived (will be archived on next run)"}
                            </p>
                          )}
                        </div>
                      </div>
                    ) : (
                      !loadingDiff && (
                        <p className="text-xs italic text-muted-foreground">
                          Click to load template diff
                        </p>
                      )
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

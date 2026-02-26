import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RunsContent } from "@/components/runs/runs-content";
import { listRuns } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";
import type { PipelineRun } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

async function fetchInitialRuns(): Promise<{
  runs: PipelineRun[];
  error: string | null;
}> {
  try {
    const runs = await listRuns(200, 0);
    return { runs, error: null };
  } catch (err) {
    logger.error("[runs] Failed to fetch initial runs", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { runs: [], error: "Failed to load runs" };
  }
}

function RunsSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-32" />
      </div>
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

async function RunsData() {
  const { runs, error } = await fetchInitialRuns();
  return <RunsContent initialRuns={runs} initialError={error} />;
}

export default function RunsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pipeline Runs</h1>
          <p className="mt-1 text-muted-foreground">
            View and manage your discovery pipeline runs
          </p>
        </div>
        <Button asChild>
          <Link href="/configure">New Discovery</Link>
        </Button>
      </div>

      <Suspense fallback={<RunsSkeleton />}>
        <RunsData />
      </Suspense>
    </div>
  );
}

"use client";

import { useState, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRadarOverview } from "@/components/charts/lazy";
import {
  RunHeader,
  IndustryBanner,
  RunProgressCard,
  RunFailedCard,
  RunCancelledCard,
  SummaryCardsSection,
  RunCompletedTabs,
  PbiResultBanner,
  PbiScanDialog,
} from "@/components/pipeline/run-detail";
import { computeDomainStats } from "@/lib/domain/scoring";
import { computeIndustryCoverage } from "@/lib/domain/industry-coverage";
import { toast } from "sonner";
import { useIndustryOutcomes } from "@/lib/hooks/use-industry-outcomes";
import { useRunDetail } from "@/lib/hooks/use-run-detail";
import { useUseCaseUpdate } from "@/lib/hooks/use-usecase-update";

export default function RunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();
  const {
    getOutcome,
    getOptions: getIndustryOptions,
    loading: outcomesLoading,
  } = useIndustryOutcomes();
  const getIndustryOutcome = (id: string) => getOutcome(id) ?? null;

  const {
    run,
    useCases,
    setUseCases,
    lineageDiscoveredFqns,
    scanId,
    loading,
    error,
    fetchPromptLogs,
    genieGenerating,
    dashboardGenerating,
    promptLogs,
    promptStats,
    logsLoading,
    isRerunning,
    industryEditing,
    setIndustryEditing,
    industrySaving,
    handleIndustryAssign,
    handleRerun,
    pbiDialogOpen,
    setPbiDialogOpen,
    pbiScans,
    pbiSelectedScan,
    setPbiSelectedScan,
    pbiEnriching,
    pbiResult,
    setPbiResult,
    openPbiDialog,
    enrichWithPbi,
  } = useRunDetail(runId);

  const [activeTab, setActiveTab] = useState("overview");
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const onUseCaseUpdate = useUseCaseUpdate(runId, useCases, setUseCases);

  const handleCancel = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Cancel failed");
      }
      toast.success("Pipeline cancellation requested");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel pipeline");
    }
  }, [runId]);

  const handleResume = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/execute?resume=true`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Resume failed");
      }
      toast.success("Pipeline resuming from last successful step");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Resume failed");
    }
  }, [runId]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Run not found"}
        </div>
        <Button variant="outline" asChild>
          <Link href="/runs">Back to Runs</Link>
        </Button>
      </div>
    );
  }

  const isCompleted = run.status === "completed";
  const isActive = run.status === "running" || run.status === "pending";
  const domainStats = isCompleted ? computeDomainStats(useCases) : [];
  const hasFabricTag =
    run.contextSources?.fabric?.scanId != null || run.config.fabricScanId != null;
  const industryOutcome = run.config.industry ? getIndustryOutcome(run.config.industry) : null;
  const coverageData =
    industryOutcome && useCases.length > 0
      ? computeIndustryCoverage(industryOutcome, useCases)
      : null;

  return (
    <div className="space-y-6">
      <RunHeader
        run={run}
        runId={runId}
        scanId={scanId}
        hasFabricTag={hasFabricTag}
        onDuplicate={() => {
          sessionStorage.setItem("forge:duplicate-config", JSON.stringify(run.config));
          router.push("/configure");
        }}
        onOpenPbiDialog={openPbiDialog}
      />

      <IndustryBanner
        outcome={run.config.industry ? getIndustryOutcome(run.config.industry) : null}
        industryEditing={industryEditing}
        industrySaving={industrySaving}
        outcomesLoading={outcomesLoading}
        industryId={run.config.industry || null}
        industryAutoDetected={run.industryAutoDetected}
        isCompleted={isCompleted}
        useCasesLength={useCases.length}
        getOptions={getIndustryOptions}
        onAssign={handleIndustryAssign}
        onEdit={() => setIndustryEditing(true)}
        onCancelEdit={() => setIndustryEditing(false)}
      />

      {isActive && <RunProgressCard run={run} runId={runId} onCancel={handleCancel} />}
      {run.status === "failed" && run.errorMessage && (
        <RunFailedCard run={run} runId={runId} onResume={handleResume} />
      )}
      {run.status === "cancelled" && (
        <RunCancelledCard run={run} runId={runId} onResume={handleResume} />
      )}

      {isCompleted && (
        <>
          <SummaryCardsSection
            useCases={useCases}
            coverageData={coverageData}
            onUseCasesClick={() => setActiveTab("usecases")}
            onOverviewClick={() => setActiveTab("overview")}
            onInsightsOpen={() => setInsightsOpen(true)}
            onOutcomeMapClick={run.config.industry ? () => setActiveTab("outcome-map") : undefined}
          />
          {useCases.length > 1 && (
            <div>
              <ScoreRadarOverview useCases={useCases} />
            </div>
          )}
          <RunCompletedTabs
            run={run}
            useCases={useCases}
            lineageDiscoveredFqns={lineageDiscoveredFqns}
            runId={runId}
            domainStats={domainStats}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            insightsOpen={insightsOpen}
            setInsightsOpen={setInsightsOpen}
            detailsOpen={detailsOpen}
            setDetailsOpen={setDetailsOpen}
            getIndustryOutcome={getIndustryOutcome}
            onIndustryEdit={() => setIndustryEditing(true)}
            promptLogs={promptLogs}
            promptStats={promptStats}
            logsLoading={logsLoading}
            genieGenerating={genieGenerating}
            dashboardGenerating={dashboardGenerating}
            onFetchPromptLogs={fetchPromptLogs}
            onRerun={handleRerun}
            isRerunning={isRerunning}
            onUseCaseUpdate={onUseCaseUpdate}
          />
        </>
      )}

      {isCompleted && useCases.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">
              Pipeline completed but no use cases were generated.
            </p>
          </CardContent>
        </Card>
      )}

      {pbiResult && (
        <PbiResultBanner
          overlapCount={pbiResult.overlapCount}
          total={pbiResult.total}
          onDismiss={() => setPbiResult(null)}
        />
      )}

      <PbiScanDialog
        open={pbiDialogOpen}
        onOpenChange={setPbiDialogOpen}
        scans={pbiScans}
        selectedScanId={pbiSelectedScan}
        onSelectScan={setPbiSelectedScan}
        enriching={pbiEnriching}
        onEnrich={enrichWithPbi}
      />
    </div>
  );
}

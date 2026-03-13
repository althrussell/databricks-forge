"use client";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { saveSettings, DEFAULT_CATALOG_RESOURCE_PREFIX } from "@/lib/settings";
import { DEFAULT_DEPTH_CONFIGS } from "@/lib/domain/types";
import { PageHeader } from "@/components/page-header";
import {
  ProfileSettings,
  IndustrySettings,
  DataSamplingSettings,
  EstateScanSettings,
  SemanticSearchSettings,
  DiscoveryDepthSettings,
  GenieDefaultsSettings,
  ExportSettings,
  AboutSettings,
  DataManagementSettings,
} from "@/components/settings";
import { useSettingsState } from "@/components/settings/use-settings-state";
import { DemoModeSettings } from "@/components/demo/demo-settings";

export default function SettingsPage() {
  const state = useSettingsState();
  const {
    sampleRowsPerTable,
    setSampleRowsPerTable,
    defaultExportFormat,
    setDefaultExportFormat,
    notebookPath,
    setNotebookPath,
    defaultDiscoveryDepth,
    setDefaultDiscoveryDepth,
    depthConfigs,
    setDepthConfigs,
    genieDefaults,
    setGenieDefaults,
    estateScanEnabled,
    setEstateScanEnabled,
    assetDiscoveryEnabled,
    setAssetDiscoveryEnabled,
    genieDeployAuthMode,
    setGenieDeployAuthMode,
    semanticSearchEnabled,
    setSemanticSearchEnabled,
    benchmarksEnabled,
    setBenchmarksEnabled,
    questionComplexity,
    setQuestionComplexity,
    catalogResourcePrefix,
    setCatalogResourcePrefix,
    industry,
    setIndustry,
    benchmarksServerEnabled,
    metricViewsServerEnabled,
    embeddingAvailable,
    rebuildingEmbeddings,
    setRebuildingEmbeddings,
    embeddingCount,
    setEmbeddingCount,
    profile,
    deleting,
    setDeleting,
    updateDepthParam,
    demoModeEnabled,
  } = state;

  const handleRebuildEmbeddings = async () => {
    setRebuildingEmbeddings(true);
    try {
      const resp = await fetch("/api/embeddings/backfill", { method: "POST" });
      const data = await resp.json();
      if (resp.ok) {
        toast.success(data.message ?? "Embeddings rebuilt successfully");
        const statsResp = await fetch("/api/embeddings/status");
        if (statsResp.ok) {
          const stats = await statsResp.json();
          if (typeof stats.totalRecords === "number") setEmbeddingCount(stats.totalRecords);
        }
      } else {
        toast.error(data.message ?? "Failed to rebuild embeddings");
      }
    } catch {
      toast.error("Network error while rebuilding embeddings");
    } finally {
      setRebuildingEmbeddings(false);
    }
  };

  const handleSave = () => {
    saveSettings({
      sampleRowsPerTable,
      defaultExportFormat,
      notebookPath,
      defaultDiscoveryDepth,
      discoveryDepthConfigs: depthConfigs,
      genieEngineDefaults: genieDefaults,
      estateScanEnabled,
      assetDiscoveryEnabled,
      genieDeployAuthMode,
      semanticSearchEnabled,
      benchmarksEnabled,
      questionComplexity,
      catalogResourcePrefix,
      industry,
    });
    toast.success("Settings saved");
  };

  const handleClearLocalData = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("forge-settings");
      localStorage.removeItem("forge-ai-settings");
      setSampleRowsPerTable(0);
      setDefaultExportFormat("excel");
      setNotebookPath("./forge_gen/");
      setDefaultDiscoveryDepth("balanced");
      setDepthConfigs({ ...DEFAULT_DEPTH_CONFIGS });
      setGenieDefaults({
        engineEnabled: true,
        maxTablesPerSpace: 25,
        maxAutoSpaces: 0,
        llmRefinement: true,
        generateBenchmarks: true,
        generateMetricViews: true,
        autoTimePeriods: true,
        generateTrustedAssets: true,
        fiscalYearStartMonth: 1,
        entityMatchingMode: "auto",
        qualityPreset: "balanced",
      });
      setEstateScanEnabled(false);
      setAssetDiscoveryEnabled(false);
      setGenieDeployAuthMode("obo");
      setSemanticSearchEnabled(true);
      setQuestionComplexity({
        genieEngine: "simple",
        adhocGenie: "simple",
        metadataGenie: "simple",
      });
      setCatalogResourcePrefix(DEFAULT_CATALOG_RESOURCE_PREFIX);
      setIndustry("");
      toast.success("Local settings cleared");
    }
  };

  const handleDeleteAllData = async () => {
    setDeleting(true);
    try {
      const requestDelete = async () =>
        fetch("/api/data", {
          method: "DELETE",
          headers: { "x-confirm-delete": "delete-all-data" },
        });

      let res = await requestDelete();
      if (res.status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        res = await requestDelete();
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      handleClearLocalData();
      toast.success("All data deleted — app has been reset");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete data");
    } finally {
      setDeleting(false);
    }
  };

  const loaded = typeof window !== "undefined";

  if (!loaded) {
    return (
      <div className="mx-auto max-w-[1400px] space-y-8">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-5 w-96" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="Settings"
        subtitle="Configure application-wide defaults and preferences."
      />

      <ProfileSettings profile={profile} />

      <IndustrySettings industry={industry} onIndustryChange={setIndustry} />

      <DataSamplingSettings
        sampleRowsPerTable={sampleRowsPerTable}
        onSampleRowsPerTableChange={setSampleRowsPerTable}
      />

      <EstateScanSettings
        estateScanEnabled={estateScanEnabled}
        onEstateScanEnabledChange={setEstateScanEnabled}
        assetDiscoveryEnabled={assetDiscoveryEnabled}
        onAssetDiscoveryEnabledChange={setAssetDiscoveryEnabled}
        benchmarksEnabled={benchmarksEnabled}
        onBenchmarksEnabledChange={setBenchmarksEnabled}
        benchmarksServerEnabled={benchmarksServerEnabled}
      />

      {embeddingAvailable && (
        <SemanticSearchSettings
          semanticSearchEnabled={semanticSearchEnabled}
          onSemanticSearchEnabledChange={setSemanticSearchEnabled}
          embeddingCount={embeddingCount}
          rebuildingEmbeddings={rebuildingEmbeddings}
          onRebuildEmbeddings={handleRebuildEmbeddings}
        />
      )}

      <DiscoveryDepthSettings
        defaultDiscoveryDepth={defaultDiscoveryDepth}
        onDefaultDiscoveryDepthChange={setDefaultDiscoveryDepth}
        depthConfigs={depthConfigs}
        onDepthConfigsChange={setDepthConfigs}
        updateDepthParam={updateDepthParam}
      />

      <GenieDefaultsSettings
        genieDefaults={genieDefaults}
        onGenieDefaultsChange={setGenieDefaults}
        genieDeployAuthMode={genieDeployAuthMode}
        onGenieDeployAuthModeChange={setGenieDeployAuthMode}
        questionComplexity={questionComplexity}
        onQuestionComplexityChange={setQuestionComplexity}
        metricViewsServerEnabled={metricViewsServerEnabled ?? false}
      />

      <ExportSettings
        defaultExportFormat={defaultExportFormat}
        onDefaultExportFormatChange={setDefaultExportFormat}
        notebookPath={notebookPath}
        onNotebookPathChange={setNotebookPath}
        catalogResourcePrefix={catalogResourcePrefix}
        onCatalogResourcePrefixChange={setCatalogResourcePrefix}
      />

      <AboutSettings profile={profile} />

      {demoModeEnabled && <DemoModeSettings />}

      <DataManagementSettings
        onClearLocalData={handleClearLocalData}
        onDeleteAllData={handleDeleteAllData}
        deleting={deleting}
      />

      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg">
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}

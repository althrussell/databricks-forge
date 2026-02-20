"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { GenieSpacesTab } from "./genie-spaces-tab";
import { GenieConfigEditor } from "./genie-config-editor";
import { GenieSpacePreview } from "./genie-space-preview";
import type { GenieEngineConfig } from "@/lib/genie/types";
import { defaultGenieEngineConfig } from "@/lib/genie/types";
import { loadSettings } from "@/lib/settings";

interface GenieWorkbenchProps {
  runId: string;
}

function applyGlobalDefaults(cfg: GenieEngineConfig): GenieEngineConfig {
  if (typeof window === "undefined") return cfg;
  const { genieEngineDefaults: g } = loadSettings();
  cfg.maxTablesPerSpace = g.maxTablesPerSpace;
  cfg.llmRefinement = g.llmRefinement;
  cfg.generateBenchmarks = g.generateBenchmarks;
  cfg.generateMetricViews = g.generateMetricViews;
  cfg.autoTimePeriods = g.autoTimePeriods;
  cfg.generateTrustedAssets = g.generateTrustedAssets;
  cfg.fiscalYearStartMonth = g.fiscalYearStartMonth;
  cfg.entityMatchingMode = g.entityMatchingMode;
  return cfg;
}

export function GenieWorkbench({ runId }: GenieWorkbenchProps) {
  const [engineEnabled, setEngineEnabled] = useState(() => {
    if (typeof window === "undefined") return true;
    return loadSettings().genieEngineDefaults.engineEnabled;
  });
  const [config, setConfig] = useState<GenieEngineConfig>(() => {
    return applyGlobalDefaults(defaultGenieEngineConfig());
  });
  const [configVersion, setConfigVersion] = useState(0);
  const [configLoading, setConfigLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const [domains, setDomains] = useState<string[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<Set<string>>(new Set());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchDomains = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/genie-recommendations`);
      const data = await res.json();
      if (res.ok && data.recommendations) {
        const names: string[] = data.recommendations.map(
          (r: { domain: string }) => r.domain
        );
        setDomains(names);
      }
    } catch { /* ignore */ }
  }, [runId]);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/runs/${runId}/genie-engine/generate/status`);
        const data = await res.json();
        if (res.ok) {
          setGenProgress(data.percent ?? 0);
          setGenMessage(data.message ?? "");
          if (data.status === "completed") {
            stopPolling();
            setGenerating(false);
            setGenProgress(100);
            setSelectedDomains(new Set());
            fetchDomains();
            toast.success(`Genie Engine complete: ${data.domainCount} domain${data.domainCount !== 1 ? "s" : ""} generated`);
          } else if (data.status === "failed") {
            stopPolling();
            setGenerating(false);
            toast.error(data.error || "Generation failed");
          }
        }
      } catch {
        // Silently retry
      }
    }, 2000);
  }, [runId, stopPolling, fetchDomains]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  // Auto-detect an in-progress Genie job (e.g. fired by the pipeline)
  useEffect(() => {
    let cancelled = false;
    async function checkActiveJob() {
      try {
        const res = await fetch(`/api/runs/${runId}/genie-engine/generate/status`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.status === "generating") {
            setGenerating(true);
            setGenProgress(data.percent ?? 0);
            setGenMessage(data.message ?? "");
            startPolling();
          }
        }
      } catch {
        // ignore -- no active job or endpoint unavailable
      }
    }
    checkActiveJob();
    return () => { cancelled = true; };
  }, [runId, startPolling]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/genie-engine/config`);
      const data = await res.json();
      if (res.ok) {
        setConfig(applyGlobalDefaults(data.config as GenieEngineConfig));
        setConfigVersion(data.version);
      }
    } catch {
      // Use defaults
    } finally {
      setConfigLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    fetchConfig();
    fetchDomains();
  }, [fetchConfig, fetchDomains]);

  const handleConfigChange = useCallback((newConfig: GenieEngineConfig) => {
    setConfig(newConfig);
    setConfigDirty(true);
  }, []);

  const handleSaveConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/genie-engine/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfigVersion(data.version);
        setConfigDirty(false);
        toast.success("Engine configuration saved");
      } else {
        toast.error(data.error || "Failed to save configuration");
      }
    } catch {
      toast.error("Failed to save configuration");
    }
  }, [runId, config]);

  const handleRegenerate = useCallback(async (filterDomains?: string[]) => {
    if (configDirty) {
      await handleSaveConfig();
    }

    setGenerating(true);
    setGenProgress(0);
    setGenMessage(filterDomains?.length ? `Regenerating ${filterDomains.length} domain${filterDomains.length !== 1 ? "s" : ""}...` : "Starting...");
    try {
      const body = filterDomains?.length ? JSON.stringify({ domains: filterDomains }) : undefined;
      const res = await fetch(`/api/runs/${runId}/genie-engine/generate`, {
        method: "POST",
        ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      });
      const data = await res.json();
      if (res.ok) {
        startPolling();
      } else {
        toast.error(data.error || "Failed to start generation");
        setGenerating(false);
      }
    } catch {
      toast.error("Failed to start generation");
      setGenerating(false);
    }
  }, [runId, configDirty, handleSaveConfig, startPolling]);

  if (configLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Engine v{configVersion}
            </Badge>
            {configDirty && (
              <Badge variant="secondary" className="text-xs text-amber-600">
                Unsaved changes
              </Badge>
            )}
            {config.llmRefinement && (
              <Badge className="bg-violet-500/10 text-violet-600 text-xs">
                LLM Enabled
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!engineEnabled && (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                Engine Disabled
              </Badge>
            )}
            {configDirty && engineEnabled && (
              <Button variant="outline" size="sm" onClick={handleSaveConfig}>
                Save Config
              </Button>
            )}
            {selectedDomains.size > 0 ? (
              <Button
                size="sm"
                onClick={() => handleRegenerate([...selectedDomains])}
                disabled={generating || !engineEnabled}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {generating ? "Generating..." : `Regenerate ${selectedDomains.size} Domain${selectedDomains.size !== 1 ? "s" : ""}`}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => handleRegenerate()}
                disabled={generating || !engineEnabled}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {generating ? "Generating..." : "Regenerate All"}
              </Button>
            )}
          </div>
        </div>

        {/* Domain picker */}
        {domains.length > 1 && !generating && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Domains:</span>
            {domains.map((d) => (
              <label
                key={d}
                className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors hover:bg-muted/50 data-[selected=true]:border-violet-400 data-[selected=true]:bg-violet-500/10"
                data-selected={selectedDomains.has(d)}
              >
                <Checkbox
                  checked={selectedDomains.has(d)}
                  onCheckedChange={(checked) => {
                    setSelectedDomains((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(d);
                      else next.delete(d);
                      return next;
                    });
                  }}
                  className="h-3 w-3"
                />
                {d}
              </label>
            ))}
            {selectedDomains.size > 0 && (
              <button
                onClick={() => setSelectedDomains(new Set())}
                className="text-[10px] text-muted-foreground underline hover:text-foreground"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {generating && (
          <div className="space-y-1">
            <Progress value={genProgress} className="h-2" />
            <p className="text-[10px] text-muted-foreground">{genMessage}</p>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="config">Engine Config</TabsTrigger>
          <TabsTrigger value="preview">Space Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <GenieSpacesTab runId={runId} />
        </TabsContent>

        <TabsContent value="config" className="mt-4">
          <GenieConfigEditor
            config={config}
            onChange={handleConfigChange}
            disabled={!engineEnabled}
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <GenieSpacePreview runId={runId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

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

export function GenieWorkbench({ runId }: GenieWorkbenchProps) {
  const [config, setConfig] = useState<GenieEngineConfig>(() => {
    const cfg = defaultGenieEngineConfig();
    if (typeof window !== "undefined") {
      const { genieEngineDefaults } = loadSettings();
      cfg.maxTablesPerSpace = genieEngineDefaults.maxTablesPerSpace;
      cfg.llmRefinement = genieEngineDefaults.llmRefinement;
      cfg.generateBenchmarks = genieEngineDefaults.generateBenchmarks;
      cfg.generateMetricViews = genieEngineDefaults.generateMetricViews;
      cfg.autoTimePeriods = genieEngineDefaults.autoTimePeriods;
    }
    return cfg;
  });
  const [configVersion, setConfigVersion] = useState(0);
  const [configLoading, setConfigLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genMessage, setGenMessage] = useState("");
  const [configDirty, setConfigDirty] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

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
  }, [runId, stopPolling]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${runId}/genie-engine/config`);
      const data = await res.json();
      if (res.ok) {
        const cfg = data.config as GenieEngineConfig;
        // Apply global Genie Engine defaults from Settings
        const { genieEngineDefaults } = loadSettings();
        cfg.maxTablesPerSpace = genieEngineDefaults.maxTablesPerSpace;
        cfg.llmRefinement = genieEngineDefaults.llmRefinement;
        cfg.generateBenchmarks = genieEngineDefaults.generateBenchmarks;
        cfg.generateMetricViews = genieEngineDefaults.generateMetricViews;
        cfg.autoTimePeriods = genieEngineDefaults.autoTimePeriods;
        setConfig(cfg);
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
  }, [fetchConfig]);

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

  const handleRegenerate = useCallback(async () => {
    if (configDirty) {
      await handleSaveConfig();
    }

    setGenerating(true);
    setGenProgress(0);
    setGenMessage("Starting...");
    try {
      const res = await fetch(`/api/runs/${runId}/genie-engine/generate`, {
        method: "POST",
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
            {configDirty && (
              <Button variant="outline" size="sm" onClick={handleSaveConfig}>
                Save Config
              </Button>
            )}
            <Button
              size="sm"
              onClick={handleRegenerate}
              disabled={generating}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {generating ? "Generating..." : "Regenerate Spaces"}
            </Button>
          </div>
        </div>

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
          />
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <GenieSpacePreview runId={runId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

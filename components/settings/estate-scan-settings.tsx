"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScanLine, Search, Target } from "lucide-react";

interface EstateScanSettingsProps {
  estateScanEnabled: boolean;
  onEstateScanEnabledChange: (value: boolean) => void;
  assetDiscoveryEnabled: boolean;
  onAssetDiscoveryEnabledChange: (value: boolean) => void;
  benchmarksEnabled: boolean;
  onBenchmarksEnabledChange: (value: boolean) => void;
  benchmarksServerEnabled: boolean | null;
}

function ToggleButton({
  enabled,
  onClick,
  disabled,
  activeColor = "bg-emerald-500",
}: {
  enabled: boolean;
  onClick: () => void;
  disabled?: boolean;
  activeColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${
        disabled
          ? "cursor-not-allowed bg-muted opacity-50"
          : enabled
            ? `cursor-pointer ${activeColor}`
            : "cursor-pointer bg-muted"
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
          enabled ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function EstateScanSettings({
  estateScanEnabled,
  onEstateScanEnabledChange,
  assetDiscoveryEnabled,
  onAssetDiscoveryEnabledChange,
  benchmarksEnabled,
  onBenchmarksEnabledChange,
  benchmarksServerEnabled,
}: EstateScanSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScanLine className="h-5 w-5" />
          Estate Scan
        </CardTitle>
        <CardDescription>
          Run environment intelligence (domain classification, PII detection, health scoring,
          lineage enrichment) during pipeline runs. This increases run time but provides a
          comprehensive estate view alongside use case discovery.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
            estateScanEnabled ? "border-emerald-500/50 bg-emerald-500/5" : "border-muted"
          }`}
        >
          <div>
            <p className="text-sm font-medium">Estate Scan during pipeline runs</p>
            <p className="text-xs text-muted-foreground">
              {estateScanEnabled
                ? "Enabled — metadata extraction will include full environment intelligence enrichment"
                : "Disabled — pipeline runs will skip the estate scan enrichment pass (faster runs)"}
            </p>
          </div>
          <ToggleButton
            enabled={estateScanEnabled}
            onClick={() => onEstateScanEnabledChange(!estateScanEnabled)}
          />
        </div>

        <div
          className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
            assetDiscoveryEnabled ? "border-sky-500/50 bg-sky-500/5" : "border-muted"
          }`}
        >
          <div className="flex items-start gap-3">
            <Search
              className={`mt-0.5 h-4 w-4 shrink-0 ${assetDiscoveryEnabled ? "text-sky-500" : "text-muted-foreground"}`}
            />
            <div>
              <p className="text-sm font-medium">Asset Discovery during pipeline runs</p>
              <p className="text-xs text-muted-foreground">
                {assetDiscoveryEnabled
                  ? "Enabled — existing Genie spaces, dashboards, and metric views will be discovered and used to improve recommendations"
                  : "Disabled — recommendations are generated without awareness of existing analytics assets (faster runs)"}
              </p>
            </div>
          </div>
          <ToggleButton
            enabled={assetDiscoveryEnabled}
            onClick={() => onAssetDiscoveryEnabledChange(!assetDiscoveryEnabled)}
            activeColor="bg-sky-500"
          />
        </div>

        <div
          className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
            benchmarksEnabled && benchmarksServerEnabled
              ? "border-amber-500/50 bg-amber-500/5"
              : "border-muted"
          }`}
        >
          <div className="flex items-start gap-3">
            <Target
              className={`mt-0.5 h-4 w-4 shrink-0 ${benchmarksEnabled && benchmarksServerEnabled ? "text-amber-500" : "text-muted-foreground"}`}
            />
            <div>
              <p className="text-sm font-medium">Benchmark Catalog</p>
              <p className="text-xs text-muted-foreground">
                {benchmarksServerEnabled === false
                  ? "Unavailable — server-side flag FORGE_BENCHMARKS_ENABLED is not set in the deployment configuration"
                  : benchmarksEnabled
                    ? "Enabled — industry benchmarks are embedded and injected into pipeline prompts and Ask Forge retrieval"
                    : "Disabled — pipeline uses generic advisory context; benchmark catalog page and API are hidden"}
              </p>
            </div>
          </div>
          <ToggleButton
            enabled={benchmarksEnabled && !!benchmarksServerEnabled}
            onClick={() => benchmarksServerEnabled && onBenchmarksEnabledChange(!benchmarksEnabled)}
            disabled={!benchmarksServerEnabled}
            activeColor="bg-amber-500"
          />
        </div>
      </CardContent>
    </Card>
  );
}

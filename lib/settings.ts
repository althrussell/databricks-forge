/**
 * App-level settings persisted in localStorage.
 *
 * These are user preferences that apply across runs (not per-run config).
 * They are read by the pipeline config form at submission time.
 */

import type { DiscoveryDepth, DiscoveryDepthConfig } from "@/lib/domain/types";
import { DISCOVERY_DEPTHS, DEFAULT_DEPTH_CONFIGS } from "@/lib/domain/types";

export type GenieAuthMode = "obo" | "sp";
const VALID_AUTH_MODES = new Set<GenieAuthMode>(["obo", "sp"]);

export interface GenieEngineDefaults {
  engineEnabled: boolean;
  maxTablesPerSpace: number;
  /** Max domains to auto-analyse per run (0 = unlimited). */
  maxAutoSpaces: number;
  llmRefinement: boolean;
  generateBenchmarks: boolean;
  generateMetricViews: boolean;
  autoTimePeriods: boolean;
  generateTrustedAssets: boolean;
  fiscalYearStartMonth: number;
  entityMatchingMode: "auto" | "manual" | "off";
}

export interface AppSettings {
  /** Number of sample rows to fetch per table for discovery & SQL generation (0 = disabled) */
  sampleRowsPerTable: number;
  /** Default export format */
  defaultExportFormat: string;
  /** Default notebook deployment path */
  notebookPath: string;
  /** Default discovery depth for new pipeline runs */
  defaultDiscoveryDepth: DiscoveryDepth;
  /** Tunable parameters for each discovery depth level */
  discoveryDepthConfigs: Record<DiscoveryDepth, DiscoveryDepthConfig>;
  /** Global Genie Engine defaults applied to new runs */
  genieEngineDefaults: GenieEngineDefaults;
  /** Whether to run estate scan (environment intelligence) during pipeline runs (default: false) */
  estateScanEnabled: boolean;
  /** Whether to discover existing analytics assets (Genie spaces, dashboards, metric views) during runs (default: false) */
  assetDiscoveryEnabled: boolean;
  /** Auth mode for Genie Space deployments: "obo" (user token) or "sp" (service principal) */
  genieDeployAuthMode: GenieAuthMode;
  /** Whether semantic search, knowledge base, and RAG retrieval are enabled in the UI (default: true). Embeddings are still generated regardless. */
  semanticSearchEnabled: boolean;
}

const STORAGE_KEY = "forge-ai-settings";

const DEFAULT_GENIE_ENGINE: GenieEngineDefaults = {
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
};

const DEFAULTS: AppSettings = {
  sampleRowsPerTable: 0,
  defaultExportFormat: "excel",
  notebookPath: "./forge_gen/",
  defaultDiscoveryDepth: "balanced",
  discoveryDepthConfigs: { ...DEFAULT_DEPTH_CONFIGS },
  genieEngineDefaults: { ...DEFAULT_GENIE_ENGINE },
  estateScanEnabled: false,
  assetDiscoveryEnabled: false,
  genieDeployAuthMode: "obo",
  semanticSearchEnabled: true,
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      sampleRowsPerTable:
        typeof parsed.sampleRowsPerTable === "number"
          ? parsed.sampleRowsPerTable
          : DEFAULTS.sampleRowsPerTable,
      defaultExportFormat:
        typeof parsed.defaultExportFormat === "string"
          ? parsed.defaultExportFormat
          : DEFAULTS.defaultExportFormat,
      notebookPath:
        typeof parsed.notebookPath === "string"
          ? parsed.notebookPath
          : DEFAULTS.notebookPath,
      defaultDiscoveryDepth:
        typeof parsed.defaultDiscoveryDepth === "string" &&
        (DISCOVERY_DEPTHS as readonly string[]).includes(parsed.defaultDiscoveryDepth)
          ? (parsed.defaultDiscoveryDepth as DiscoveryDepth)
          : DEFAULTS.defaultDiscoveryDepth,
      discoveryDepthConfigs: parseDepthConfigs(parsed.discoveryDepthConfigs),
      genieEngineDefaults: parseGenieEngineDefaults(parsed.genieEngineDefaults),
      estateScanEnabled:
        typeof parsed.estateScanEnabled === "boolean"
          ? parsed.estateScanEnabled
          : DEFAULTS.estateScanEnabled,
      assetDiscoveryEnabled:
        typeof parsed.assetDiscoveryEnabled === "boolean"
          ? parsed.assetDiscoveryEnabled
          : DEFAULTS.assetDiscoveryEnabled,
      genieDeployAuthMode:
        typeof parsed.genieDeployAuthMode === "string" &&
        VALID_AUTH_MODES.has(parsed.genieDeployAuthMode as GenieAuthMode)
          ? (parsed.genieDeployAuthMode as GenieAuthMode)
          : DEFAULTS.genieDeployAuthMode,
      semanticSearchEnabled:
        typeof parsed.semanticSearchEnabled === "boolean"
          ? parsed.semanticSearchEnabled
          : DEFAULTS.semanticSearchEnabled,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function isValidDepthConfig(v: unknown): v is DiscoveryDepthConfig {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.batchTargetMin === "number" &&
    typeof o.batchTargetMax === "number" &&
    typeof o.qualityFloor === "number" &&
    typeof o.adaptiveCap === "number"
  );
}

function parseDepthConfigs(
  raw: unknown
): Record<DiscoveryDepth, DiscoveryDepthConfig> {
  const result = { ...DEFAULT_DEPTH_CONFIGS };
  if (typeof raw !== "object" || raw === null) return result;
  const obj = raw as Record<string, unknown>;
  for (const depth of DISCOVERY_DEPTHS) {
    if (isValidDepthConfig(obj[depth])) {
      result[depth] = obj[depth];
    }
  }
  return result;
}

const VALID_ENTITY_MODES = new Set(["auto", "manual", "off"]);

function parseGenieEngineDefaults(raw: unknown): GenieEngineDefaults {
  const result = { ...DEFAULT_GENIE_ENGINE };
  if (typeof raw !== "object" || raw === null) return result;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.engineEnabled === "boolean") result.engineEnabled = obj.engineEnabled;
  if (typeof obj.maxTablesPerSpace === "number") result.maxTablesPerSpace = obj.maxTablesPerSpace;
  if (typeof obj.maxAutoSpaces === "number") result.maxAutoSpaces = obj.maxAutoSpaces;
  if (typeof obj.llmRefinement === "boolean") result.llmRefinement = obj.llmRefinement;
  if (typeof obj.generateBenchmarks === "boolean") result.generateBenchmarks = obj.generateBenchmarks;
  if (typeof obj.generateMetricViews === "boolean") result.generateMetricViews = obj.generateMetricViews;
  if (typeof obj.autoTimePeriods === "boolean") result.autoTimePeriods = obj.autoTimePeriods;
  if (typeof obj.generateTrustedAssets === "boolean") result.generateTrustedAssets = obj.generateTrustedAssets;
  if (typeof obj.fiscalYearStartMonth === "number") result.fiscalYearStartMonth = obj.fiscalYearStartMonth;
  if (typeof obj.entityMatchingMode === "string" && VALID_ENTITY_MODES.has(obj.entityMatchingMode))
    result.entityMatchingMode = obj.entityMatchingMode as GenieEngineDefaults["entityMatchingMode"];
  return result;
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }
  return merged;
}

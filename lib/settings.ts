/**
 * App-level settings persisted in localStorage.
 *
 * These are user preferences that apply across runs (not per-run config).
 * They are read by the pipeline config form at submission time.
 */

import type { DiscoveryDepth, DiscoveryDepthConfig } from "@/lib/domain/types";
import { DISCOVERY_DEPTHS, DEFAULT_DEPTH_CONFIGS } from "@/lib/domain/types";

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
}

const STORAGE_KEY = "forge-ai-settings";

const DEFAULTS: AppSettings = {
  sampleRowsPerTable: 0,
  defaultExportFormat: "excel",
  notebookPath: "./forge_gen/",
  defaultDiscoveryDepth: "balanced",
  discoveryDepthConfigs: { ...DEFAULT_DEPTH_CONFIGS },
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

/** Resolve the config for a specific depth from saved settings. */
export function resolveDepthConfig(depth: DiscoveryDepth): DiscoveryDepthConfig {
  const settings = loadSettings();
  return settings.discoveryDepthConfigs[depth];
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }
  return merged;
}

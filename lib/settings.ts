/**
 * App-level settings persisted in localStorage.
 *
 * These are user preferences that apply across runs (not per-run config).
 * They are read by the pipeline config form at submission time.
 */

import type { DiscoveryDepth } from "@/lib/domain/types";
import { DISCOVERY_DEPTHS } from "@/lib/domain/types";

export interface AppSettings {
  /** Number of sample rows to fetch per table for discovery & SQL generation (0 = disabled) */
  sampleRowsPerTable: number;
  /** Default export format */
  defaultExportFormat: string;
  /** Default notebook deployment path */
  notebookPath: string;
  /** Default discovery depth for new pipeline runs */
  defaultDiscoveryDepth: DiscoveryDepth;
}

const STORAGE_KEY = "forge-ai-settings";

const DEFAULTS: AppSettings = {
  sampleRowsPerTable: 0,
  defaultExportFormat: "excel",
  notebookPath: "./forge_gen/",
  defaultDiscoveryDepth: "balanced",
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
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Partial<AppSettings>): AppSettings {
  const current = loadSettings();
  const merged = { ...current, ...settings };
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  }
  return merged;
}

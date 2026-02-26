/**
 * Types for the Meta Data Genie feature.
 *
 * The Meta Data Genie creates a Genie Space backed by curated views over
 * system.information_schema, enabling business analysts to ask natural
 * language questions about their data estate.
 */

import type { IndustryOutcome } from "@/lib/domain/industry-outcomes";

// ---------------------------------------------------------------------------
// Industry Detection (LLM output)
// ---------------------------------------------------------------------------

export interface IndustryDetectionResult {
  industries: string;
  domains: string[];
  duplication_notes: string[];
}

export interface IndustryDetectionOutput {
  outcomeMap: IndustryOutcome | null;
  outcomeMapId: string | null;
  llmDetection: IndustryDetectionResult;
}

// ---------------------------------------------------------------------------
// Probe
// ---------------------------------------------------------------------------

export interface ProbeResult {
  accessible: boolean;
  catalogs?: string[];
  tableNames?: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// View Deployment
// ---------------------------------------------------------------------------

export interface ViewTarget {
  catalog: string;
  schema: string;
}

// ---------------------------------------------------------------------------
// Generate Config
// ---------------------------------------------------------------------------

export interface MetadataGenieGenerateConfig {
  catalogScope?: string[];
  viewTarget: ViewTarget;
  title?: string;
}

// ---------------------------------------------------------------------------
// Persisted State (returned from API)
// ---------------------------------------------------------------------------

export type MetadataGenieStatus =
  | "draft"
  | "views_deployed"
  | "deployed"
  | "trashed";

export interface MetadataGenieSpace {
  id: string;
  title: string;
  catalogScope: string[] | null;
  industryId: string | null;
  industryName: string | null;
  domains: string[] | null;
  detection: IndustryDetectionResult | null;
  viewCatalog: string | null;
  viewSchema: string | null;
  viewsDeployed: boolean;
  viewNames: string[] | null;
  serializedSpace: string;
  spaceId: string | null;
  spaceUrl: string | null;
  status: MetadataGenieStatus;
  authMode: string;
  tableCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Research Engine types.
 *
 * Defines inputs, deps, result, and all intermediate analysis types
 * produced by the analytical passes.
 */

import type { LLMClient } from "@/lib/ports/llm-client";
import type { Logger } from "@/lib/ports/logger";
import type {
  DemoScope,
  ResearchPreset,
  ResolvedDemoScope,
  ParsedDocument,
  ResearchSource,
  DataNarrative,
} from "../types";

// ---------------------------------------------------------------------------
// Engine Input & Deps
// ---------------------------------------------------------------------------

export interface ResearchEngineInput {
  customerName: string;
  /** Optional -- used for embedding sourceId and cleanup. Falls back to customerName. */
  sessionId?: string;
  /** Optional -- auto-detected from sources via Pass 3.25 if blank. */
  industryId?: string;
  preset?: ResearchPreset;
  scope?: DemoScope;
  websiteUrl?: string;
  uploadedDocuments?: ParsedDocument[];
  pastedContext?: string;
  signal?: AbortSignal;
  onProgress?: (phase: ResearchPhase, percent: number, detail?: string) => void;
  onSourceReady?: (source: ResearchSource) => void;
  deps?: ResearchEngineDeps;
}

export interface ResearchEngineDeps {
  llm?: LLMClient;
  logger?: Logger;
  /** Injectable for testing (mock HTTP). */
  fetchFn?: typeof fetch;
  /** Injectable for testing (mock PDF parsing). */
  parsePdf?: (buffer: Buffer) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

export type ResearchPhase =
  | "source-collection"
  | "website-scrape"
  | "ir-discovery"
  | "doc-parsing"
  | "embedding"
  | "industry-classification"
  | "outcome-map-generation"
  | "quick-synthesis"
  | "industry-landscape"
  | "strategy-and-narrative"
  | "company-deep-dive"
  | "data-strategy-mapping"
  | "demo-narrative"
  | "complete";

// ---------------------------------------------------------------------------
// Pass 3.25: Industry Classification
// ---------------------------------------------------------------------------

export interface IndustryClassification {
  industryId: string;
  industryName: string;
  confidence: number;
  isNew: boolean;
}

// ---------------------------------------------------------------------------
// Pass 4: Industry Landscape Analysis
// ---------------------------------------------------------------------------

export interface MarketForce {
  force: string;
  description: string;
  urgency: "accelerating" | "stable" | "emerging";
  benchmarkCitation?: string;
  impactOnSubVertical?: string;
}

export interface IndustryLandscapeAnalysis {
  marketForces: MarketForce[];
  competitiveDynamics: string;
  regulatoryPressures: string;
  technologyDisruptors: string;
  keyBenchmarks: Array<{
    metric: string;
    impact: string;
    source: string;
    kpiTarget?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Pass 5: Company Strategic Profile
// ---------------------------------------------------------------------------

export interface CompanyStrategicProfile {
  statedPriorities: Array<{ priority: string; source: string }>;
  inferredPriorities: Array<{ priority: string; evidence: string }>;
  strategicGaps: Array<{ gap: string; opportunity: string }>;
  divisionContext?: {
    products: string[];
    markets: string[];
    challenges: string[];
    teamStructure?: string;
  };
  urgencySignals: Array<{ signal: string; date?: string; type: string }>;
  executiveLanguage: Record<string, string>;
  suggestedDivisions?: string[];
  swotSummary: {
    strengths: string[];
    weaknesses: string[];
    opportunities: string[];
    threats: string[];
  };
}

// ---------------------------------------------------------------------------
// Pass 6: Data Strategy Map
// ---------------------------------------------------------------------------

export interface DataAssetDetail {
  id: string;
  relevance: number;
  rationale: string;
  quickWin: boolean;
  criticality: "MC" | "VA";
  linkedUseCases: string[];
  benchmarkImpact?: string;
}

export interface DataStrategyMap {
  matchedDataAssetIds: string[];
  assetDetails: DataAssetDetail[];
  nomenclature: Record<string, string>;
  dataMaturityAssessment: "data-native" | "data-transforming" | "data-aspirational";
  dataMaturityEvidence: string;
  prioritisedUseCases: Array<{
    name: string;
    benchmarkImpact?: string;
    kpiTarget?: string;
    dataAssetIds: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Pass 7: Demo Narrative Design
// ---------------------------------------------------------------------------

export interface KillerMoment {
  title: string;
  scenario: string;
  insightStatement: string;
  dataStory: string;
  expectedReaction: string;
  linkedAssets: string[];
  benchmarkCitation?: string;
}

export interface DemoNarrativeDesign {
  killerMoments: KillerMoment[];
  demoFlow: Array<{
    step: number;
    assetId: string;
    moment: string;
    talkingPoint: string;
    transitionToNext: string;
  }>;
  executiveTalkingPoints: Array<{
    assetId: string;
    headline: string;
    benchmarkTieIn: string;
  }>;
  competitorAngles: Array<{
    competitor: string;
    theirMove: string;
    yourOpportunity: string;
  }>;
  recommendedTableOrder: string[];
  dataNarratives: DataNarrative[];
}

// ---------------------------------------------------------------------------
// Aggregated Result
// ---------------------------------------------------------------------------

export interface ResearchEngineResult {
  customerName: string;
  industryId: string;
  scope: ResolvedDemoScope;

  industryLandscape: IndustryLandscapeAnalysis | null;
  companyProfile: CompanyStrategicProfile | null;
  dataStrategy: DataStrategyMap | null;
  demoNarrative: DemoNarrativeDesign | null;

  /** Populated by all presets -- the minimum the Data Engine needs. */
  matchedDataAssetIds: string[];
  nomenclature: Record<string, string>;
  dataNarratives: DataNarrative[];

  sources: ResearchSource[];
  confidence: number;
  passTimings: Record<string, number>;
  generatedOutcomeMap: boolean;
}

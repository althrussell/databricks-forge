/**
 * Types for Master Repository enrichment data.
 *
 * These types extend the base industry outcome model with structured
 * benchmark, data asset, and strategic alignment data sourced from
 * the Master Repository XLSX.
 *
 * Auto-generated enrichment modules (*.enrichment.ts) import these types.
 * The industry-enrichment skill reads these to build LLM prompt chunks.
 */

// ---------------------------------------------------------------------------
// Enriched use case (superset of ReferenceUseCase fields)
// ---------------------------------------------------------------------------

export interface MasterRepoUseCase {
  name: string;
  description: string;
  rationale?: string;
  modelType?: string;
  kpiTarget?: string;
  benchmarkImpact?: string;
  benchmarkSource?: string;
  benchmarkUrl?: string;
  strategicImperative?: string;
  strategicPillar?: string;
  dataAssetIds?: string[];
  dataAssetCriticality?: Record<string, "MC" | "VA">;
}

// ---------------------------------------------------------------------------
// Reference data asset
// ---------------------------------------------------------------------------

export interface ReferenceDataAsset {
  id: string;
  name: string;
  description: string;
  systemLocation: string;
  assetFamily: string;
  easeOfAccess: string;
  lakeflowConnect: "High" | "Low";
  ucFederation: "High" | "Low";
  lakebridgeMigrate: "High" | "Low";
}

// ---------------------------------------------------------------------------
// Enrichment bundle (per industry)
// ---------------------------------------------------------------------------

export interface MasterRepoEnrichment {
  useCases: MasterRepoUseCase[];
  dataAssets: ReferenceDataAsset[];
}

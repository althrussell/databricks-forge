/**
 * Research Engine -- multi-pass, preset-aware company intelligence gathering.
 *
 * Orchestrates source collection, industry classification, outcome map
 * generation, and analytical passes (Quick: 1 call, Balanced: 2 calls,
 * Full: 4 calls).
 */

import { createScopedLogger } from "@/lib/logger";
import { databricksLLMClient } from "@/lib/ports/defaults/databricks-llm-client";
import { getIndustryOutcomeAsync } from "@/lib/domain/industry-outcomes-server";
import { getMasterRepoEnrichmentAsync } from "@/lib/domain/industry-outcomes/master-repo-registry";
import { getAllIndustryOutcomes } from "@/lib/domain/industry-outcomes-server";
import { resolveResearchBudget } from "../types";
import { resolveScope } from "../scope";
import { mapWithConcurrency } from "@/lib/toolkit/concurrency";
import type {
  ResearchEngineInput,
  ResearchEngineResult,
  ResearchPhase,
  IndustryLandscapeAnalysis,
  CompanyStrategicProfile,
  DataStrategyMap,
  DemoNarrativeDesign,
} from "./types";
import type { ResearchSource, DataNarrative } from "../types";

import { runWebsiteScrape } from "./passes/website-scrape";
import { runIRDiscovery } from "./passes/ir-crawler";
import { runDocParsing } from "./passes/doc-parser";
import { runIndustryClassification } from "./passes/industry-classification";
import { runOutcomeMapGeneration } from "./passes/outcome-map-generation";
import { runQuickSynthesis } from "./passes/quick-synthesis";
import { runIndustryLandscape } from "./passes/industry-landscape";
import { runStrategyAndNarrative } from "./passes/strategy-and-narrative";
import { runCompanyDeepDive } from "./passes/company-deep-dive";
import { runDataStrategyMapping } from "./passes/data-strategy-mapping";
import { runDemoNarrative } from "./passes/demo-narrative";

export class ResearchCancelledError extends Error {
  constructor() {
    super("Research was cancelled");
    this.name = "ResearchCancelledError";
  }
}

export async function runResearchEngine(
  input: ResearchEngineInput,
): Promise<ResearchEngineResult> {
  const startTime = Date.now();
  const preset = input.preset ?? "balanced";
  const budget = resolveResearchBudget(preset);
  const llm = input.deps?.llm ?? databricksLLMClient;
  const log = input.deps?.logger ?? createScopedLogger({ origin: "ResearchEngine", module: "demo/research-engine" });
  const signal = input.signal;
  const passTimings: Record<string, number> = {};

  const progress = (phase: ResearchPhase, percent: number, detail?: string) => {
    input.onProgress?.(phase, percent, detail);
  };

  log.info("Starting research engine", {
    customer: input.customerName,
    industryId: input.industryId,
    preset,
    scope: input.scope,
  });

  const allSources: ResearchSource[] = [];

  // =======================================================================
  // Phase 0: Source Collection
  // =======================================================================
  progress("source-collection", 5, "Gathering sources...");

  const sourceOpts = {
    fetchFn: input.deps?.fetchFn,
    parsePdf: input.deps?.parsePdf,
    logger: log,
    signal,
    onSourceReady: (s: ResearchSource) => {
      allSources.push(s);
      input.onSourceReady?.(s);
    },
  };

  // Run source passes in parallel (bounded by budget)
  const sourceTexts: string[] = [];
  let t0 = Date.now();

  const sourceTasks: Array<Promise<{ text: string; sources: ResearchSource[] }>> = [];
  if (budget.sources.includes("website")) {
    sourceTasks.push(runWebsiteScrape(input.websiteUrl, input.scope, sourceOpts));
  }
  if (budget.sources.includes("ir-discovery")) {
    sourceTasks.push(runIRDiscovery(input.websiteUrl, input.scope, sourceOpts));
  }

  const sourceResults = await Promise.allSettled(sourceTasks);
  for (const result of sourceResults) {
    if (result.status === "fulfilled") {
      if (result.value.text) sourceTexts.push(result.value.text);
    }
  }

  // User docs (only in full mode, synchronous since already parsed)
  if (budget.sources.includes("user-docs")) {
    const docResult = runDocParsing(input.uploadedDocuments, input.pastedContext, {
      logger: log,
      onSourceReady: sourceOpts.onSourceReady,
    });
    if (docResult.text) sourceTexts.push(docResult.text);
    allSources.push(...docResult.sources);
  }

  const combinedSourceText = sourceTexts.join("\n\n---\n\n");
  passTimings["source-collection"] = Date.now() - t0;

  checkCancelled(signal);
  progress("source-collection", 15, `${allSources.filter((s) => s.status === "ready").length} sources gathered`);

  // =======================================================================
  // Phase 3.25: Industry Classification (if needed)
  // =======================================================================
  let industryId = input.industryId ?? "";
  let industryName = "";
  let generatedOutcomeMap = false;

  if (!industryId) {
    progress("industry-classification", 18, "Classifying industry...");
    t0 = Date.now();

    const allOutcomes = await getAllIndustryOutcomes();
    const existingIndustries = allOutcomes.map((o) => ({ id: o.id, name: o.name }));

    const classification = await runIndustryClassification(combinedSourceText, existingIndustries, {
      llm,
      logger: log,
      signal,
    });

    industryId = classification.industryId;
    industryName = classification.industryName;
    passTimings["industry-classification"] = Date.now() - t0;
  }

  // Resolve industry name if we have an id but not a name
  if (!industryName) {
    const outcome = await getIndustryOutcomeAsync(industryId);
    industryName = outcome?.name ?? industryId;
  }

  checkCancelled(signal);

  // =======================================================================
  // Phase 3.5: Outcome Map Generation (if needed)
  // =======================================================================
  const existingOutcome = await getIndustryOutcomeAsync(industryId);
  const existingEnrichment = await getMasterRepoEnrichmentAsync(industryId);

  if (!existingOutcome || !existingEnrichment) {
    progress("outcome-map-generation", 22, "Generating industry outcome map...");
    t0 = Date.now();

    const genResult = await runOutcomeMapGeneration(
      industryId,
      industryName,
      combinedSourceText,
      { llm, logger: log, signal },
    );

    generatedOutcomeMap = true;
    passTimings["outcome-map-generation"] = Date.now() - t0;
  }

  checkCancelled(signal);

  // Reload after potential generation
  const outcomeMap = await getIndustryOutcomeAsync(industryId);
  const enrichment = await getMasterRepoEnrichmentAsync(industryId);

  const outcomeMapContext = outcomeMap
    ? JSON.stringify({
        objectives: outcomeMap.objectives,
        subVerticals: outcomeMap.subVerticals,
        suggestedDomains: outcomeMap.suggestedDomains,
      })
    : "No outcome map available.";

  const dataAssetsContext = enrichment
    ? JSON.stringify(enrichment.dataAssets)
    : "No data assets available.";

  const benchmarkContext = enrichment
    ? JSON.stringify(
        enrichment.useCases.map((uc) => ({
          name: uc.name,
          benchmarkImpact: uc.benchmarkImpact,
          benchmarkSource: uc.benchmarkSource,
          kpiTarget: uc.kpiTarget,
        })),
      )
    : "No benchmarks available.";

  // =======================================================================
  // Analytical Pipeline (varies by preset)
  // =======================================================================
  const resolvedScope = resolveScope(input.scope);

  let industryLandscape: IndustryLandscapeAnalysis | null = null;
  let companyProfile: CompanyStrategicProfile | null = null;
  let dataStrategy: DataStrategyMap | null = null;
  let demoNarrative: DemoNarrativeDesign | null = null;
  let matchedDataAssetIds: string[] = [];
  let nomenclature: Record<string, string> = {};
  let dataNarratives: DataNarrative[] = [];

  if (preset === "quick") {
    // ----- QUICK: Single combined synthesis -----
    progress("quick-synthesis", 30, "Running quick synthesis...");
    t0 = Date.now();

    const quickResult = await runQuickSynthesis(
      input.customerName,
      industryId,
      industryName,
      outcomeMapContext,
      combinedSourceText,
      input.scope,
      { llm, logger: log, signal },
    );

    companyProfile = quickResult.companyProfile ?? null;
    matchedDataAssetIds = quickResult.matchedDataAssetIds ?? [];
    nomenclature = quickResult.nomenclature ?? {};
    dataNarratives = quickResult.dataNarratives ?? [];
    passTimings["quick-synthesis"] = Date.now() - t0;

  } else if (preset === "balanced") {
    // ----- BALANCED: 2-pass (landscape + combined strategy-narrative) -----
    progress("industry-landscape", 30, "Analysing industry landscape...");
    t0 = Date.now();

    industryLandscape = await runIndustryLandscape(
      industryName,
      outcomeMapContext,
      benchmarkContext,
      combinedSourceText,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass },
    );
    passTimings["industry-landscape"] = Date.now() - t0;

    checkCancelled(signal);
    progress("strategy-and-narrative", 55, "Building strategy & demo narrative...");
    t0 = Date.now();

    const combined = await runStrategyAndNarrative(
      input.customerName,
      industryName,
      industryLandscape,
      dataAssetsContext,
      combinedSourceText,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass },
    );

    companyProfile = combined.companyProfile;
    dataStrategy = combined.dataStrategy;
    demoNarrative = combined.demoNarrative;
    matchedDataAssetIds = dataStrategy?.matchedDataAssetIds ?? [];
    nomenclature = dataStrategy?.nomenclature ?? {};
    dataNarratives = demoNarrative?.dataNarratives ?? [];
    passTimings["strategy-and-narrative"] = Date.now() - t0;

  } else {
    // ----- FULL: 4-pass McKinsey team -----
    progress("industry-landscape", 25, "Pass 4: Industry landscape analysis...");
    t0 = Date.now();

    industryLandscape = await runIndustryLandscape(
      industryName,
      outcomeMapContext,
      benchmarkContext,
      combinedSourceText,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass },
    );
    passTimings["industry-landscape"] = Date.now() - t0;

    checkCancelled(signal);
    progress("company-deep-dive", 40, "Pass 5: Company strategic deep-dive...");
    t0 = Date.now();

    companyProfile = await runCompanyDeepDive(
      input.customerName,
      industryName,
      industryLandscape,
      combinedSourceText,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass },
    );
    passTimings["company-deep-dive"] = Date.now() - t0;

    checkCancelled(signal);
    progress("data-strategy-mapping", 60, "Pass 6: Data strategy mapping...");
    t0 = Date.now();

    dataStrategy = await runDataStrategyMapping(
      input.customerName,
      industryLandscape,
      companyProfile,
      dataAssetsContext,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass },
    );
    passTimings["data-strategy-mapping"] = Date.now() - t0;

    checkCancelled(signal);
    progress("demo-narrative", 80, "Pass 7: Demo narrative design...");
    t0 = Date.now();

    demoNarrative = await runDemoNarrative(
      input.customerName,
      industryName,
      industryLandscape,
      companyProfile,
      dataStrategy,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass },
    );
    passTimings["demo-narrative"] = Date.now() - t0;

    matchedDataAssetIds = dataStrategy?.matchedDataAssetIds ?? [];
    nomenclature = dataStrategy?.nomenclature ?? {};
    dataNarratives = demoNarrative?.dataNarratives ?? [];
  }

  // =======================================================================
  // Build Result
  // =======================================================================
  progress("complete", 100, "Research complete");

  const confidence = allSources.filter((s) => s.status === "ready").length / Math.max(allSources.length, 1);

  const result: ResearchEngineResult = {
    customerName: input.customerName,
    industryId,
    scope: {
      ...resolvedScope,
      suggestedDivisions: companyProfile?.suggestedDivisions,
    },
    industryLandscape,
    companyProfile,
    dataStrategy,
    demoNarrative,
    matchedDataAssetIds,
    nomenclature,
    dataNarratives,
    sources: allSources,
    confidence,
    passTimings,
    generatedOutcomeMap,
  };

  const totalMs = Date.now() - startTime;
  log.info("Research engine complete", {
    preset,
    totalMs,
    assets: matchedDataAssetIds.length,
    sources: allSources.length,
    passTimings,
  });

  return result;
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ResearchCancelledError();
}

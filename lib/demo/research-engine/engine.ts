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

import { runWebsiteScrape, runDeepWebsiteScrape } from "./passes/website-scrape";
import { runIRDiscovery } from "./passes/ir-crawler";
import { embedResearchSources } from "./passes/research-embedder";
import { runDocParsing } from "./passes/doc-parser";
import { runIndustryClassification } from "./passes/industry-classification";
import { runOutcomeMapGeneration, runEnrichmentOnlyGeneration } from "./passes/outcome-map-generation";
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

/**
 * Normalize a free-form industry string to a known industry outcome ID.
 * Tries: exact match -> kebab-case -> starts-with -> name match -> no match.
 */
function normalizeIndustryId(
  raw: string,
  allOutcomes: Array<{ id: string; name: string }>,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // 1. Exact match
  if (allOutcomes.some((o) => o.id === trimmed)) return trimmed;

  // 2. Kebab-case normalize
  const kebab = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  const exactKebab = allOutcomes.find((o) => o.id === kebab);
  if (exactKebab) return exactKebab.id;

  // 3. Starts-with / contains match (kebab vs kebab)
  const startsWith = allOutcomes.find(
    (o) => o.id.startsWith(kebab) || kebab.startsWith(o.id),
  );
  if (startsWith) return startsWith.id;

  // 4. Case-insensitive name match
  const lowerName = trimmed.toLowerCase();
  const nameMatch = allOutcomes.find(
    (o) =>
      o.name.toLowerCase() === lowerName ||
      o.name.toLowerCase().includes(lowerName) ||
      lowerName.includes(o.name.toLowerCase()),
  );
  if (nameMatch) return nameMatch.id;

  return null;
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

  const modelTier = budget.modelTier;

  log.info("Starting research engine", {
    customer: input.customerName,
    industryId: input.industryId,
    preset,
    modelTier,
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
  if (budget.sources.includes("strategic-crawl")) {
    progress("source-collection", 5, "Deep scanning website (sitemap + strategic pages)...");
    sourceTasks.push(runDeepWebsiteScrape(input.websiteUrl, input.scope, {
      ...sourceOpts,
      llm,
      onProgress: (detail) => progress("source-collection", 8, detail),
    }));
  } else if (budget.sources.includes("website")) {
    sourceTasks.push(runWebsiteScrape(input.websiteUrl, input.scope, sourceOpts));
  }
  if (budget.sources.includes("ir-discovery") || budget.sources.includes("sec-edgar")) {
    progress("source-collection", 9, "Scanning investor relations + filings...");
    sourceTasks.push(runIRDiscovery(input.websiteUrl, input.scope, sourceOpts));
  }

  const sourceResults = await Promise.allSettled(sourceTasks);
  for (const result of sourceResults) {
    if (result.status === "fulfilled") {
      if (result.value.text) sourceTexts.push(result.value.text);
    }
  }

  // User docs (only in full mode, synchronous since already parsed)
  let docResult: { text: string; sources: ResearchSource[] } | null = null;
  if (budget.sources.includes("user-docs")) {
    docResult = runDocParsing(input.uploadedDocuments, input.pastedContext, {
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
  // Phase 0.5 + 3.25 + 3.5: Embedding, Classification, Outcome Map
  //
  // Embedding has no dependency on the classification/outcome-map pipeline
  // so we run it concurrently to save wall-clock time.
  // =======================================================================

  // --- Build embedding task (fire-and-forget, runs in parallel) ----------
  const embeddingTask = allSources.some((s) => s.status === "ready")
    ? (async () => {
        const tEmbed = Date.now();
        progress("embedding", 12, `Embedding ${allSources.filter((s) => s.status === "ready").length} sources for Ask Forge...`);

        const embedSources: Array<{ type: string; title: string; text: string }> = [];
        for (const result of sourceResults) {
          if (result.status === "fulfilled" && result.value.text) {
            const firstSource = result.value.sources.find((s) => s.status === "ready");
            embedSources.push({
              type: firstSource?.type ?? "website",
              title: firstSource?.title ?? "Source",
              text: result.value.text,
            });
          }
        }
        if (docResult?.text) {
          const firstDoc = docResult.sources.find((s) => s.status === "ready");
          embedSources.push({
            type: firstDoc?.type ?? "upload",
            title: firstDoc?.title ?? "Uploaded documents",
            text: docResult.text,
          });
        }

        const embeddedCount = await embedResearchSources(
          {
            sessionId: input.sessionId ?? input.customerName,
            customerName: input.customerName,
            industryId: input.industryId ?? "",
            sources: embedSources.filter((s) => s.text.length > 0),
          },
          log,
        );

        progress("embedding", 14, `Embedded ${embeddedCount} chunks for Ask Forge`);
        passTimings["embedding"] = Date.now() - tEmbed;
      })()
    : Promise.resolve();

  // --- Classification + outcome map pipeline (runs in parallel with embedding)
  const classificationAndOutcomeTask = (async () => {
    let industryIdInner = input.industryId ?? "";
    let industryNameInner = "";
    let generatedOutcomeMapInner = false;

    const allOutcomes = await getAllIndustryOutcomes();
    const allOutcomeSummaries = allOutcomes.map((o) => ({ id: o.id, name: o.name }));

    if (industryIdInner) {
      const normalized = normalizeIndustryId(industryIdInner, allOutcomeSummaries);
      if (normalized && normalized !== industryIdInner) {
        log.info("Normalized industry ID", { original: industryIdInner, normalized });
        industryIdInner = normalized;
      }
    }

    if (!industryIdInner) {
      progress("industry-classification", 17, `Classifying industry from ${allSources.filter((s) => s.status === "ready").length} sources...`);
      t0 = Date.now();

      const classification = await runIndustryClassification(combinedSourceText, allOutcomeSummaries, {
        llm,
        logger: log,
        signal,
        modelTier,
      });

      industryIdInner = classification.industryId;
      industryNameInner = classification.industryName;

      const normalized = normalizeIndustryId(industryIdInner, allOutcomeSummaries);
      if (normalized) {
        industryIdInner = normalized;
        const match = allOutcomeSummaries.find((o) => o.id === normalized);
        if (match) industryNameInner = match.name;
      }

      progress("industry-classification", 19, `Classified as ${industryNameInner} (${Math.round(classification.confidence * 100)}% confidence)`);
      passTimings["industry-classification"] = Date.now() - t0;
    }

    if (!industryNameInner) {
      const outcome = await getIndustryOutcomeAsync(industryIdInner);
      industryNameInner = outcome?.name ?? industryIdInner;
    }

    checkCancelled(signal);

    // Phase 3.5: Outcome Map + Enrichment
    progress("outcome-map-generation", 20, "Checking existing industry knowledge...");

    const existingOutcome = await getIndustryOutcomeAsync(industryIdInner);
    const existingEnrichment = await getMasterRepoEnrichmentAsync(industryIdInner);

    if (existingOutcome && existingEnrichment) {
      progress("outcome-map-generation", 28, `Using existing outcome map + enrichment for ${industryNameInner}`);
      log.info("Outcome map + enrichment both exist, skipping generation", { industryId: industryIdInner });
    } else if (existingOutcome && !existingEnrichment) {
      progress("outcome-map-generation", 21, `Generating data asset enrichment for ${industryNameInner}...`);
      t0 = Date.now();

      await runEnrichmentOnlyGeneration(industryIdInner, industryNameInner, existingOutcome, combinedSourceText, {
        llm,
        logger: log,
        signal,
        modelTier,
      });

      generatedOutcomeMapInner = true;
      const reloadedEnrichment = await getMasterRepoEnrichmentAsync(industryIdInner);
      progress("outcome-map-generation", 28, `Generated ${reloadedEnrichment?.dataAssets?.length ?? 0} data assets`);
      passTimings["outcome-map-generation"] = Date.now() - t0;
    } else {
      progress("outcome-map-generation", 21, `No existing outcome map -- generating for ${industryNameInner}...`);
      t0 = Date.now();

      const genResult = await runOutcomeMapGeneration(industryIdInner, industryNameInner, combinedSourceText, {
        llm,
        logger: log,
        signal,
        modelTier,
      });

      generatedOutcomeMapInner = true;
      progress("outcome-map-generation", 28, `Generated ${genResult.enrichment.dataAssets.length} data assets and ${genResult.enrichment.useCases.length} use cases`);
      passTimings["outcome-map-generation"] = Date.now() - t0;
    }

    return { industryId: industryIdInner, industryName: industryNameInner, generatedOutcomeMap: generatedOutcomeMapInner };
  })();

  // Wait for both pipelines to finish
  const [, classResult] = await Promise.all([embeddingTask, classificationAndOutcomeTask]);
  const { industryId, industryName, generatedOutcomeMap } = classResult;

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
    progress("quick-synthesis", 30, `Running quick synthesis for ${input.customerName}...`);
    t0 = Date.now();

    const quickResult = await runQuickSynthesis(
      input.customerName,
      industryId,
      industryName,
      outcomeMapContext,
      combinedSourceText,
      input.scope,
      { llm, logger: log, signal, modelTier },
    );

    companyProfile = quickResult.companyProfile ?? null;
    matchedDataAssetIds = quickResult.matchedDataAssetIds ?? [];
    nomenclature = quickResult.nomenclature ?? {};
    dataNarratives = quickResult.dataNarratives ?? [];
    passTimings["quick-synthesis"] = Date.now() - t0;

  } else if (preset === "balanced") {
    // ----- BALANCED: 2-pass (landscape + combined strategy-narrative) -----
    progress("industry-landscape", 30, `Analysing ${industryName} market forces and benchmarks...`);
    t0 = Date.now();

    industryLandscape = await runIndustryLandscape(
      industryName,
      outcomeMapContext,
      benchmarkContext,
      combinedSourceText,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass, modelTier },
    );
    passTimings["industry-landscape"] = Date.now() - t0;
    progress("industry-landscape", 45, `Identified ${industryLandscape.marketForces?.length ?? 0} market forces, ${industryLandscape.keyBenchmarks?.length ?? 0} benchmarks`);

    checkCancelled(signal);
    progress("strategy-and-narrative", 50, `Building strategy & demo narrative for ${input.customerName}...`);
    t0 = Date.now();

    const combined = await runStrategyAndNarrative(
      input.customerName,
      industryName,
      industryLandscape,
      dataAssetsContext,
      combinedSourceText,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass, modelTier },
    );

    companyProfile = combined.companyProfile;
    dataStrategy = combined.dataStrategy;
    demoNarrative = combined.demoNarrative;
    matchedDataAssetIds = dataStrategy?.matchedDataAssetIds ?? [];
    nomenclature = dataStrategy?.nomenclature ?? {};
    dataNarratives = demoNarrative?.dataNarratives ?? [];
    passTimings["strategy-and-narrative"] = Date.now() - t0;
    progress("strategy-and-narrative", 92, `Matched ${matchedDataAssetIds.length} data assets, designed ${demoNarrative?.killerMoments?.length ?? 0} killer moments`);

  } else {
    // ----- FULL: 4-pass McKinsey team -----
    progress("industry-landscape", 25, `Analysing ${industryName} market forces and benchmarks...`);
    t0 = Date.now();

    industryLandscape = await runIndustryLandscape(
      industryName,
      outcomeMapContext,
      benchmarkContext,
      combinedSourceText,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass, modelTier },
    );
    passTimings["industry-landscape"] = Date.now() - t0;
    progress("industry-landscape", 35, `Identified ${industryLandscape.marketForces?.length ?? 0} market forces, ${industryLandscape.keyBenchmarks?.length ?? 0} benchmarks`);

    checkCancelled(signal);
    progress("company-deep-dive", 40, `Deep-diving ${input.customerName} strategic profile...`);
    t0 = Date.now();

    companyProfile = await runCompanyDeepDive(
      input.customerName,
      industryName,
      industryLandscape,
      combinedSourceText,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass, modelTier },
    );
    passTimings["company-deep-dive"] = Date.now() - t0;
    progress("company-deep-dive", 52, `Found ${companyProfile.statedPriorities?.length ?? 0} stated priorities, ${companyProfile.urgencySignals?.length ?? 0} urgency signals`);

    checkCancelled(signal);
    progress("data-strategy-mapping", 55, `Mapping ${input.customerName} priorities to data assets...`);
    t0 = Date.now();

    dataStrategy = await runDataStrategyMapping(
      input.customerName,
      industryLandscape,
      companyProfile,
      dataAssetsContext,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass, modelTier },
    );
    passTimings["data-strategy-mapping"] = Date.now() - t0;
    progress("data-strategy-mapping", 72, `Mapped ${dataStrategy.matchedDataAssetIds?.length ?? 0} assets, maturity: ${dataStrategy.dataMaturityAssessment ?? "unknown"}`);

    checkCancelled(signal);
    progress("demo-narrative", 75, `Designing demo flow and killer moments for ${input.customerName}...`);
    t0 = Date.now();

    demoNarrative = await runDemoNarrative(
      input.customerName,
      industryName,
      industryLandscape,
      companyProfile,
      dataStrategy,
      input.scope,
      { llm, logger: log, signal, maxTokens: budget.maxTokensPerPass, modelTier },
    );
    passTimings["demo-narrative"] = Date.now() - t0;
    progress("demo-narrative", 95, `Designed ${demoNarrative.killerMoments?.length ?? 0} killer moments, ${demoNarrative.demoFlow?.length ?? 0}-step demo flow`);

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

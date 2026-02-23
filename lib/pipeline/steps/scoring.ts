/**
 * Pipeline Step 6: Scoring & Deduplication
 *
 * Scores each use case on multiple dimensions using Model Serving (JSON mode),
 * then removes duplicates and low-value entries.
 */

import { executeAIQuery, parseJSONResponse } from "@/lib/ai/agent";
import { buildTokenAwareBatches } from "@/lib/ai/token-budget";
import { getFastServingEndpoint } from "@/lib/dbx/client";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { buildIndustryKPIsPrompt } from "@/lib/domain/industry-outcomes-server";
import { logger } from "@/lib/logger";
import {
  ScoreItemSchema,
  DedupItemSchema,
  CalibrationItemSchema,
  CrossDomainDedupItemSchema,
  validateLLMArray,
} from "@/lib/validation";
import type { PipelineContext, UseCase } from "@/lib/domain/types";
import { DEFAULT_DEPTH_CONFIGS } from "@/lib/domain/types";

export async function runScoring(ctx: PipelineContext, runId?: string): Promise<UseCase[]> {
  const { run, useCases } = ctx;
  if (!run.businessContext) throw new Error("Business context not available");
  if (useCases.length === 0) return [];

  const bc = run.businessContext;
  let scored = [...useCases];

  // Build industry KPIs for scoring enrichment
  const industryKpis = run.config.industry
    ? await buildIndustryKPIsPrompt(run.config.industry)
    : "";

  // Step 6a: Score per domain
  const domains = [...new Set(scored.map((uc) => uc.domain))];
  const bcRecord = bc as unknown as Record<string, string>;
  for (let di = 0; di < domains.length; di++) {
    const domain = domains[di];
    const domainCases = scored.filter((uc) => uc.domain === domain);
    if (runId) await updateRunMessage(runId, `Scoring domain: ${domain} (${domainCases.length} use cases, ${di + 1}/${domains.length})...`);
    try {
      await scoreDomain(domainCases, bcRecord, run.config.aiModel, industryKpis, runId);
    } catch (error) {
      logger.warn("Scoring failed for domain", { domain, error: error instanceof Error ? error.message : String(error) });
      // Assign default scores
      domainCases.forEach((uc) => {
        uc.priorityScore = 0.5;
        uc.feasibilityScore = 0.5;
        uc.impactScore = 0.5;
        uc.overallScore = 0.5;
      });
    }
  }

  // Step 6b: Deduplicate per domain
  if (runId) await updateRunMessage(runId, `Deduplicating: reviewing ${scored.length} use cases...`);
  let removedCount = 0;
  for (const domain of domains) {
    const domainCases = scored.filter((uc) => uc.domain === domain);
    if (domainCases.length <= 2) continue;

    try {
      const toRemove = await deduplicateDomain(domainCases, bcRecord, getFastServingEndpoint(), runId);
      removedCount += toRemove.size;
      scored = scored.filter((uc) => !toRemove.has(uc.useCaseNo));
    } catch (error) {
      logger.warn("Dedup failed for domain", { domain, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (runId && removedCount > 0) {
    await updateRunMessage(runId, `Deduplication: removed ${removedCount} near-duplicates`);
  }

  // Step 6c: Cross-domain deduplication
  if (scored.length > 5) {
    if (runId) await updateRunMessage(runId, `Cross-domain dedup: reviewing ${scored.length} use cases...`);
    try {
      const crossDomainRemoved = await deduplicateCrossDomain(scored, bcRecord, getFastServingEndpoint(), runId);
      if (crossDomainRemoved.size > 0) {
        scored = scored.filter((uc) => !crossDomainRemoved.has(uc.useCaseNo));
        if (runId) {
          await updateRunMessage(runId, `Cross-domain dedup: removed ${crossDomainRemoved.size} duplicates`);
        }
        logger.info("Cross-domain dedup removed use cases", { removedCount: crossDomainRemoved.size });
      }
    } catch (error) {
      logger.warn("Cross-domain dedup failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Step 6d: Global score calibration (chunked for full coverage)
  if (scored.length > 10) {
    if (runId) await updateRunMessage(runId, `Calibrating scores across ${domains.length} domains...`);
    try {
      await calibrateScoresChunked(scored, bc as unknown as Record<string, string>, run.config.aiModel, runId);
    } catch (error) {
      logger.warn("Global calibration failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // Step 6e: Sort by overall score and re-number with domain prefix
  scored.sort((a, b) => b.overallScore - a.overallScore);

  const domainCounters: Record<string, number> = {};
  for (const uc of scored) {
    if (!domainCounters[uc.domain]) domainCounters[uc.domain] = 0;
    domainCounters[uc.domain]++;
    const domainPrefix = uc.domain.substring(0, 3).toUpperCase();
    uc.useCaseNo = domainCounters[uc.domain];
    uc.id = `${domainPrefix}-${String(uc.useCaseNo).padStart(3, "0")}-${uc.id.substring(0, 8)}`;
  }

  // Step 6f: Quality floor -- drop use cases below depth-specific threshold
  const depth = run.config.discoveryDepth ?? "balanced";
  const dc = run.config.depthConfig ?? DEFAULT_DEPTH_CONFIGS[depth];
  const floor = dc.qualityFloor;
  const beforeFloor = scored.length;
  scored = scored.filter((uc) => uc.overallScore >= floor);
  if (scored.length < beforeFloor) {
    const removed = beforeFloor - scored.length;
    logger.info("Quality floor applied", { floor, removed, remaining: scored.length });
    if (runId) await updateRunMessage(runId, `Quality floor (${floor}): removed ${removed} low-scoring use cases`);
  }

  // Step 6g: Adaptive volume cap
  const cap = dc.adaptiveCap;
  if (scored.length > cap) {
    scored = scored.slice(0, cap);
    if (runId) await updateRunMessage(runId, `Volume cap (${depth}): capped at ${cap} use cases`);
  }

  const finalDomains = [...new Set(scored.map((uc) => uc.domain))].length;
  if (runId) await updateRunMessage(runId, `Final: ${scored.length} use cases across ${finalDomains} domains`);

  logger.info("Scoring complete", { useCaseCount: scored.length, domainCount: finalDomains, depth });

  return scored;
}

async function scoreDomain(
  domainCases: UseCase[],
  businessContext: Record<string, string>,
  aiModel: string,
  industryKpis: string = "",
  runId?: string
): Promise<void> {
  const renderScoreRow = (uc: UseCase) =>
    `| ${uc.useCaseNo} | ${uc.name} | ${uc.type} | ${uc.analyticsTechnique} | ${uc.statement} |`;

  const baseContextTokens = 2000; // template + business context overhead
  const batches = buildTokenAwareBatches(domainCases, renderScoreRow, baseContextTokens);

  const scoreMap = new Map<
    number,
    { priority: number; feasibility: number; impact: number; overall: number }
  >();

  for (const batch of batches) {
    const useCaseMarkdown = batch.map(renderScoreRow).join("\n");

    const result = await executeAIQuery({
      promptKey: "SCORE_USE_CASES_PROMPT",
      variables: {
        business_context: JSON.stringify(businessContext),
        strategic_goals: businessContext.strategicGoals ?? "",
        business_priorities: businessContext.businessPriorities ?? "",
        strategic_initiative: businessContext.strategicInitiative ?? "",
        value_chain: businessContext.valueChain ?? "",
        revenue_model: businessContext.revenueModel ?? "",
        industry_kpis: industryKpis,
        use_case_markdown: `| No | Name | Type | Technique | Statement |\n|---|---|---|---|---|\n${useCaseMarkdown}`,
      },
      modelEndpoint: aiModel,
      responseFormat: "json_object",
      runId,
      step: "scoring",
    });

    let rawItems: unknown[];
    try {
      rawItems = parseJSONResponse<unknown[]>(result.rawResponse);
    } catch (parseErr) {
      logger.warn("Failed to parse scoring response JSON", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      continue;
    }

    const items = validateLLMArray(rawItems, ScoreItemSchema, "scoreDomain");
    for (const item of items) {
      if (isNaN(item.no)) continue;
      scoreMap.set(item.no, {
        priority: clampScore(item.priority_score),
        feasibility: clampScore(item.feasibility_score),
        impact: clampScore(item.impact_score),
        overall: clampScore(item.overall_score),
      });
    }
  }

  for (const uc of domainCases) {
    const scores = scoreMap.get(uc.useCaseNo);
    if (scores) {
      uc.priorityScore = scores.priority;
      uc.feasibilityScore = scores.feasibility;
      uc.impactScore = scores.impact;
      uc.overallScore = scores.overall;
    } else {
      uc.priorityScore = 0.5;
      uc.feasibilityScore = 0.5;
      uc.impactScore = 0.5;
      uc.overallScore = 0.5;
    }
  }
}

async function deduplicateDomain(
  domainCases: UseCase[],
  businessContext: Record<string, string>,
  aiModel: string,
  runId?: string
): Promise<Set<number>> {
  const renderDedupRow = (uc: UseCase) =>
    `| ${uc.useCaseNo} | ${uc.domain} | ${uc.name} | ${uc.type} | ${uc.statement} |`;

  const baseContextTokens = 1500;
  const batches = buildTokenAwareBatches(domainCases, renderDedupRow, baseContextTokens);

  const toRemove = new Set<number>();

  for (const batch of batches) {
    const useCaseMarkdown = batch.map(renderDedupRow).join("\n");

    const result = await executeAIQuery({
      promptKey: "REVIEW_USE_CASES_PROMPT",
      variables: {
        total_count: String(batch.length),
        business_name: businessContext.businessName ?? "",
        strategic_goals: businessContext.strategicGoals ?? "",
        use_case_markdown: `| No | Domain | Name | Type | Statement |\n|---|---|---|---|---|\n${useCaseMarkdown}`,
      },
      modelEndpoint: aiModel,
      responseFormat: "json_object",
      runId,
      step: "scoring",
    });

    let rawItems: unknown[];
    try {
      rawItems = parseJSONResponse<unknown[]>(result.rawResponse);
    } catch (parseErr) {
      logger.warn("Failed to parse dedup response JSON", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      continue;
    }

    const items = validateLLMArray(rawItems, DedupItemSchema, "deduplicateDomain");
    for (const item of items) {
      const action = String(item.action ?? "").trim().toLowerCase();
      if (!isNaN(item.no) && action === "remove") {
        toRemove.add(item.no);
      }
    }
  }

  return toRemove;
}

function clampScore(value: number): number {
  if (isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

// ---------------------------------------------------------------------------
// Global score calibration
// ---------------------------------------------------------------------------

/**
 * Chunked global calibration: takes top 8 per domain, then calibrates in
 * chunks of 50 with 5-item overlap anchors for scale consistency.
 */
async function calibrateScoresChunked(
  useCases: UseCase[],
  businessContext: Record<string, string>,
  aiModel: string,
  runId?: string
): Promise<void> {
  const domains = [...new Set(useCases.map((uc) => uc.domain))];
  const candidates: UseCase[] = [];
  for (const domain of domains) {
    const domainCases = useCases
      .filter((uc) => uc.domain === domain)
      .sort((a, b) => b.overallScore - a.overallScore)
      .slice(0, 8);
    candidates.push(...domainCases);
  }

  const sorted = candidates.sort((a, b) => b.overallScore - a.overallScore);
  if (sorted.length < 5) return;

  const CHUNK_SIZE = 50;
  const ANCHOR_SIZE = 5;
  const calibrationMap = new Map<number, number>();
  for (let offset = 0; offset < sorted.length; offset += CHUNK_SIZE - ANCHOR_SIZE) {
    const chunk = sorted.slice(offset, offset + CHUNK_SIZE);
    if (chunk.length < 5) break;

    const useCaseMarkdown = chunk
      .map(
        (uc) =>
          `| ${uc.useCaseNo} | ${uc.domain} | ${uc.name} | ${uc.type} | ${uc.statement} | ${uc.overallScore.toFixed(2)} |`
      )
      .join("\n");

    try {
      const result = await executeAIQuery({
        promptKey: "GLOBAL_SCORE_CALIBRATION_PROMPT",
        variables: {
          business_context: JSON.stringify(businessContext),
          strategic_goals: businessContext.strategicGoals ?? "",
          use_case_markdown: `| No | Domain | Name | Type | Statement | Current Score |\n|---|---|---|---|---|---|\n${useCaseMarkdown}`,
        },
        modelEndpoint: aiModel,
        responseFormat: "json_object",
        runId,
        step: "scoring",
      });

      let rawItems: unknown[];
      try {
        rawItems = parseJSONResponse<unknown[]>(result.rawResponse);
      } catch (parseErr) {
        logger.warn("Failed to parse calibration chunk JSON", {
          error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          chunkOffset: offset,
        });
        continue;
      }

      const items = validateLLMArray(rawItems, CalibrationItemSchema, "calibrateScoresChunked");
      for (const item of items) {
        if (!isNaN(item.no)) {
          calibrationMap.set(item.no, clampScore(item.overall_score));
        }
      }
    } catch (error) {
      logger.warn("Calibration chunk failed", {
        chunkOffset: offset,
        chunkSize: chunk.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const uc of useCases) {
    const calibrated = calibrationMap.get(uc.useCaseNo);
    if (calibrated !== undefined) {
      uc.overallScore = calibrated;
    }
  }

  logger.info("Chunked calibration complete", {
    candidatesConsidered: sorted.length,
    adjustedCount: calibrationMap.size,
    chunks: Math.ceil(sorted.length / (CHUNK_SIZE - ANCHOR_SIZE)),
  });
}

// ---------------------------------------------------------------------------
// Cross-domain deduplication
// ---------------------------------------------------------------------------

async function deduplicateCrossDomain(
  useCases: UseCase[],
  businessContext: Record<string, string>,
  aiModel: string,
  runId?: string
): Promise<Set<number>> {
  const renderCrossDedupRow = (uc: UseCase) =>
    `| ${uc.useCaseNo} | ${uc.domain} | ${uc.name} | ${uc.type} | ${uc.statement} | ${uc.overallScore.toFixed(2)} |`;

  const baseContextTokens = 1500;
  const batches = buildTokenAwareBatches(useCases, renderCrossDedupRow, baseContextTokens);

  // Build score lookup for safety guard
  const scoreMap = new Map<number, number>();
  for (const uc of useCases) {
    scoreMap.set(uc.useCaseNo, uc.overallScore);
  }

  const toRemove = new Set<number>();

  for (const batch of batches) {
    const useCaseMarkdown = batch.map(renderCrossDedupRow).join("\n");

    const result = await executeAIQuery({
      promptKey: "CROSS_DOMAIN_DEDUP_PROMPT",
      variables: {
        business_name: businessContext.businessName ?? "",
        strategic_goals: businessContext.strategicGoals ?? "",
        use_case_markdown: `| No | Domain | Name | Type | Statement | Score |\n|---|---|---|---|---|---|\n${useCaseMarkdown}`,
      },
      modelEndpoint: aiModel,
      responseFormat: "json_object",
      runId,
      step: "scoring",
    });

    let rawItems: unknown[];
    try {
      rawItems = parseJSONResponse<unknown[]>(result.rawResponse);
    } catch (parseErr) {
      logger.warn("Failed to parse cross-domain dedup response JSON", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      continue;
    }

    const items = validateLLMArray(rawItems, CrossDomainDedupItemSchema, "deduplicateCrossDomain");

    for (const item of items) {
      if (isNaN(item.no) || isNaN(item.duplicate_of)) continue;

      if (toRemove.has(item.duplicate_of)) {
        logger.warn("Cross-domain dedup: skipping removal — kept item already marked for removal", {
          wouldRemove: item.no,
          duplicateOf: item.duplicate_of,
        });
        continue;
      }

      const removeScore = scoreMap.get(item.no) ?? 0;
      const keepScore = scoreMap.get(item.duplicate_of) ?? 0;
      if (removeScore > keepScore) {
        logger.warn("Cross-domain dedup: LLM suggested removing higher-scored item — swapping", {
          suggested: item.no,
          suggestedScore: removeScore,
          duplicateOf: item.duplicate_of,
          duplicateOfScore: keepScore,
        });
        if (!toRemove.has(item.no)) {
          toRemove.add(item.duplicate_of);
        }
      } else {
        toRemove.add(item.no);
      }
    }
  }

  return toRemove;
}

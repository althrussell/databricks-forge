/**
 * Pipeline Step 6: Scoring & Deduplication
 *
 * Scores each use case on multiple dimensions using ai_query, then
 * removes duplicates and low-value entries.
 */

import { executeAIQuery, parseCSVResponse } from "@/lib/ai/agent";
import { updateRunMessage } from "@/lib/lakebase/runs";
import type { PipelineContext, UseCase } from "@/lib/domain/types";

export async function runScoring(ctx: PipelineContext, runId?: string): Promise<UseCase[]> {
  const { run, useCases } = ctx;
  if (!run.businessContext) throw new Error("Business context not available");
  if (useCases.length === 0) return [];

  const bc = run.businessContext;
  let scored = [...useCases];

  // Step 6a: Score per domain
  const domains = [...new Set(scored.map((uc) => uc.domain))];
  const bcRecord = bc as unknown as Record<string, string>;
  for (let di = 0; di < domains.length; di++) {
    const domain = domains[di];
    const domainCases = scored.filter((uc) => uc.domain === domain);
    if (runId) await updateRunMessage(runId, `Scoring domain: ${domain} (${domainCases.length} use cases, ${di + 1}/${domains.length})...`);
    try {
      await scoreDomain(domainCases, bcRecord, run.config.aiModel);
    } catch (error) {
      console.warn(`[scoring] Scoring failed for domain ${domain}:`, error);
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
      const toRemove = await deduplicateDomain(domainCases, run.config.aiModel);
      removedCount += toRemove.size;
      scored = scored.filter((uc) => !toRemove.has(uc.useCaseNo));
    } catch (error) {
      console.warn(`[scoring] Dedup failed for domain ${domain}:`, error);
    }
  }

  if (runId && removedCount > 0) {
    await updateRunMessage(runId, `Deduplication: removed ${removedCount} near-duplicates`);
  }

  // Step 6c: Sort by overall score and re-number with domain prefix
  scored.sort((a, b) => b.overallScore - a.overallScore);

  const domainCounters: Record<string, number> = {};
  for (const uc of scored) {
    if (!domainCounters[uc.domain]) domainCounters[uc.domain] = 0;
    domainCounters[uc.domain]++;
    const domainPrefix = uc.domain.substring(0, 3).toUpperCase();
    uc.useCaseNo = domainCounters[uc.domain];
    uc.id = `${domainPrefix}-${String(uc.useCaseNo).padStart(3, "0")}-${uc.id.substring(0, 8)}`;
  }

  // Step 6d: Volume filter -- cap at 200 use cases
  const MAX_USE_CASES = 200;
  if (scored.length > MAX_USE_CASES) {
    scored = scored.slice(0, MAX_USE_CASES);
  }

  const finalDomains = [...new Set(scored.map((uc) => uc.domain))].length;
  if (runId) await updateRunMessage(runId, `Final: ${scored.length} use cases across ${finalDomains} domains`);

  console.log(
    `[scoring] Final: ${scored.length} use cases across ${domains.length} domains`
  );

  return scored;
}

async function scoreDomain(
  domainCases: UseCase[],
  businessContext: Record<string, string>,
  aiModel: string
): Promise<void> {
  const useCaseMarkdown = domainCases
    .map(
      (uc) =>
        `| ${uc.useCaseNo} | ${uc.name} | ${uc.type} | ${uc.analyticsTechnique} | ${uc.statement} |`
    )
    .join("\n");

  const result = await executeAIQuery({
    promptKey: "SCORE_USE_CASES_PROMPT",
    variables: {
      business_context: JSON.stringify(businessContext),
      strategic_goals: businessContext.strategicGoals ?? "",
      business_priorities: businessContext.businessPriorities ?? "",
      strategic_initiative: businessContext.strategicInitiative ?? "",
      value_chain: businessContext.valueChain ?? "",
      revenue_model: businessContext.revenueModel ?? "",
      use_case_markdown: `| No | Name | Type | Technique | Statement |\n|---|---|---|---|---|\n${useCaseMarkdown}`,
    },
    modelEndpoint: aiModel,
    maxTokens: 4096,
  });

  // CSV: No, priority_score, feasibility_score, impact_score, overall_score
  const rows = parseCSVResponse(result.rawResponse, 5);
  const scoreMap = new Map<
    number,
    { priority: number; feasibility: number; impact: number; overall: number }
  >();

  for (const row of rows) {
    const no = parseInt(row[0], 10);
    if (isNaN(no)) continue;
    scoreMap.set(no, {
      priority: clampScore(parseFloat(row[1] ?? "0.5")),
      feasibility: clampScore(parseFloat(row[2] ?? "0.5")),
      impact: clampScore(parseFloat(row[3] ?? "0.5")),
      overall: clampScore(parseFloat(row[4] ?? "0.5")),
    });
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
  aiModel: string
): Promise<Set<number>> {
  const useCaseMarkdown = domainCases
    .map(
      (uc) =>
        `| ${uc.useCaseNo} | ${uc.name} | ${uc.type} | ${uc.statement} |`
    )
    .join("\n");

  const result = await executeAIQuery({
    promptKey: "REVIEW_USE_CASES_PROMPT",
    variables: {
      total_count: String(domainCases.length),
      use_case_markdown: `| No | Name | Type | Statement |\n|---|---|---|---|\n${useCaseMarkdown}`,
    },
    modelEndpoint: aiModel,
    maxTokens: 4096,
  });

  // CSV: No, action, reason
  const rows = parseCSVResponse(result.rawResponse, 3);
  const toRemove = new Set<number>();

  for (const row of rows) {
    const no = parseInt(row[0], 10);
    const action = row[1]?.trim().toLowerCase();
    if (!isNaN(no) && action === "remove") {
      toRemove.add(no);
    }
  }

  return toRemove;
}

function clampScore(value: number): number {
  if (isNaN(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

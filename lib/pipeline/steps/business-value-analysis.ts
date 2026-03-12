/**
 * Pipeline Step: Business Value Analysis
 *
 * Runs 4 lightweight LLM passes after scoring to produce:
 * 1. Financial quantification (dollar-value estimates per use case)
 * 2. Roadmap phasing (Quick Wins / Foundation / Transformation)
 * 3. Executive synthesis (key findings, recommendations, risks)
 * 4. Stakeholder analysis (roles, departments, change management)
 *
 * All passes use the fast model endpoint by default.
 */

import type {
  PipelineContext,
  UseCase,
  ValueType,
  ValueConfidence,
  RoadmapPhase,
  EffortEstimate,
  ExecutiveSynthesis,
} from "@/lib/domain/types";
import { executeAIQuery } from "@/lib/ai/agent";
import { resolveEndpoint } from "@/lib/dbx/client";
import { logger } from "@/lib/logger";
import { upsertValueEstimates, getValueEstimatesForRun } from "@/lib/lakebase/value-estimates";
import { upsertRoadmapPhases } from "@/lib/lakebase/roadmap-phases";
import { replaceStakeholderProfiles } from "@/lib/lakebase/stakeholder-profiles";
import { bulkInitTracking } from "@/lib/lakebase/use-case-tracking";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { withPrisma } from "@/lib/prisma";
import { buildStrategyAlignmentPrompt } from "@/lib/domain/strategy-alignment";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summariseCasesForLLM(useCases: UseCase[]): string {
  return JSON.stringify(
    useCases.map((uc) => ({
      use_case_id: uc.id,
      name: uc.name,
      type: uc.type,
      domain: uc.domain,
      statement: uc.statement,
      business_value: uc.businessValue,
      beneficiary: uc.beneficiary,
      sponsor: uc.sponsor,
      analytics_technique: uc.analyticsTechnique,
      tables_involved: uc.tablesInvolved,
      priority_score: uc.priorityScore,
      feasibility_score: uc.feasibilityScore,
      impact_score: uc.impactScore,
      overall_score: uc.overallScore,
    })),
    null,
    2,
  );
}

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const cleaned = raw
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Pass 1: Financial Quantification
// ---------------------------------------------------------------------------

async function runFinancialQuantification(
  ctx: PipelineContext,
  useCases: UseCase[],
): Promise<void> {
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const batchSize = 25;
  const batches = [];
  for (let i = 0; i < useCases.length; i += batchSize) {
    batches.push(useCases.slice(i, i + batchSize));
  }

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    if (batches.length > 1) {
      await updateRunMessage(
        run.runId,
        `Quantifying financial value (batch ${batchIdx + 1} of ${batches.length})...`,
      );
    }
    const variables: Record<string, string> = {
      business_name: run.config.businessName,
      industries: bc.industries,
      revenue_model: bc.revenueModel,
      strategic_goals: bc.strategicGoals,
      value_chain: bc.valueChain,
      estate_context: `${useCases.length} use cases across ${new Set(useCases.map((u) => u.domain)).size} domains`,
      use_cases_json: summariseCasesForLLM(batch),
    };

    try {
      const result = await executeAIQuery({
        runId: run.runId,
        promptKey: "FINANCIAL_QUANTIFICATION_PROMPT",
        variables,
        modelEndpoint: resolveEndpoint("classification"),
        responseFormat: "json_object",
      });

      type RawEstimate = {
        use_case_id: string;
        value_low: number;
        value_mid: number;
        value_high: number;
        value_type: string;
        confidence: string;
        rationale?: string;
        assumptions?: string[];
        industry_benchmark?: string;
      };
      const estimates = safeParse<RawEstimate[]>(result.rawResponse, []);

      if (estimates.length > 0) {
        await upsertValueEstimates(
          run.runId,
          estimates.map((e) => ({
            useCaseId: e.use_case_id,
            valueLow: Math.max(0, e.value_low ?? 0),
            valueMid: Math.max(0, e.value_mid ?? 0),
            valueHigh: Math.max(0, e.value_high ?? 0),
            valueType: (e.value_type || "efficiency_gain") as ValueType,
            confidence: (e.confidence || "medium") as ValueConfidence,
            rationale: e.rationale,
            assumptions: e.assumptions,
            industryBenchmark: e.industry_benchmark,
          })),
        );
      }
    } catch (err) {
      logger.warn("[business-value] Financial quantification batch failed", {
        error: String(err),
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Pass 2: Roadmap Phasing
// ---------------------------------------------------------------------------

async function runRoadmapPhasing(ctx: PipelineContext, useCases: UseCase[]): Promise<void> {
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const variables: Record<string, string> = {
    business_name: run.config.businessName,
    industries: bc.industries,
    strategic_goals: bc.strategicGoals,
    use_cases_json: summariseCasesForLLM(useCases),
  };

  try {
    const result = await executeAIQuery({
      runId: run.runId,
      promptKey: "ROADMAP_PHASING_PROMPT",
      variables,
      modelEndpoint: resolveEndpoint("classification"),
      responseFormat: "json_object",
    });

    type RawPhase = {
      use_case_id: string;
      phase: string;
      phase_order: number;
      effort_estimate?: string;
      dependencies?: string[];
      enablers?: string[];
      rationale?: string;
    };
    const phases = safeParse<RawPhase[]>(result.rawResponse, []);

    if (phases.length > 0) {
      await upsertRoadmapPhases(
        run.runId,
        phases.map((p) => ({
          useCaseId: p.use_case_id,
          phase: (p.phase || "foundation") as RoadmapPhase,
          phaseOrder: p.phase_order ?? 0,
          effortEstimate: (p.effort_estimate || "m") as EffortEstimate,
          dependencies: p.dependencies,
          enablers: p.enablers,
          rationale: p.rationale,
        })),
      );
    }
  } catch (err) {
    logger.warn("[business-value] Roadmap phasing failed", { error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Pass 3: Executive Synthesis
// ---------------------------------------------------------------------------

async function runExecutiveSynthesis(ctx: PipelineContext, useCases: UseCase[]): Promise<void> {
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const domains = [...new Set(useCases.map((u) => u.domain))];
  const topUseCases = [...useCases].sort((a, b) => b.overallScore - a.overallScore).slice(0, 15);

  const useCaseSummary = [
    `Total: ${useCases.length} use cases across ${domains.length} domains`,
    `Top domains: ${domains.slice(0, 5).join(", ")}`,
    `Score range: ${Math.min(...useCases.map((u) => u.overallScore)).toFixed(2)} - ${Math.max(...useCases.map((u) => u.overallScore)).toFixed(2)}`,
    `Types: AI ${useCases.filter((u) => u.type === "AI").length}, Statistical ${useCases.filter((u) => u.type === "Statistical").length}`,
    `Top 15 use cases:\n${topUseCases.map((u) => `- ${u.name} (${u.domain}, score: ${u.overallScore.toFixed(2)}): ${u.businessValue}`).join("\n")}`,
  ].join("\n");

  const strategyAlignment = run.config.industry
    ? buildStrategyAlignmentPrompt(
        run.config.industry,
        useCases.map((u) => u.name),
      )
    : null;

  const variables: Record<string, string> = {
    business_name: run.config.businessName,
    industries: bc.industries,
    strategic_goals: bc.strategicGoals,
    value_chain: bc.valueChain,
    use_case_summary: useCaseSummary,
    estate_summary: "Estate scan data available in full pipeline context",
    value_summary: `${useCases.length} use cases scored and ranked`,
    strategy_alignment: strategyAlignment || "No industry strategy alignment data available.",
  };

  try {
    const result = await executeAIQuery({
      runId: run.runId,
      promptKey: "EXECUTIVE_SYNTHESIS_PROMPT",
      variables,
      modelEndpoint: resolveEndpoint("classification"),
      responseFormat: "json_object",
    });

    type RawSynthesis = {
      key_findings?: Array<{
        title: string;
        description: string;
        domain: string | null;
        severity: string;
      }>;
      strategic_recommendations?: Array<{
        title: string;
        description: string;
        priority: string;
      }>;
      risk_callouts?: Array<{
        title: string;
        description: string;
        impact: string;
      }>;
    };
    const raw = safeParse<RawSynthesis>(result.rawResponse, {});

    const synthesis: ExecutiveSynthesis = {
      keyFindings: (raw.key_findings ?? []).map((f) => ({
        ...f,
        severity: f.severity as "opportunity" | "risk" | "insight",
      })),
      strategicRecommendations: (raw.strategic_recommendations ?? []).map((r) => ({
        ...r,
        priority: r.priority as "high" | "medium" | "low",
      })),
      riskCallouts: (raw.risk_callouts ?? []).map((r) => ({
        ...r,
        impact: r.impact as "high" | "medium" | "low",
      })),
      totalEstimatedValue: { low: 0, mid: 0, high: 0, currency: "USD" },
      quickWinCount: 0,
      topDomain: null,
    };

    if (synthesis.keyFindings.length > 0 || synthesis.strategicRecommendations.length > 0) {
      synthesis.quickWinCount = useCases.filter(
        (u) => u.feasibilityScore >= 0.7 && u.overallScore >= 0.6,
      ).length;
      synthesis.topDomain = domains[0] ?? null;

      await withPrisma(async (prisma) => {
        await prisma.forgeRun.update({
          where: { runId: run.runId },
          data: { synthesisJson: JSON.stringify(synthesis) },
        });
      });
    }
  } catch (err) {
    logger.warn("[business-value] Executive synthesis failed", { error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Pass 4: Stakeholder Analysis
// ---------------------------------------------------------------------------

async function runStakeholderAnalysis(ctx: PipelineContext, useCases: UseCase[]): Promise<void> {
  const { run } = ctx;
  const bc = run.businessContext;
  if (!bc || useCases.length === 0) return;

  const stakeholderData = useCases.map((uc) => ({
    use_case_id: uc.id,
    name: uc.name,
    domain: uc.domain,
    type: uc.type,
    beneficiary: uc.beneficiary,
    sponsor: uc.sponsor,
    overall_score: uc.overallScore,
  }));

  const variables: Record<string, string> = {
    business_name: run.config.businessName,
    industries: bc.industries,
    stakeholder_json: JSON.stringify(stakeholderData, null, 2),
  };

  try {
    const result = await executeAIQuery({
      runId: run.runId,
      promptKey: "STAKEHOLDER_ANALYSIS_PROMPT",
      variables,
      modelEndpoint: resolveEndpoint("classification"),
      responseFormat: "json_object",
    });

    type RawProfile = {
      role: string;
      department: string;
      use_case_ids?: string[];
      use_case_count: number;
      domains: string[];
      use_case_types: Record<string, number>;
      change_complexity: "low" | "medium" | "high";
      is_champion: boolean;
      is_sponsor: boolean;
    };
    const profiles = safeParse<RawProfile[]>(result.rawResponse, []);

    if (profiles.length > 0) {
      const estimates = await getValueEstimatesForRun(run.runId);
      const valueByUseCase = new Map(estimates.map((e) => [e.useCaseId, e.valueMid]));

      await replaceStakeholderProfiles(
        run.runId,
        profiles.map((p) => {
          const ucIds = p.use_case_ids ?? [];
          const totalValue = ucIds.reduce((sum, id) => sum + (valueByUseCase.get(id) ?? 0), 0);
          return {
            role: p.role || "Unknown",
            department: p.department || "Unknown",
            useCaseCount: p.use_case_count ?? 0,
            totalValue,
            domains: p.domains ?? [],
            useCaseTypes: p.use_case_types ?? {},
            changeComplexity: p.change_complexity || "medium",
            isChampion: p.is_champion ?? false,
            isSponsor: p.is_sponsor ?? false,
          };
        }),
      );
    }
  } catch (err) {
    logger.warn("[business-value] Stakeholder analysis failed", { error: String(err) });
  }
}

// ---------------------------------------------------------------------------
// Main step entry point
// ---------------------------------------------------------------------------

export async function runBusinessValueAnalysis(ctx: PipelineContext): Promise<void> {
  const useCases = ctx.useCases;

  if (!useCases || useCases.length === 0) {
    logger.info("[business-value] No use cases to analyze, skipping");
    return;
  }

  logger.info("[business-value] Starting business value analysis", {
    useCaseCount: useCases.length,
  });

  // Initialize tracking records for all use cases
  await bulkInitTracking(
    ctx.run.runId,
    useCases.map((u) => u.id),
  );

  const runId = ctx.run.runId;

  // Run passes in sequence (each is a single LLM call, fast model)
  await updateRunMessage(runId, "Quantifying financial value estimates...", 86);
  await runFinancialQuantification(ctx, useCases);

  await updateRunMessage(runId, "Building implementation roadmap phases...", 87);
  await runRoadmapPhasing(ctx, useCases);

  await updateRunMessage(runId, "Generating executive synthesis...", 88);
  await runExecutiveSynthesis(ctx, useCases);

  await updateRunMessage(runId, "Analyzing stakeholder profiles...", 89);
  await runStakeholderAnalysis(ctx, useCases);

  logger.info("[business-value] Business value analysis complete");
}

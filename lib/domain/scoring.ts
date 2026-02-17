/**
 * Use case scoring utilities.
 *
 * Local (non-LLM) helpers for score calculations and ranking.
 */

import type { UseCase } from "./types";

/**
 * Compute the weighted overall score from individual dimensions.
 * Weights: priority 0.3, feasibility 0.2, impact 0.5
 */
export function computeOverallScore(
  priorityScore: number,
  feasibilityScore: number,
  impactScore: number
): number {
  return Number(
    (priorityScore * 0.3 + feasibilityScore * 0.2 + impactScore * 0.5).toFixed(3)
  );
}

/**
 * Score tier classification for UI display.
 */
export type ScoreTier = "high" | "medium" | "low";

export function getScoreTier(score: number): ScoreTier {
  if (score >= 0.7) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

/**
 * Sort use cases by overall score descending, then by domain.
 */
export function rankUseCases(useCases: UseCase[]): UseCase[] {
  return [...useCases].sort((a, b) => {
    if (b.overallScore !== a.overallScore) {
      return b.overallScore - a.overallScore;
    }
    return a.domain.localeCompare(b.domain);
  });
}

/**
 * Group use cases by domain.
 */
export function groupByDomain(
  useCases: UseCase[]
): Record<string, UseCase[]> {
  const groups: Record<string, UseCase[]> = {};
  for (const uc of useCases) {
    if (!groups[uc.domain]) groups[uc.domain] = [];
    groups[uc.domain].push(uc);
  }
  return groups;
}

/**
 * Compute domain-level statistics.
 */
export interface DomainStats {
  domain: string;
  count: number;
  avgScore: number;
  topScore: number;
  aiCount: number;
  statsCount: number;
}

export function computeDomainStats(useCases: UseCase[]): DomainStats[] {
  const groups = groupByDomain(useCases);

  return Object.entries(groups)
    .map(([domain, cases]) => ({
      domain,
      count: cases.length,
      avgScore: Number(
        (
          cases.reduce((sum, uc) => sum + uc.overallScore, 0) / cases.length
        ).toFixed(3)
      ),
      topScore: Math.max(...cases.map((uc) => uc.overallScore)),
      aiCount: cases.filter((uc) => uc.type === "AI").length,
      statsCount: cases.filter((uc) => uc.type === "Statistical").length,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);
}

// ---------------------------------------------------------------------------
// Schema Coverage Analysis
// ---------------------------------------------------------------------------

export interface SchemaCoverage {
  /** Total tables in the filtered estate */
  totalTables: number;
  /** Tables referenced by at least one use case */
  coveredTables: number;
  /** Tables not referenced by any use case (expansion signals) */
  uncoveredTables: string[];
  /** Coverage percentage */
  coveragePct: number;
  /** Tables with most use case references (most valuable data assets) */
  topTables: Array<{ fqn: string; useCaseCount: number }>;
}

/**
 * Compute which tables from the estate have use cases and which don't.
 * Uncovered tables in data-rich domains are expansion signals for account teams.
 */
export function computeSchemaCoverage(
  filteredTables: string[],
  useCases: UseCase[]
): SchemaCoverage {
  // Build a count of how many use cases reference each table
  const tableCounts = new Map<string, number>();
  for (const fqn of filteredTables) {
    tableCounts.set(fqn.replace(/`/g, ""), 0);
  }
  for (const uc of useCases) {
    for (const fqn of uc.tablesInvolved) {
      const clean = fqn.replace(/`/g, "");
      tableCounts.set(clean, (tableCounts.get(clean) ?? 0) + 1);
    }
  }

  const covered: string[] = [];
  const uncovered: string[] = [];
  for (const [fqn, count] of tableCounts) {
    if (count > 0) {
      covered.push(fqn);
    } else {
      uncovered.push(fqn);
    }
  }

  // Top tables by use case count
  const topTables = [...tableCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 20)
    .map(([fqn, useCaseCount]) => ({ fqn, useCaseCount }));

  return {
    totalTables: filteredTables.length,
    coveredTables: covered.length,
    uncoveredTables: uncovered,
    coveragePct: filteredTables.length > 0
      ? Math.round((covered.length / filteredTables.length) * 100)
      : 0,
    topTables,
  };
}

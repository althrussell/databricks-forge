/**
 * Industry coverage computation -- shared between client UI and server API.
 *
 * Pure logic: no React, no hooks, no DOM. Safe for both `"use client"` and
 * server-side imports.
 */

import type { UseCase } from "@/lib/domain/types";
import type {
  IndustryOutcome,
  StrategicPriority,
  ReferenceUseCase,
} from "@/lib/domain/industry-outcomes";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PriorityCoverage {
  priority: StrategicPriority;
  objective: string;
  matchedUseCases: UseCase[];
  unmatchedRefUseCases: ReferenceUseCase[];
  coverageRatio: number;
}

export interface CoverageResult {
  priorities: PriorityCoverage[];
  overallCoverage: number;
  totalRefUseCases: number;
  coveredRefUseCases: number;
  gapCount: number;
  missingDataEntities: Array<{ entity: string; useCaseCount: number }>;
  missingSourceSystems: Array<{ system: string; useCaseCount: number }>;
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeIndustryCoverage(
  industry: IndustryOutcome,
  useCases: UseCase[]
): CoverageResult {
  const priorities: PriorityCoverage[] = [];
  let totalRef = 0;
  let coveredRef = 0;

  const ucNameWords = useCases.map((uc) => ({
    uc,
    words: new Set(
      (uc.name + " " + uc.statement)
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    ),
  }));

  const entityCounts = new Map<string, number>();
  const systemCounts = new Map<string, number>();

  for (const objective of industry.objectives) {
    for (const priority of objective.priorities) {
      const matched: UseCase[] = [];
      const unmatched: ReferenceUseCase[] = [];

      for (const refUc of priority.useCases) {
        totalRef++;
        const refWords = new Set(
          (refUc.name + " " + refUc.description)
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 3)
        );

        let bestMatch: UseCase | null = null;
        let bestOverlap = 0;
        for (const { uc, words } of ucNameWords) {
          const overlap = [...refWords].filter((w) => words.has(w)).length;
          const overlapRatio = overlap / Math.max(refWords.size, 1);
          if (overlapRatio > bestOverlap && overlapRatio >= 0.25) {
            bestOverlap = overlapRatio;
            bestMatch = uc;
          }
        }
        if (bestMatch && !matched.includes(bestMatch)) {
          matched.push(bestMatch);
          coveredRef++;
        } else if (!bestMatch) {
          unmatched.push(refUc);
          for (const entity of refUc.typicalDataEntities ?? []) {
            entityCounts.set(entity, (entityCounts.get(entity) ?? 0) + 1);
          }
          for (const system of refUc.typicalSourceSystems ?? []) {
            systemCounts.set(system, (systemCounts.get(system) ?? 0) + 1);
          }
        }
      }

      priorities.push({
        priority,
        objective: objective.name,
        matchedUseCases: matched,
        unmatchedRefUseCases: unmatched,
        coverageRatio:
          priority.useCases.length > 0
            ? matched.length / priority.useCases.length
            : 0,
      });
    }
  }

  const missingDataEntities = [...entityCounts.entries()]
    .map(([entity, useCaseCount]) => ({ entity, useCaseCount }))
    .sort((a, b) => b.useCaseCount - a.useCaseCount);

  const missingSourceSystems = [...systemCounts.entries()]
    .map(([system, useCaseCount]) => ({ system, useCaseCount }))
    .sort((a, b) => b.useCaseCount - a.useCaseCount);

  return {
    priorities,
    overallCoverage: totalRef > 0 ? coveredRef / totalRef : 0,
    totalRefUseCases: totalRef,
    coveredRefUseCases: coveredRef,
    gapCount: totalRef - coveredRef,
    missingDataEntities,
    missingSourceSystems,
  };
}

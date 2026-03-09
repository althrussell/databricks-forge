/**
 * Industry Enrichment skill -- dynamic, built at runtime from outcome maps.
 *
 * Extracts fields currently NOT injected into Genie or Ask Forge prompts:
 *   - typicalDataEntities per use case (expected tables/columns in this domain)
 *   - typicalSourceSystems per use case (where data originates)
 *   - businessValue per use case (ROI framing)
 *   - KPIs per priority (success metrics)
 *   - Personas per priority (who consumes the analysis)
 *
 * Unlike the static skills, this module builds SkillChunks dynamically
 * based on the detected industry.
 */

import type { SkillChunk, SkillSection } from "../types";
import type { IndustryOutcome } from "@/lib/domain/industry-outcomes";
import { getIndustryOutcome } from "@/lib/domain/industry-outcomes";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build skill chunks from an industry outcome map.
 * Returns an empty array if the industry is not found.
 */
export function buildIndustrySkillChunks(industryId: string): SkillChunk[] {
  const outcome = getIndustryOutcome(industryId);
  if (!outcome) return [];

  const chunks: SkillChunk[] = [];

  const kpis = extractKPIs(outcome);
  if (kpis) {
    chunks.push({
      id: `industry-kpis-${industryId}`,
      title: `${outcome.name} KPIs`,
      content: kpis,
      category: "kpis",
    });
  }

  const entities = extractDataEntities(outcome);
  if (entities) {
    chunks.push({
      id: `industry-entities-${industryId}`,
      title: `${outcome.name} Data Entities`,
      content: entities,
      category: "vocabulary",
    });
  }

  const personas = extractPersonas(outcome);
  if (personas) {
    chunks.push({
      id: `industry-personas-${industryId}`,
      title: `${outcome.name} Personas`,
      content: personas,
      category: "vocabulary",
    });
  }

  const valueFraming = extractBusinessValue(outcome);
  if (valueFraming) {
    chunks.push({
      id: `industry-value-${industryId}`,
      title: `${outcome.name} Business Value`,
      content: valueFraming,
      category: "kpis",
    });
  }

  return chunks;
}

/**
 * Build ready-to-inject context sections from an industry outcome map.
 * Convenience wrapper over buildIndustrySkillChunks for direct prompt injection.
 */
export function buildIndustrySkillSections(
  industryId: string,
): SkillSection[] {
  return buildIndustrySkillChunks(industryId).map((c) => ({
    title: c.title,
    content: c.content,
  }));
}

/**
 * Build a compact domain question patterns block for benchmark generation.
 * Returns example question templates grounded in industry KPIs and entities.
 */
export function buildDomainQuestionPatterns(industryId: string): string {
  const outcome = getIndustryOutcome(industryId);
  if (!outcome) return "";

  const patterns: string[] = [
    `Domain Question Patterns for ${outcome.name}:`,
  ];

  for (const obj of outcome.objectives) {
    for (const pri of obj.priorities) {
      if (pri.kpis.length === 0) continue;
      const kpi = pri.kpis[0];
      patterns.push(
        `- "What is the ${kpi.toLowerCase()} by [dimension] for [time period]?"`,
      );
      if (patterns.length >= 6) break;
    }
    if (patterns.length >= 6) break;
  }

  return patterns.join("\n");
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractKPIs(outcome: IndustryOutcome): string | null {
  const lines: string[] = [`Industry KPIs for ${outcome.name}:`];

  for (const obj of outcome.objectives) {
    for (const pri of obj.priorities) {
      if (pri.kpis.length === 0) continue;
      lines.push(`${pri.name}: ${pri.kpis.join("; ")}`);
    }
  }

  return lines.length > 1 ? lines.join("\n") : null;
}

function extractDataEntities(outcome: IndustryOutcome): string | null {
  const entitySet = new Set<string>();

  for (const obj of outcome.objectives) {
    for (const pri of obj.priorities) {
      for (const uc of pri.useCases) {
        for (const entity of uc.typicalDataEntities ?? []) {
          entitySet.add(entity);
        }
      }
    }
  }

  if (entitySet.size === 0) return null;

  const sorted = Array.from(entitySet).sort();
  return `Typical Data Entities for ${outcome.name}:\n${sorted.join(", ")}`;
}

function extractPersonas(outcome: IndustryOutcome): string | null {
  const personaSet = new Set<string>();

  for (const obj of outcome.objectives) {
    for (const pri of obj.priorities) {
      for (const persona of pri.personas) {
        personaSet.add(persona);
      }
    }
  }

  if (personaSet.size === 0) return null;

  const sorted = Array.from(personaSet).sort();
  return `Key Personas for ${outcome.name}:\n${sorted.join(", ")}`;
}

function extractBusinessValue(outcome: IndustryOutcome): string | null {
  const lines: string[] = [
    `Business Value Themes for ${outcome.name}:`,
  ];
  let count = 0;

  for (const obj of outcome.objectives) {
    for (const pri of obj.priorities) {
      for (const uc of pri.useCases) {
        if (!uc.businessValue) continue;
        lines.push(`- ${uc.name}: ${uc.businessValue}`);
        count++;
        if (count >= 8) break;
      }
      if (count >= 8) break;
    }
    if (count >= 8) break;
  }

  return count > 0 ? lines.join("\n") : null;
}

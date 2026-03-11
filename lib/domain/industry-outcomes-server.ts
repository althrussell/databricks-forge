/**
 * Server-only async functions for industry outcome maps.
 *
 * These functions access Lakebase (via Prisma) to merge built-in outcomes
 * with user-uploaded custom outcome maps. They MUST NOT be imported from
 * client components — use the /api/outcome-maps/registry endpoint instead.
 *
 * @module server-only
 */

import { INDUSTRY_OUTCOMES, getIndustryOutcome, type IndustryOutcome } from "./industry-outcomes";
import { getMasterRepoEnrichment } from "./industry-outcomes/master-repo-registry";
import type { MasterRepoUseCase } from "./industry-outcomes/master-repo-types";

// ---------------------------------------------------------------------------
// Dynamic Registry (built-in + custom from Lakebase)
// ---------------------------------------------------------------------------

/**
 * Load ALL industry outcomes (built-in + user-uploaded custom maps).
 * Custom maps override built-in if they share the same id.
 */
export async function getAllIndustryOutcomes(): Promise<IndustryOutcome[]> {
  try {
    const { loadAllCustomOutcomes } = await import("@/lib/lakebase/outcome-maps");
    const customOutcomes = await loadAllCustomOutcomes();

    // Custom maps override built-in if same id
    const customIds = new Set(customOutcomes.map((c) => c.id));
    const builtIn = INDUSTRY_OUTCOMES.filter((i) => !customIds.has(i.id));

    return [...builtIn, ...customOutcomes];
  } catch {
    // Fallback to built-in if DB is unavailable
    return INDUSTRY_OUTCOMES;
  }
}

/**
 * Look up an industry outcome by id, checking custom maps first, then built-in.
 * Async — for server-side code with DB access.
 */
export async function getIndustryOutcomeAsync(id: string): Promise<IndustryOutcome | undefined> {
  // Check built-in first (fast path)
  const builtIn = getIndustryOutcome(id);
  if (builtIn) return builtIn;

  // Check custom maps
  try {
    const { getOutcomeMapByIndustryId } = await import("@/lib/lakebase/outcome-maps");
    const custom = await getOutcomeMapByIndustryId(id);
    return custom?.parsedOutcome ?? undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Auto-detection -- match LLM-generated industries string to an outcome map
// ---------------------------------------------------------------------------

/**
 * Curated aliases mapping common generic terms the LLM may produce to the
 * canonical outcome map id.  Each key is lowercase; values are outcome ids.
 * Multiple aliases can map to the same id.
 */
const INDUSTRY_ALIASES: Record<string, string> = {
  "financial services": "banking",
  fintech: "banking",
  neobank: "banking",
  "wealth management": "banking",
  "capital markets": "banking",
  payments: "banking",
  pharma: "hls",
  pharmaceutical: "hls",
  pharmaceuticals: "hls",
  healthcare: "hls",
  "life sciences": "hls",
  biotech: "hls",
  biotechnology: "hls",
  "medical devices": "hls",
  retail: "rcg",
  "consumer goods": "rcg",
  cpg: "rcg",
  ecommerce: "rcg",
  "e-commerce": "rcg",
  grocery: "rcg",
  fashion: "rcg",
  hospitality: "rcg",
  travel: "rcg",
  telco: "communications",
  telecom: "communications",
  telecommunications: "communications",
  broadband: "communications",
  isp: "communications",
  energy: "energy-utilities",
  utilities: "energy-utilities",
  "oil and gas": "energy-utilities",
  "oil & gas": "energy-utilities",
  renewables: "energy-utilities",
  mining: "energy-utilities",
  water: "water-utilities",
  wastewater: "water-utilities",
  media: "media-advertising",
  advertising: "media-advertising",
  adtech: "media-advertising",
  streaming: "media-advertising",
  publishing: "media-advertising",
  technology: "digital-natives",
  saas: "digital-natives",
  software: "digital-natives",
  cloud: "digital-natives",
  platform: "digital-natives",
  gaming: "games",
  esports: "games",
  igaming: "sports-betting",
  rail: "rail-transport",
  railway: "rail-transport",
  freight: "rail-transport",
  logistics: "rail-transport",
  transport: "rail-transport",
  automotive: "automotive-mobility",
  mobility: "automotive-mobility",
  oem: "automotive-mobility",
  vehicle: "automotive-mobility",
  fleet: "automotive-mobility",
  betting: "sports-betting",
  wagering: "sports-betting",
  gambling: "sports-betting",
  lotteries: "sports-betting",
  underwriting: "insurance",
  reinsurance: "insurance",
  claims: "insurance",
  insurtech: "insurance",
  manufacturing: "manufacturing",
  industrial: "manufacturing",
  aerospace: "manufacturing",
  defense: "manufacturing",
  semiconductors: "manufacturing",
  superannuation: "superannuation",
  "super fund": "superannuation",
  "pension fund": "superannuation",
  "retirement fund": "superannuation",
  retirement: "superannuation",
  pension: "superannuation",
  annuity: "superannuation",
  "defined benefit": "superannuation",
  "defined contribution": "superannuation",
};

/** Words too generic to contribute meaningful signal on their own. */
const STOP_WORDS = new Set([
  "and",
  "the",
  "for",
  "with",
  "from",
  "services",
  "solutions",
  "management",
  "data",
  "digital",
  "analytics",
  "operations",
  "group",
  "company",
  "industry",
  "sector",
  "business",
]);

/**
 * Attempt to match a free-text industries description (from BusinessContext)
 * against available outcome maps using keyword matching + curated aliases.
 *
 * Returns the `id` of the best-matching outcome map, or `null` if no
 * confident match is found. Used by the pipeline engine to auto-select
 * an industry when the user hasn't chosen one manually.
 */
export async function detectIndustryFromContext(industriesStr: string): Promise<string | null> {
  if (!industriesStr.trim()) return null;

  const outcomes = await getAllIndustryOutcomes();

  // Tokenise the input into lowercase keywords (split on commas, &, /, spaces)
  const inputTokens = industriesStr
    .toLowerCase()
    .split(/[,&/]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);

  // Also build a flat lowercase string for substring matching
  const inputLower = industriesStr.toLowerCase();

  // --- Phase 1: Alias-based detection (handles generic LLM outputs) --------
  // Tally alias hits per outcome id -- aliases are curated so high confidence.
  const aliasHits: Record<string, number> = {};
  for (const [alias, outcomeId] of Object.entries(INDUSTRY_ALIASES)) {
    if (inputLower.includes(alias)) {
      aliasHits[outcomeId] = (aliasHits[outcomeId] ?? 0) + 1;
    }
  }

  // --- Phase 2: Keyword scoring against each outcome map -------------------
  let bestId: string | null = null;
  let bestScore = 0;

  for (const outcome of outcomes) {
    let score = 0;

    const nameLower = outcome.name.toLowerCase();
    const nameWords = nameLower.split(/[\s&/,]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const subVerticals = (outcome.subVerticals ?? []).map((sv) => sv.toLowerCase());

    // 1. Exact name match (strongest signal, word-boundary aware)
    const nameRe = new RegExp(
      `(?:^|[\\s,;&/])${nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:$|[\\s,;&/])`,
      "i",
    );
    if (nameRe.test(inputLower) || inputLower === nameLower) {
      score += 10;
    }

    // 2. Name keyword hits (e.g. "banking" appears in input)
    for (const word of nameWords) {
      if (inputLower.includes(word)) {
        score += 3;
      }
    }

    // 3. Sub-vertical matches (e.g. "Commercial Banking" in input)
    for (const sv of subVerticals) {
      if (inputLower.includes(sv)) {
        score += 5;
      }
      // Partial token matching against the full sub-vertical string.
      // Input tokens are NOT filtered by stop words -- the LLM output may
      // legitimately contain words like "services" or "management" that
      // carry meaningful signal when matched against sub-verticals.
      for (const token of inputTokens) {
        const trimmed = token.trim();
        if (trimmed.length <= 3) continue;
        if (sv.includes(trimmed)) {
          score += 2;
        }
      }
    }

    // 4. ID match (e.g. input contains "insurance" and id is "insurance")
    if (inputLower.includes(outcome.id.replace(/-/g, " "))) {
      score += 4;
    }

    // 5. Alias bonus -- curated aliases are high-confidence
    const aliasCount = aliasHits[outcome.id] ?? 0;
    score += aliasCount * 4;

    if (score > bestScore) {
      bestScore = score;
      bestId = outcome.id;
    }
  }

  // A score of 3+ means at least one strong keyword or alias match
  return bestScore >= 3 ? bestId : null;
}

// ---------------------------------------------------------------------------
// Prompt Building Helpers (async, server-only)
// ---------------------------------------------------------------------------

/**
 * Build a markdown-formatted string of reference use cases for prompt injection.
 * Filters to the most relevant priorities based on selected business domains.
 */
export async function buildReferenceUseCasesPrompt(
  industryId: string,
  businessDomains?: string,
  maxUseCases: number = 40,
): Promise<string> {
  const industry = await getIndustryOutcomeAsync(industryId);
  if (!industry) return "";
  const domainTokens = (businessDomains ?? "")
    .toLowerCase()
    .split(/[,\n]+/)
    .map((d) => d.trim())
    .filter(Boolean);

  const isRelevant = (text: string): boolean => {
    if (domainTokens.length === 0) return true;
    const lower = text.toLowerCase();
    return domainTokens.some((tok) => lower.includes(tok));
  };

  const lines: string[] = [
    `### INDUSTRY REFERENCE USE CASES (${industry.name})`,
    "",
    "The following are recognized high-value use cases for this industry.",
    "Use these as strategic inspiration -- adapt them to the specific tables and",
    "metadata available. Generate use cases that align with these patterns WHERE",
    "the customer's data supports them. Do NOT copy these verbatim; ground every",
    "use case in the actual table schemas provided.",
    "",
  ];

  // Build lookup of Master Repository enrichment by use case name
  const enrichment = getMasterRepoEnrichment(industryId);
  const enrichmentIndex = new Map<string, MasterRepoUseCase>();
  if (enrichment) {
    for (const uc of enrichment.useCases) {
      enrichmentIndex.set(uc.name.toLowerCase(), uc);
    }
  }

  let count = 0;
  for (const objective of industry.objectives) {
    if (count >= maxUseCases) break;
    if (!isRelevant(objective.name) && domainTokens.length > 0) continue;
    lines.push(`#### ${objective.name}`);
    lines.push("");

    for (const priority of objective.priorities) {
      if (count >= maxUseCases) break;
      if (!isRelevant(priority.name) && domainTokens.length > 0) continue;
      lines.push(`**Strategic Priority: ${priority.name}**`);

      for (const uc of priority.useCases) {
        if (count >= maxUseCases) break;
        if (!isRelevant(`${uc.name} ${uc.description}`) && domainTokens.length > 0) {
          continue;
        }
        let line = `- **${uc.name}**: ${uc.description}`;

        // Append Master Repository enrichment (benchmark, model type, strategy)
        const mr = enrichmentIndex.get(uc.name.toLowerCase());
        if (mr) {
          const extras: string[] = [];
          if (mr.benchmarkImpact && mr.kpiTarget) {
            extras.push(`KPI: ${mr.kpiTarget} (${mr.benchmarkImpact})`);
          }
          if (mr.modelType) {
            extras.push(`Model: ${mr.modelType}`);
          }
          if (mr.strategicImperative) {
            extras.push(`Strategy: ${mr.strategicImperative}`);
          }
          if (extras.length > 0) {
            line += ` [${extras.join(" | ")}]`;
          }
        }

        lines.push(line);
        count++;
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Build industry context string for business context prompt enrichment.
 */
export async function buildIndustryContextPrompt(industryId: string): Promise<string> {
  const industry = await getIndustryOutcomeAsync(industryId);
  if (!industry) return "";

  const lines: string[] = [
    `### INDUSTRY CONTEXT (${industry.name})`,
    "",
    `This organization operates in the **${industry.name}** industry.`,
  ];

  if (industry.subVerticals?.length) {
    lines.push(`Sub-verticals include: ${industry.subVerticals.join(", ")}.`);
  }

  lines.push("");
  lines.push("**Key strategic objectives and context for this industry:**");
  lines.push("");

  for (const objective of industry.objectives) {
    lines.push(`#### ${objective.name}`);
    lines.push(objective.whyChange);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build industry KPIs string for scoring prompt enrichment.
 * Includes benchmark impacts from Master Repository when available.
 */
export async function buildIndustryKPIsPrompt(industryId: string): Promise<string> {
  const industry = await getIndustryOutcomeAsync(industryId);
  if (!industry) return "";

  const lines: string[] = [
    `### INDUSTRY-SPECIFIC KPIs (${industry.name})`,
    "",
    "Use these industry-specific KPIs and personas to better assess strategic alignment and value:",
    "",
  ];

  for (const objective of industry.objectives) {
    for (const priority of objective.priorities) {
      if (priority.kpis.length > 0) {
        lines.push(`**${priority.name}**: ${priority.kpis.join("; ")}`);
      }
    }
  }

  // Append benchmark calibration data from Master Repository
  const enrichment = getMasterRepoEnrichment(industryId);
  if (enrichment) {
    const benchmarks = enrichment.useCases
      .filter((uc) => uc.benchmarkImpact && uc.kpiTarget)
      .slice(0, 10);

    if (benchmarks.length > 0) {
      lines.push("");
      lines.push("**Industry Benchmark Calibration:**");
      for (const uc of benchmarks) {
        const src = uc.benchmarkSource ? ` (${uc.benchmarkSource})` : "";
        lines.push(`- ${uc.name}: ${uc.kpiTarget} ${uc.benchmarkImpact}${src}`);
      }
    }
  }

  lines.push("");
  lines.push(
    "Use cases that directly address these KPIs should receive higher strategic alignment scores.",
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Reference Data Asset Context (for Comment Engine + future consumers)
// ---------------------------------------------------------------------------

/**
 * Build a prompt block listing all Reference Data Assets for an industry.
 * Each asset includes its name, family, description, and system location.
 *
 * This gives an LLM the industry's standard data vocabulary so it can
 * understand what tables represent and use industry-appropriate terminology.
 */
export async function buildDataAssetContext(
  industryId: string,
): Promise<{ text: string; assets: Array<{ id: string; name: string; description: string; assetFamily: string }> }> {
  const enrichment = getMasterRepoEnrichment(industryId);
  const industry = await getIndustryOutcomeAsync(industryId);

  if (!enrichment || enrichment.dataAssets.length === 0) {
    return { text: "", assets: [] };
  }

  const industryName = industry?.name ?? industryId;

  const lines: string[] = [
    `### INDUSTRY DATA ASSETS (${industryName})`,
    "",
    "These are the standard data assets in this industry. Use them to understand",
    "what tables represent and to use industry-appropriate terminology:",
    "",
  ];

  const assets: Array<{ id: string; name: string; description: string; assetFamily: string }> = [];

  for (const asset of enrichment.dataAssets) {
    lines.push(
      `- **${asset.id}: ${asset.name}** [${asset.assetFamily}] -- ${asset.description}` +
        (asset.systemLocation ? ` (typical system: ${asset.systemLocation})` : ""),
    );
    assets.push({
      id: asset.id,
      name: asset.name,
      description: asset.description,
      assetFamily: asset.assetFamily,
    });
  }

  return { text: lines.join("\n"), assets };
}

/**
 * Build a prompt block showing which use cases each data asset powers,
 * including criticality levels and benchmark impacts.
 *
 * Given a set of matched data asset IDs (from schema classification),
 * this tells the LLM WHY each asset matters -- not just what it stores
 * but what business outcomes it enables.
 */
export async function buildUseCaseLinkageContext(
  industryId: string,
  matchedAssetIds: string[],
): Promise<string> {
  if (matchedAssetIds.length === 0) return "";

  const enrichment = getMasterRepoEnrichment(industryId);
  if (!enrichment) return "";

  const matchedSet = new Set(matchedAssetIds);

  const lines: string[] = [
    "### DATA ASSET BUSINESS CONTEXT",
    "",
    "Tables matching these data assets power the following business use cases:",
    "",
  ];

  const useCasesByAsset = new Map<string, Array<{ name: string; criticality: string; impact: string }>>();

  for (const uc of enrichment.useCases) {
    for (const assetId of uc.dataAssetIds ?? []) {
      if (!matchedSet.has(assetId)) continue;

      if (!useCasesByAsset.has(assetId)) useCasesByAsset.set(assetId, []);

      const criticality = uc.dataAssetCriticality?.[assetId] ?? "VA";
      const critLabel = criticality === "MC" ? "Mission-Critical" : "Value-Add";
      const impact = uc.benchmarkImpact && uc.kpiTarget
        ? `${uc.kpiTarget} ${uc.benchmarkImpact}`
        : "";

      useCasesByAsset.get(assetId)!.push({
        name: uc.name,
        criticality: critLabel,
        impact,
      });
    }
  }

  const assetNames = new Map(enrichment.dataAssets.map((a) => [a.id, a.name]));

  for (const [assetId, useCases] of useCasesByAsset) {
    const assetName = assetNames.get(assetId) ?? assetId;
    const mcUseCases = useCases.filter((uc) => uc.criticality === "Mission-Critical");
    const vaUseCases = useCases.filter((uc) => uc.criticality === "Value-Add");

    const parts = [`- **${assetId} (${assetName})**:`];

    if (mcUseCases.length > 0) {
      const mcNames = mcUseCases
        .slice(0, 5)
        .map((uc) => uc.name + (uc.impact ? ` (${uc.impact})` : ""))
        .join("; ");
      parts.push(`  Mission-Critical for: ${mcNames}`);
    }
    if (vaUseCases.length > 0) {
      const vaNames = vaUseCases
        .slice(0, 3)
        .map((uc) => uc.name)
        .join("; ");
      parts.push(`  Value-Add for: ${vaNames}`);
    }

    lines.push(parts.join("\n"));
  }

  return lines.join("\n");
}

/**
 * LLM Intelligence Layer for Environment Scans.
 *
 * Orchestrates 7 analysis passes + 1 composite governance pass using the
 * FMAPI client. Each pass processes tables in token-aware adaptive batches,
 * uses JSON mode, and runs independently with graceful error handling.
 *
 * Passes:
 *   1. Domain Categorisation
 *   2. PII / Sensitivity Detection
 *   3. Auto-Generated Table Descriptions
 *   4. Redundancy / Duplication Detection
 *   5. Implicit Relationship Discovery
 *   6. Medallion Tier Classification
 *   7. Data Product Identification
 *   8. Governance Gap Analysis (composite)
 */

import {
  chatCompletion,
  type ChatMessage,
} from "@/lib/dbx/model-serving";
import { formatPrompt } from "@/lib/ai/templates";
import {
  buildTokenAwareBatches,
  estimateTokens,
  truncateColumns,
} from "@/lib/ai/token-budget";
import { parseLLMJson } from "@/lib/genie/passes/parse-llm-json";
import { logger } from "@/lib/logger";
import { detectPIIDeterministic } from "@/lib/domain/pii-rules";
import type {
  AnalyticsMaturityAssessment,
  ColumnInfo,
  DataDomain,
  DataProduct,
  DataTier,
  GovernanceGap,
  ImplicitRelationship,
  IntelligenceResult,
  LineageGraph,
  RedundancyPair,
  SensitivityClassification,
  TableDetail,
  TableHistorySummary,
} from "@/lib/domain/types";
import type { DiscoveryResult } from "@/lib/discovery/types";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface IntelligenceOptions {
  /** Model Serving endpoint name. */
  endpoint: string;
  /** Optional business name for context. */
  businessName?: string;
  /** Progress callback: (passName, percent 0-100). */
  onProgress?: (pass: string, percent: number) => void;
  /** Discovered analytics assets (Genie spaces, dashboards, metric views) for maturity assessment. */
  discoveryResult?: DiscoveryResult | null;
}

/** Input table info for the intelligence layer. */
export interface TableInput {
  fqn: string;
  columns: Array<{ name: string; type: string; comment: string | null }>;
  comment: string | null;
  tags: string[];
  detail: TableDetail | null;
  history: TableHistorySummary | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEMPERATURE = 0.2;

/** Max columns to include in PII pass (all columns with types -- expensive). */
const MAX_COLS_PII = 30;
/** Max columns to include in redundancy pass (names only). */
const MAX_COLS_REDUNDANCY = 20;
/** Max columns to include in relationship pass (names with types). */
const MAX_COLS_RELATIONSHIPS = 25;
/** Max columns to include in domain categorisation pass. */
const MAX_COLS_DOMAIN = 10;
/** Max columns to include in descriptions pass. */
const MAX_COLS_DESCRIPTIONS = 15;

// ---------------------------------------------------------------------------
// Rendering helpers (used for both prompt building and token estimation)
// ---------------------------------------------------------------------------

function renderDomainTable(t: TableInput): string {
  const cols = t.columns.slice(0, MAX_COLS_DOMAIN).map((c) => c.name).join(", ");
  return `- ${t.fqn}: columns=[${cols}]${t.comment ? ` comment="${t.comment}"` : ""}${t.tags.length > 0 ? ` tags=[${t.tags.join(", ")}]` : ""}`;
}

function renderPIITable(t: TableInput): string {
  const { truncated, omitted } = truncateColumns(t.columns, MAX_COLS_PII);
  const colStr = truncated.map((c) => `${c.name}(${c.type})`).join(", ");
  const suffix = omitted > 0 ? `, ... +${omitted} more` : "";
  return `- ${t.fqn}: [${colStr}${suffix}]`;
}

function renderDescriptionTable(t: TableInput): string {
  const cols = t.columns.slice(0, MAX_COLS_DESCRIPTIONS).map((c) => c.name).join(", ");
  return `- ${t.fqn}: columns=[${cols}]${t.tags.length > 0 ? ` tags=[${t.tags.join(", ")}]` : ""}`;
}

function renderRedundancyTable(t: TableInput): string {
  const { truncated, omitted } = truncateColumns(t.columns, MAX_COLS_REDUNDANCY);
  const colStr = truncated.map((c) => c.name).join(", ");
  const suffix = omitted > 0 ? `, ... +${omitted} more` : "";
  return `- ${t.fqn}: [${colStr}${suffix}]`;
}

function renderRelationshipTable(t: TableInput): string {
  const { truncated, omitted } = truncateColumns(t.columns, MAX_COLS_RELATIONSHIPS);
  const colStr = truncated.map((c) => `${c.name}(${c.type})`).join(", ");
  const suffix = omitted > 0 ? `, ... +${omitted} more` : "";
  return `- ${t.fqn}: [${colStr}${suffix}]`;
}

function renderTierTable(t: TableInput): string {
  const colCount = t.columns.length;
  const nameParts = t.fqn.split(".");
  return `- ${t.fqn}: ${colCount} columns${t.comment ? `, "${t.comment}"` : ""}${t.tags.length > 0 ? `, tags=[${t.tags.join(",")}]` : ""}, schema=${nameParts[1] ?? ""}`;
}

function renderProductTable(t: TableInput): string {
  return `- ${t.fqn}${t.detail?.owner ? ` (owner: ${t.detail.owner})` : ""}`;
}

function renderGovernanceTable(
  t: TableInput,
  sensitiveTableSet: Set<string>,
  lineagedTables: Set<string>
): string {
  const gaps: string[] = [];
  if (!t.comment) gaps.push("no_description");
  if (!t.detail?.owner) gaps.push("no_owner");
  if (t.tags.length === 0) gaps.push("no_tags");
  if (sensitiveTableSet.has(t.fqn) && !t.tags.some((tag) => tag.toLowerCase().includes("pii") || tag.toLowerCase().includes("sensitive"))) {
    gaps.push("pii_untagged");
  }
  if (!lineagedTables.has(t.fqn)) gaps.push("no_lineage");
  if (t.history) {
    const dOptimize = t.history.lastOptimizeTimestamp ? daysSince(t.history.lastOptimizeTimestamp) : 999;
    const dVacuum = t.history.lastVacuumTimestamp ? daysSince(t.history.lastVacuumTimestamp) : 999;
    const dWrite = t.history.lastWriteTimestamp ? daysSince(t.history.lastWriteTimestamp) : 999;
    if (dOptimize > 30) gaps.push("stale_optimize");
    if (dVacuum > 30) gaps.push("stale_vacuum");
    if (dWrite > 90) gaps.push("stale_data");
  }
  return `- ${t.fqn}: detected_gaps=[${gaps.join(",")}]`;
}

/**
 * Compute the base token cost of a prompt template (everything except the
 * `{table_list}` placeholder content).
 */
function basePromptTokens(
  templateKey: string,
  extraVars: Record<string, string> = {}
): number {
  const vars: Record<string, string> = { table_list: "", ...extraVars };
  const prompt = formatPrompt(templateKey as never, vars);
  return estimateTokens(prompt);
}

// ---------------------------------------------------------------------------
// Main Orchestrator
// ---------------------------------------------------------------------------

/**
 * Run all intelligence passes and return aggregated results.
 *
 * Each pass runs independently — if one fails, the others continue.
 * Partial results are returned with pass status tracking.
 */
export async function runIntelligenceLayer(
  tables: TableInput[],
  lineageGraph: LineageGraph,
  options: IntelligenceOptions
): Promise<IntelligenceResult> {
  const passResults: Record<string, "success" | "failed" | "skipped"> = {};
  const result: IntelligenceResult = {
    domains: [],
    sensitivities: [],
    generatedDescriptions: new Map(),
    redundancies: [],
    implicitRelationships: [],
    tierAssignments: new Map(),
    dataProducts: [],
    governanceGaps: [],
    analyticsMaturity: null,
    passResults,
  };

  if (tables.length === 0) {
    logger.info("[intelligence] No tables to analyse");
    return result;
  }

  const progress = (pass: string, pct: number) => {
    options.onProgress?.(pass, pct);
  };

  // Pass 1: Domain Categorisation
  try {
    progress("domains", 0);
    result.domains = await passDomainCategorisation(tables, lineageGraph, options);
    passResults["domains"] = "success";
    progress("domains", 100);
  } catch (error) {
    logger.error("[intelligence] Pass 1 (domains) failed", { error: String(error) });
    passResults["domains"] = "failed";
  }

  // Pass 2: PII / Sensitivity Detection
  try {
    progress("pii", 0);
    result.sensitivities = await passPIIDetection(tables, options);
    passResults["pii"] = "success";
    progress("pii", 100);
  } catch (error) {
    logger.error("[intelligence] Pass 2 (PII) failed", { error: String(error) });
    passResults["pii"] = "failed";
  }

  // Pass 3: Auto-Generated Descriptions
  try {
    progress("descriptions", 0);
    // Detect generic/shared comments: if multiple tables share the exact same
    // comment, it's likely a catalog- or schema-level description, not specific
    // to the table. Include those tables for LLM description generation.
    const commentCounts = new Map<string, number>();
    for (const t of tables) {
      if (t.comment) {
        commentCounts.set(t.comment, (commentCounts.get(t.comment) ?? 0) + 1);
      }
    }
    const descTables = tables.filter((t) => {
      if (!t.comment) return true;
      return (commentCounts.get(t.comment) ?? 0) > 1;
    });
    if (descTables.length > 0) {
      result.generatedDescriptions = await passAutoDescriptions(descTables, lineageGraph, options);
      passResults["descriptions"] = "success";
    } else {
      passResults["descriptions"] = "skipped";
    }
    progress("descriptions", 100);
  } catch (error) {
    logger.error("[intelligence] Pass 3 (descriptions) failed", { error: String(error) });
    passResults["descriptions"] = "failed";
  }

  // Pass 4: Redundancy Detection
  try {
    progress("redundancy", 0);
    if (tables.length >= 2) {
      result.redundancies = await passRedundancyDetection(tables, options);
      passResults["redundancy"] = "success";
    } else {
      passResults["redundancy"] = "skipped";
    }
    progress("redundancy", 100);
  } catch (error) {
    logger.error("[intelligence] Pass 4 (redundancy) failed", { error: String(error) });
    passResults["redundancy"] = "failed";
  }

  // Pass 5: Implicit Relationship Discovery
  try {
    progress("relationships", 0);
    if (tables.length >= 2) {
      result.implicitRelationships = await passImplicitRelationships(tables, options);
      passResults["relationships"] = "success";
    } else {
      passResults["relationships"] = "skipped";
    }
    progress("relationships", 100);
  } catch (error) {
    logger.error("[intelligence] Pass 5 (relationships) failed", { error: String(error) });
    passResults["relationships"] = "failed";
  }

  // Pass 6: Medallion Tier Classification
  try {
    progress("tiers", 0);
    result.tierAssignments = await passMedallionTier(tables, lineageGraph, options);
    passResults["tiers"] = "success";
    progress("tiers", 100);
  } catch (error) {
    logger.error("[intelligence] Pass 6 (tiers) failed", { error: String(error) });
    passResults["tiers"] = "failed";
  }

  // Pass 7: Data Product Identification
  try {
    progress("products", 0);
    if (tables.length >= 3) {
      result.dataProducts = await passDataProducts(tables, lineageGraph, result.domains, options);
      passResults["products"] = "success";
    } else {
      passResults["products"] = "skipped";
    }
    progress("products", 100);
  } catch (error) {
    logger.error("[intelligence] Pass 7 (products) failed", { error: String(error) });
    passResults["products"] = "failed";
  }

  // Post-Pass: Governance Gap Analysis
  try {
    progress("governance", 0);
    result.governanceGaps = await passGovernanceGaps(
      tables, lineageGraph, result.sensitivities, result.domains, options
    );
    passResults["governance"] = "success";
    progress("governance", 100);
  } catch (error) {
    logger.error("[intelligence] Post-pass (governance) failed", { error: String(error) });
    passResults["governance"] = "failed";
  }

  // Pass 9: Analytics Maturity (requires discovery data)
  if (options.discoveryResult) {
    try {
      progress("analytics-maturity", 0);
      result.analyticsMaturity = await passAnalyticsMaturity(
        tables, result.domains, result.tierAssignments, options.discoveryResult, options
      );
      passResults["analytics-maturity"] = "success";
      progress("analytics-maturity", 100);
    } catch (error) {
      logger.error("[intelligence] Pass 9 (analytics maturity) failed", { error: String(error) });
      passResults["analytics-maturity"] = "failed";
    }
  } else {
    passResults["analytics-maturity"] = "skipped";
  }

  result.passResults = passResults;

  const successCount = Object.values(passResults).filter((v) => v === "success").length;
  logger.info("[intelligence] All passes complete", {
    successCount,
    failedCount: Object.values(passResults).filter((v) => v === "failed").length,
    skippedCount: Object.values(passResults).filter((v) => v === "skipped").length,
  });

  return result;
}

// ---------------------------------------------------------------------------
// Pass 1: Domain Categorisation
// ---------------------------------------------------------------------------

async function passDomainCategorisation(
  tables: TableInput[],
  lineageGraph: LineageGraph,
  options: IntelligenceOptions
): Promise<DataDomain[]> {
  const allAssignments: Array<{ table_fqn: string; domain: string; subdomain: string }> = [];
  const lineageSummary = buildLineageSummary(lineageGraph, 20);

  const base = basePromptTokens("ENV_DOMAIN_CATEGORISATION_PROMPT", {
    lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
    business_name_line: options.businessName ? `Business: ${options.businessName}` : "",
  });

  const batches = buildTokenAwareBatches(tables, renderDomainTable, base);

  for (const batch of batches) {
    const tableList = batch.map(renderDomainTable).join("\n");

    const prompt = formatPrompt("ENV_DOMAIN_CATEGORISATION_PROMPT", {
      table_list: tableList,
      lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
      business_name_line: options.businessName ? `Business: ${options.businessName}` : "",
    });

    const { content } = await callLLM(prompt, options.endpoint);
    const parsed = safeParseArray<{ table_fqn: string; domain: string; subdomain: string }>(content);
    allAssignments.push(...parsed);
  }

  // Group into DataDomain objects
  const domainMap = new Map<string, DataDomain>();
  for (const a of allAssignments) {
    const key = `${a.domain}::${a.subdomain}`;
    const existing = domainMap.get(key);
    if (existing) {
      existing.tables.push(a.table_fqn);
    } else {
      domainMap.set(key, {
        domain: a.domain,
        subdomain: a.subdomain,
        tables: [a.table_fqn],
        description: "",
      });
    }
  }

  return Array.from(domainMap.values());
}

// ---------------------------------------------------------------------------
// Pass 2: PII / Sensitivity Detection
// ---------------------------------------------------------------------------

async function passPIIDetection(
  tables: TableInput[],
  options: IntelligenceOptions
): Promise<SensitivityClassification[]> {
  // Phase 1: Deterministic rules (fast, reliable for obvious patterns)
  const ruleResults = detectPIIDeterministic(tables);
  const ruleKeys = new Set(ruleResults.map((r) => `${r.tableFqn}::${r.columnName}`));
  logger.info("[intelligence] Deterministic PII rules found matches", {
    count: ruleResults.length,
  });

  // Phase 2: LLM pass for nuanced detection (deduplicate against rule results)
  const allClassifications: SensitivityClassification[] = [...ruleResults];

  const base = basePromptTokens("ENV_PII_DETECTION_PROMPT");
  const batches = buildTokenAwareBatches(tables, renderPIITable, base);

  for (const batch of batches) {
    const tableList = batch.map(renderPIITable).join("\n");

    const prompt = formatPrompt("ENV_PII_DETECTION_PROMPT", {
      table_list: tableList,
    });

    const { content } = await callLLM(prompt, options.endpoint);
    const parsed = safeParseArray<SensitivityClassification>(content);
    for (const p of parsed) {
      const key = `${p.tableFqn}::${p.columnName}`;
      if (!ruleKeys.has(key)) {
        allClassifications.push(p);
        ruleKeys.add(key);
      }
    }
  }

  return allClassifications;
}

// ---------------------------------------------------------------------------
// Pass 3: Auto-Generated Descriptions
// ---------------------------------------------------------------------------

async function passAutoDescriptions(
  tables: TableInput[],
  lineageGraph: LineageGraph,
  options: IntelligenceOptions
): Promise<Map<string, string>> {
  const descriptions = new Map<string, string>();
  const lineageSummary = buildLineageSummary(lineageGraph, 15);

  const base = basePromptTokens("ENV_AUTO_DESCRIPTIONS_PROMPT", {
    lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
  });
  const batches = buildTokenAwareBatches(tables, renderDescriptionTable, base);

  for (const batch of batches) {
    const tableList = batch.map(renderDescriptionTable).join("\n");

    const prompt = formatPrompt("ENV_AUTO_DESCRIPTIONS_PROMPT", {
      table_list: tableList,
      lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
    });

    const { content } = await callLLM(prompt, options.endpoint);
    const parsed = safeParseArray<{ table_fqn: string; description: string }>(content);
    for (const p of parsed) {
      descriptions.set(p.table_fqn, p.description);
    }
  }

  return descriptions;
}

// ---------------------------------------------------------------------------
// Pass 4: Redundancy Detection
// ---------------------------------------------------------------------------

async function passRedundancyDetection(
  tables: TableInput[],
  options: IntelligenceOptions
): Promise<RedundancyPair[]> {
  const allPairs: RedundancyPair[] = [];

  const base = basePromptTokens("ENV_REDUNDANCY_DETECTION_PROMPT");
  const batches = buildTokenAwareBatches(tables, renderRedundancyTable, base);

  for (const batch of batches) {
    const tableList = batch.map(renderRedundancyTable).join("\n");

    const prompt = formatPrompt("ENV_REDUNDANCY_DETECTION_PROMPT", {
      table_list: tableList,
    });

    const { content } = await callLLM(prompt, options.endpoint);
    const parsed = safeParseArray<RedundancyPair>(content);
    allPairs.push(...parsed);
  }

  return deduplicatePairs(allPairs);
}

// ---------------------------------------------------------------------------
// Pass 5: Implicit Relationship Discovery
// ---------------------------------------------------------------------------

async function passImplicitRelationships(
  tables: TableInput[],
  options: IntelligenceOptions
): Promise<ImplicitRelationship[]> {
  const allRels: ImplicitRelationship[] = [];

  const base = basePromptTokens("ENV_IMPLICIT_RELATIONSHIPS_PROMPT");
  const batches = buildTokenAwareBatches(tables, renderRelationshipTable, base);

  for (const batch of batches) {
    const tableList = batch.map(renderRelationshipTable).join("\n");

    const prompt = formatPrompt("ENV_IMPLICIT_RELATIONSHIPS_PROMPT", {
      table_list: tableList,
    });

    const { content } = await callLLM(prompt, options.endpoint);
    const parsed = safeParseArray<ImplicitRelationship>(content);
    allRels.push(...parsed);
  }

  return allRels;
}

// ---------------------------------------------------------------------------
// Pass 6: Medallion Tier Classification
// ---------------------------------------------------------------------------

async function passMedallionTier(
  tables: TableInput[],
  lineageGraph: LineageGraph,
  options: IntelligenceOptions
): Promise<Map<string, { tier: DataTier; reasoning: string }>> {
  const assignments = new Map<string, { tier: DataTier; reasoning: string }>();
  const lineageSummary = buildLineageSummary(lineageGraph, 20);

  const base = basePromptTokens("ENV_MEDALLION_TIER_PROMPT", {
    lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
  });
  const batches = buildTokenAwareBatches(tables, renderTierTable, base);

  for (const batch of batches) {
    const tableList = batch.map(renderTierTable).join("\n");

    const prompt = formatPrompt("ENV_MEDALLION_TIER_PROMPT", {
      table_list: tableList,
      lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
    });

    const { content } = await callLLM(prompt, options.endpoint);
    const parsed = safeParseArray<{ table_fqn: string; tier: DataTier; reasoning: string }>(content);
    for (const p of parsed) {
      if (["bronze", "silver", "gold", "system"].includes(p.tier)) {
        assignments.set(p.table_fqn, { tier: p.tier, reasoning: p.reasoning });
      }
    }
  }

  return assignments;
}

// ---------------------------------------------------------------------------
// Pass 7: Data Product Identification (now batched)
// ---------------------------------------------------------------------------

async function passDataProducts(
  tables: TableInput[],
  lineageGraph: LineageGraph,
  domains: DataDomain[],
  options: IntelligenceOptions
): Promise<DataProduct[]> {
  const lineageSummary = buildLineageSummary(lineageGraph, 30);
  const domainSummary = domains.map((d) =>
    `- ${d.domain}/${d.subdomain}: [${d.tables.slice(0, 10).join(", ")}${d.tables.length > 10 ? ` +${d.tables.length - 10} more` : ""}]`
  ).join("\n");

  const base = basePromptTokens("ENV_DATA_PRODUCTS_PROMPT", {
    domain_summary: domainSummary ? `Domain assignments:\n${domainSummary}` : "",
    lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
  });
  const batches = buildTokenAwareBatches(tables, renderProductTable, base);

  const allProducts: DataProduct[] = [];
  for (const batch of batches) {
    const tableList = batch.map(renderProductTable).join("\n");

    const prompt = formatPrompt("ENV_DATA_PRODUCTS_PROMPT", {
      table_list: tableList,
      domain_summary: domainSummary ? `Domain assignments:\n${domainSummary}` : "",
      lineage_summary: lineageSummary ? `Lineage context:\n${lineageSummary}` : "",
    });

    const { content } = await callLLM(prompt, options.endpoint);
    allProducts.push(...safeParseArray<DataProduct>(content));
  }

  return allProducts;
}

// ---------------------------------------------------------------------------
// Post-Pass: Governance Gap Analysis
// ---------------------------------------------------------------------------

async function passGovernanceGaps(
  tables: TableInput[],
  lineageGraph: LineageGraph,
  sensitivities: SensitivityClassification[],
  _domains: DataDomain[],
  options: IntelligenceOptions
): Promise<GovernanceGap[]> {
  const allGaps: GovernanceGap[] = [];
  const sensitiveTableSet = new Set(sensitivities.map((s) => s.tableFqn));
  const lineagedTables = new Set([
    ...lineageGraph.edges.map((e) => e.sourceTableFqn),
    ...lineageGraph.edges.map((e) => e.targetTableFqn),
  ]);

  const renderGov = (t: TableInput) => renderGovernanceTable(t, sensitiveTableSet, lineagedTables);

  const base = basePromptTokens("ENV_GOVERNANCE_GAPS_PROMPT");
  const batches = buildTokenAwareBatches(tables, renderGov, base);

  for (const batch of batches) {
    const tableList = batch.map(renderGov).join("\n");

    const prompt = formatPrompt("ENV_GOVERNANCE_GAPS_PROMPT", {
      table_list: tableList,
    });

    const { content } = await callLLM(prompt, options.endpoint);
    const parsed = safeParseArray<GovernanceGap>(content);
    allGaps.push(...parsed);
  }

  return allGaps;
}

// ---------------------------------------------------------------------------
// LLM call helper
// ---------------------------------------------------------------------------

interface LLMResult { content: string; finishReason: string | null; }

async function callLLM(
  prompt: string,
  endpoint: string,
  maxTokens = 16384,
): Promise<LLMResult> {
  const messages: ChatMessage[] = [
    { role: "user", content: prompt },
  ];

  const response = await chatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens,
  });

  if (response.finishReason === "length") {
    logger.warn("[intelligence] LLM response truncated (finish_reason=length)", {
      endpoint,
      contentLength: response.content.length,
    });
  }

  return { content: response.content, finishReason: response.finishReason };
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function safeParseArray<T>(raw: string): T[] {
  try {
    const parsed = parseLLMJson(raw);
    if (Array.isArray(parsed)) return parsed as T[];
    if (parsed && typeof parsed === "object") {
      for (const key of Object.keys(parsed as Record<string, unknown>)) {
        const val = (parsed as Record<string, unknown>)[key];
        if (Array.isArray(val)) return val as T[];
      }
    }
    return [];
  } catch (error) {
    logger.warn("[intelligence] Failed to parse LLM JSON response", {
      error: String(error),
      responseSnippet: raw.slice(0, 200),
    });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Pass 9: Analytics Maturity Assessment
// ---------------------------------------------------------------------------

async function passAnalyticsMaturity(
  tables: TableInput[],
  domains: DataDomain[],
  tierAssignments: Map<string, { tier: DataTier; reasoning: string }>,
  discoveryResult: DiscoveryResult,
  options: IntelligenceOptions
): Promise<AnalyticsMaturityAssessment> {
  const tierCounts: Record<string, number> = { bronze: 0, silver: 0, gold: 0, unknown: 0 };
  for (const [, assignment] of tierAssignments) {
    const tier = assignment.tier.toLowerCase();
    if (tier in tierCounts) tierCounts[tier]++;
    else tierCounts["unknown"]++;
  }
  const tierDistribution = `Gold: ${tierCounts["gold"]}, Silver: ${tierCounts["silver"]}, Bronze: ${tierCounts["bronze"]}, Unclassified: ${tierCounts["unknown"]}`;

  const domainSet = new Set(domains.map((d) => d.domain));

  const assetLines: string[] = [];
  if (discoveryResult.genieSpaces.length > 0) {
    assetLines.push(`### Genie Spaces (${discoveryResult.genieSpaces.length})`);
    for (const s of discoveryResult.genieSpaces.slice(0, 20)) {
      assetLines.push(`- "${s.title}": ${s.tables.length} tables, ${s.sampleQuestionCount} questions, ${s.measureCount} measures`);
    }
  }
  if (discoveryResult.dashboards.length > 0) {
    assetLines.push(`### Dashboards (${discoveryResult.dashboards.length})`);
    for (const d of discoveryResult.dashboards.slice(0, 20)) {
      assetLines.push(`- "${d.displayName}": ${d.tables.length} tables, ${d.datasetCount} datasets, ${d.widgetCount} widgets${d.isPublished ? " (published)" : ""}`);
    }
  }
  if (discoveryResult.metricViews.length > 0) {
    assetLines.push(`### Metric Views (${discoveryResult.metricViews.length})`);
    for (const mv of discoveryResult.metricViews.slice(0, 20)) {
      assetLines.push(`- ${mv.fqn}${mv.comment ? `: ${mv.comment}` : ""}`);
    }
  }
  if (assetLines.length === 0) {
    assetLines.push("No existing analytics assets were discovered.");
  }

  const tableListLines = tables.slice(0, 50).map((t) => {
    const tier = tierAssignments.get(t.fqn)?.tier ?? "unknown";
    const domain = domains.find((d) => d.tables.includes(t.fqn));
    return `- ${t.fqn} [tier=${tier}${domain ? `, domain=${domain.domain}` : ""}] (${t.columns.length} cols)`;
  });
  if (tables.length > 50) {
    tableListLines.push(`... and ${tables.length - 50} more tables`);
  }

  const vars: Record<string, string> = {
    business_name_line: options.businessName ? `Business: ${options.businessName}` : "",
    table_count: String(tables.length),
    domain_count: String(domainSet.size),
    tier_distribution: tierDistribution,
    asset_summary: assetLines.join("\n"),
    table_list: tableListLines.join("\n"),
  };

  const prompt = formatPrompt("ENV_ANALYTICS_MATURITY_PROMPT" as never, vars);
  const { content } = await callLLM(prompt, options.endpoint);

  type MaturityLevel = "nascent" | "developing" | "established" | "advanced";
  const VALID_LEVELS = new Set<MaturityLevel>(["nascent", "developing", "established", "advanced"]);
  const parsed = parseLLMJson(content) as {
    overallScore?: number;
    level?: string;
    dimensions?: Record<string, { score?: number; summary?: string }>;
    uncoveredDomains?: string[];
    topRecommendations?: Array<{ priority?: number; action?: string; impact?: string; effort?: string }>;
  };
  const level: MaturityLevel = VALID_LEVELS.has(parsed.level as MaturityLevel)
    ? (parsed.level as MaturityLevel)
    : "nascent";
  return {
    overallScore: Math.max(0, Math.min(100, parsed.overallScore ?? 0)),
    level,
    dimensions: {
      coverage: { score: parsed.dimensions?.coverage?.score ?? 0, summary: parsed.dimensions?.coverage?.summary ?? "" },
      depth: { score: parsed.dimensions?.depth?.score ?? 0, summary: parsed.dimensions?.depth?.summary ?? "" },
      freshness: { score: parsed.dimensions?.freshness?.score ?? 0, summary: parsed.dimensions?.freshness?.summary ?? "" },
      completeness: { score: parsed.dimensions?.completeness?.score ?? 0, summary: parsed.dimensions?.completeness?.summary ?? "" },
    },
    uncoveredDomains: Array.isArray(parsed.uncoveredDomains) ? parsed.uncoveredDomains : [],
    topRecommendations: Array.isArray(parsed.topRecommendations) ? parsed.topRecommendations.map((r, i) => ({
      priority: r.priority ?? i + 1,
      action: r.action ?? "",
      impact: (r.impact ?? "medium") as "high" | "medium" | "low",
      effort: (r.effort ?? "medium") as "high" | "medium" | "low",
    })) : [],
  };
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function buildLineageSummary(graph: LineageGraph, maxEdges: number): string {
  if (graph.edges.length === 0) return "";
  const edges = graph.edges.slice(0, maxEdges);
  const lines = edges.map((e) =>
    `${e.sourceTableFqn} -> ${e.targetTableFqn}${e.entityType ? ` (${e.entityType})` : ""}`
  );
  const suffix = graph.edges.length > maxEdges
    ? `\n... and ${graph.edges.length - maxEdges} more edges`
    : "";
  return lines.join("\n") + suffix;
}

function daysSince(isoTimestamp: string): number {
  try {
    return Math.floor((Date.now() - new Date(isoTimestamp).getTime()) / 86_400_000);
  } catch {
    return 999;
  }
}

function deduplicatePairs(pairs: RedundancyPair[]): RedundancyPair[] {
  const seen = new Set<string>();
  const unique: RedundancyPair[] = [];
  for (const p of pairs) {
    const key = [p.tableA, p.tableB].sort().join("|");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Helper to build TableInput from enrichment data
// ---------------------------------------------------------------------------

/**
 * Build TableInput array from enrichment results for the intelligence layer.
 */
export function buildTableInputs(
  details: Map<string, { detail: TableDetail | null; history: TableHistorySummary | null; properties: Record<string, string> }>,
  columns: ColumnInfo[],
  tags: Array<{ tableFqn: string; tagName: string; tagValue: string }>
): TableInput[] {
  const columnsByTable = new Map<string, Array<{ name: string; type: string; comment: string | null }>>();
  for (const col of columns) {
    const existing = columnsByTable.get(col.tableFqn) ?? [];
    existing.push({ name: col.columnName, type: col.dataType, comment: col.comment });
    columnsByTable.set(col.tableFqn, existing);
  }

  const tagsByTable = new Map<string, string[]>();
  for (const tag of tags) {
    const existing = tagsByTable.get(tag.tableFqn) ?? [];
    existing.push(`${tag.tagName}=${tag.tagValue}`);
    tagsByTable.set(tag.tableFqn, existing);
  }

  const inputs: TableInput[] = [];
  for (const [fqn, enrichment] of details) {
    inputs.push({
      fqn,
      columns: columnsByTable.get(fqn) ?? [],
      comment: enrichment.detail?.comment ?? null,
      tags: tagsByTable.get(fqn) ?? [],
      detail: enrichment.detail,
      history: enrichment.history,
    });
  }

  return inputs;
}

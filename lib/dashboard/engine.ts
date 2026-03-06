/**
 * Dashboard Engine — LLM-powered dashboard recommendation generator.
 *
 * Produces one Databricks AI/BI (Lakeview) dashboard recommendation per
 * domain, using use case SQL, Genie engine outputs, and metadata to
 * design data-driven dashboards with appropriate visualisations.
 */

import type { UseCase, MetadataSnapshot } from "@/lib/domain/types";
import type {
  GenieEngineRecommendation,
  EnrichedSqlSnippetMeasure,
  EnrichedSqlSnippetDimension,
  EnrichedSqlSnippetFilter,
  MetricViewProposal,
} from "@/lib/genie/types";
import type {
  DashboardDesign,
  DashboardRecommendation,
  DashboardEngineInput,
  DashboardEngineResult,
  FilterCandidate,
  MetricViewForDashboard,
} from "./types";
import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { parseLLMJson } from "@/lib/genie/passes/parse-llm-json";
import { buildDashboardDesignPrompt, DASHBOARD_SYSTEM_MESSAGE } from "./prompts";
import { assembleLakeviewDashboard, buildDashboardRecommendation } from "./assembler";
import { buildSchemaAllowlist, validateSqlExpression } from "@/lib/genie/schema-allowlist";
import { reviewAndFixSql } from "@/lib/ai/sql-reviewer";
import { isReviewEnabled } from "@/lib/dbx/client";
import { validateDatasetSql, validateMetricViewSql } from "./validation";
import { logger } from "@/lib/logger";
import type { DiscoveredDashboard } from "@/lib/discovery/types";

const TEMPERATURE = 0.3;

interface DomainGroup {
  domain: string;
  subdomains: string[];
  useCases: UseCase[];
  tables: string[];
}

function groupUseCasesByDomain(useCases: UseCase[]): DomainGroup[] {
  const domainMap = new Map<string, DomainGroup>();

  for (const uc of useCases) {
    const domain = uc.domain;
    if (!domainMap.has(domain)) {
      domainMap.set(domain, {
        domain,
        subdomains: [],
        useCases: [],
        tables: [],
      });
    }
    const group = domainMap.get(domain)!;
    group.useCases.push(uc);

    if (uc.subdomain && !group.subdomains.includes(uc.subdomain)) {
      group.subdomains.push(uc.subdomain);
    }

    for (const fqn of uc.tablesInvolved) {
      if (!group.tables.includes(fqn)) {
        group.tables.push(fqn);
      }
    }
  }

  return Array.from(domainMap.values()).sort((a, b) => b.useCases.length - a.useCases.length);
}

function buildColumnSchemas(metadata: MetadataSnapshot, tableFqns: string[]): string[] {
  const targetSet = new Set(tableFqns.map((f) => f.toLowerCase()));
  const columnsByTable = new Map<string, string[]>();

  for (const c of metadata.columns) {
    const fqn = c.tableFqn.toLowerCase();
    if (!targetSet.has(fqn)) continue;
    const list = columnsByTable.get(c.tableFqn) ?? [];
    list.push(`${c.columnName} (${c.dataType})`);
    columnsByTable.set(c.tableFqn, list);
  }

  return Array.from(columnsByTable.entries()).map(
    ([table, cols]) => `${table}: ${cols.join(", ")}`,
  );
}

function getGenieOutputsForDomain(
  domain: string,
  genieRecommendations?: GenieEngineRecommendation[],
): {
  measures: EnrichedSqlSnippetMeasure[];
  dimensions: EnrichedSqlSnippetDimension[];
  filters: EnrichedSqlSnippetFilter[];
} | null {
  if (!genieRecommendations) return null;

  const rec = genieRecommendations.find((r) => r.domain.toLowerCase() === domain.toLowerCase());
  if (!rec) return null;

  try {
    const space = JSON.parse(rec.serializedSpace);
    const snippets = space?.instructions?.sql_snippets;
    if (!snippets) return null;

    return {
      measures: snippets.measures ?? [],
      dimensions: snippets.expressions ?? [],
      filters: snippets.filters ?? [],
    };
  } catch {
    return null;
  }
}

function getFilterCandidatesForDomain(
  metadata: MetadataSnapshot,
  tableFqns: string[],
  genieOutputs: {
    filters: EnrichedSqlSnippetFilter[];
    dimensions: EnrichedSqlSnippetDimension[];
  } | null,
): FilterCandidate[] {
  const candidates: FilterCandidate[] = [];
  const seen = new Set<string>();

  // Pull from Genie filters first
  if (genieOutputs?.filters) {
    for (const f of genieOutputs.filters) {
      if (!seen.has(f.name.toLowerCase())) {
        seen.add(f.name.toLowerCase());
        candidates.push({ name: f.name, column: f.sql, tableFqn: "", dataType: "STRING" });
      }
    }
  }

  // Detect date and low-cardinality columns from metadata
  const targetSet = new Set(tableFqns.map((t) => t.toLowerCase()));
  for (const col of metadata.columns) {
    if (!targetSet.has(col.tableFqn.toLowerCase())) continue;
    const key = `${col.tableFqn}.${col.columnName}`.toLowerCase();
    if (seen.has(key)) continue;

    const dt = col.dataType.toUpperCase();
    if (dt.includes("DATE") || dt.includes("TIMESTAMP")) {
      seen.add(key);
      candidates.push({
        name: col.columnName,
        column: col.columnName,
        tableFqn: col.tableFqn,
        dataType: dt,
      });
    }
  }

  return candidates.slice(0, 6);
}

/**
 * Parse dimensions and measures from YAML text into structured form.
 */
function parseDimsAndMeasuresFromYaml(yaml: string): {
  dims: MetricViewForDashboard["dimensions"];
  measures: MetricViewForDashboard["measures"];
} {
  const dims: MetricViewForDashboard["dimensions"] = [];
  const measures: MetricViewForDashboard["measures"] = [];
  const yamlLines = (yaml ?? "").split("\n");
  let section: "none" | "dimensions" | "measures" = "none";

  for (const line of yamlLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("dimensions:")) {
      section = "dimensions";
      continue;
    }
    if (trimmed.startsWith("measures:")) {
      section = "measures";
      continue;
    }
    if (
      trimmed.startsWith("joins:") ||
      trimmed.startsWith("filter:") ||
      trimmed.startsWith("materialization:")
    ) {
      section = "none";
      continue;
    }

    if (section === "dimensions" || section === "measures") {
      const nameMatch = trimmed.match(/^-?\s*name:\s*(.+)/);
      if (nameMatch) {
        const name = nameMatch[1].replace(/^["']|["']$/g, "").trim();
        const idx = yamlLines.indexOf(line);
        const nextLine = yamlLines[idx + 1]?.trim() ?? "";
        const exprMatch = nextLine.match(/^expr:\s*(.+)/);
        const expr = exprMatch ? exprMatch[1].replace(/^["']|["']$/g, "").trim() : name;

        if (section === "dimensions") dims.push({ name, expr });
        else measures.push({ name, expr });
      }
    }
  }

  return { dims, measures };
}

/**
 * Read metric views from the new ForgeMetricViewProposal table.
 * Returns empty array if the table hasn't been populated (old runs).
 */
async function getMetricViewsFromProposalTable(
  runId: string,
  domain: string,
): Promise<MetricViewForDashboard[]> {
  try {
    const { getMetricViewProposalsByRunDomain } =
      await import("@/lib/lakebase/metric-view-proposals");
    const proposals = await getMetricViewProposalsByRunDomain(runId, domain);
    if (proposals.length === 0) return [];

    return proposals
      .filter((p) => p.validationStatus !== "error")
      .map((p) => {
        const { dims, measures } = parseDimsAndMeasuresFromYaml(p.yaml);
        const fqn = p.deployedFqn ?? p.name;
        return { fqn, name: p.name, description: p.description ?? "", dimensions: dims, measures };
      })
      .filter((mv) => mv.measures.length > 0);
  } catch {
    return [];
  }
}

/**
 * Backward-compatible fallback: read metric view proposals from the old
 * GenieEngineRecommendation table.
 */
function getMetricViewsFromGenieRecommendation(
  domain: string,
  genieRecommendations?: GenieEngineRecommendation[],
): MetricViewForDashboard[] {
  if (!genieRecommendations) return [];

  const rec = genieRecommendations.find((r) => r.domain.toLowerCase() === domain.toLowerCase());
  if (!rec?.metricViewProposals) return [];

  try {
    const proposals = JSON.parse(rec.metricViewProposals) as MetricViewProposal[];
    const deployedFqns = new Set((rec.metricViews ?? []).map((f) => f.toLowerCase()));

    return proposals
      .filter((p) => p.validationStatus !== "error")
      .map((p) => {
        const { dims, measures } = parseDimsAndMeasuresFromYaml(p.yaml);
        const fqn =
          deployedFqns.size > 0
            ? ((rec.metricViews ?? []).find((f) =>
                f.toLowerCase().includes(p.name.toLowerCase()),
              ) ?? p.name)
            : p.name;
        return { fqn, name: p.name, description: p.description, dimensions: dims, measures };
      })
      .filter((mv) => mv.measures.length > 0);
  } catch {
    return [];
  }
}

/**
 * Get metric view data for a domain — tries the new standalone table first,
 * falls back to the old GenieEngineRecommendation table for backward compat.
 */
async function getMetricViewDataForDomain(
  domain: string,
  runId?: string,
  genieRecommendations?: GenieEngineRecommendation[],
): Promise<MetricViewForDashboard[]> {
  // Try new table first
  if (runId) {
    const fromNewTable = await getMetricViewsFromProposalTable(runId, domain);
    if (fromNewTable.length > 0) return fromNewTable;
  }

  // Fallback to old table
  return getMetricViewsFromGenieRecommendation(domain, genieRecommendations);
}

function buildMetricViewLookups(metricViews: MetricViewForDashboard[]): {
  fqns: Set<string>;
  measures: Map<string, string[]>;
} {
  const fqns = new Set<string>();
  const measures = new Map<string, string[]>();
  for (const mv of metricViews) {
    const fqnLower = mv.fqn.toLowerCase();
    fqns.add(fqnLower);
    measures.set(
      fqnLower,
      mv.measures.map((m) => m.name),
    );
  }
  return { fqns, measures };
}

function buildMetricViewSchemaContext(metricViews: MetricViewForDashboard[]): string {
  if (metricViews.length === 0) return "";
  const lines = ["\n## Metric Views (these are WITH METRICS views -- use MEASURE() syntax)"];
  for (const mv of metricViews) {
    lines.push(`${mv.fqn} [METRIC VIEW]`);
    lines.push(`  Dimensions: ${mv.dimensions.map((d) => d.name).join(", ")}`);
    lines.push(
      `  Measures (MUST use MEASURE(col) AS col): ${mv.measures.map((m) => m.name).join(", ")}`,
    );
  }
  return lines.join("\n");
}

async function processDomain(
  group: DomainGroup,
  metadata: MetadataSnapshot,
  endpoint: string,
  businessName: string,
  businessContext: import("@/lib/domain/types").BusinessContext | null,
  genieRecommendations?: GenieEngineRecommendation[],
  runId?: string,
): Promise<DashboardRecommendation | null> {
  const columnSchemas = buildColumnSchemas(metadata, group.tables);
  const genieOutputs = getGenieOutputsForDomain(group.domain, genieRecommendations);
  const filterCandidates = getFilterCandidatesForDomain(metadata, group.tables, genieOutputs);
  const metricViews = await getMetricViewDataForDomain(group.domain, runId, genieRecommendations);
  const mvLookups = buildMetricViewLookups(metricViews);

  const prompt = buildDashboardDesignPrompt({
    businessName,
    businessContext,
    domain: group.domain,
    subdomains: group.subdomains,
    useCases: group.useCases,
    tables: group.tables,
    columnSchemas,
    measures: genieOutputs?.measures,
    dimensions: genieOutputs?.dimensions,
    filters: genieOutputs?.filters,
    filterCandidates,
    metricViews,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: DASHBOARD_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ];

  logger.info("Dashboard Engine: calling LLM for domain", {
    domain: group.domain,
    useCaseCount: group.useCases.length,
    tableCount: group.tables.length,
  });

  const result = await chatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    responseFormat: "json_object",
  });

  const parsed = parseLLMJson(result.content, "dashboard:engine") as DashboardDesign;

  if (!parsed.datasets || !parsed.widgets || parsed.datasets.length === 0) {
    logger.warn("Dashboard Engine: LLM returned empty design", {
      domain: group.domain,
    });
    return null;
  }

  // Validate dataset SQL against the metadata schema
  const dashAllowlist = buildSchemaAllowlist(metadata);
  const originalCount = parsed.datasets.length;
  parsed.datasets = parsed.datasets.filter((ds) =>
    validateSqlExpression(dashAllowlist, ds.sql, `dashboard:${ds.name}`, true),
  );
  if (parsed.datasets.length < originalCount) {
    logger.warn("Dashboard Engine: dropped datasets with invalid SQL references", {
      domain: group.domain,
      dropped: originalCount - parsed.datasets.length,
      remaining: parsed.datasets.length,
    });
  }
  if (parsed.datasets.length === 0) {
    logger.warn("Dashboard Engine: all datasets had invalid SQL references", {
      domain: group.domain,
    });
    return null;
  }

  // Metric view SQL validation: check MEASURE() usage, aliases, GROUP BY
  if (mvLookups.fqns.size > 0) {
    for (const ds of parsed.datasets) {
      const mvResult = validateMetricViewSql(ds.sql, mvLookups.fqns, mvLookups.measures);
      if (!mvResult.valid) {
        logger.warn("Dashboard Engine: metric view SQL issues detected", {
          dataset: ds.name,
          domain: group.domain,
          issues: mvResult.issues,
        });
      }
    }
  }

  // LLM review gate: review + fix each dataset SQL via the dedicated review endpoint
  if (isReviewEnabled("dashboard")) {
    const mvSchemaCtx = buildMetricViewSchemaContext(metricViews);
    const schemaCtx = columnSchemas.join("\n") + mvSchemaCtx;
    const reviewed = await Promise.all(
      parsed.datasets.map(async (ds) => {
        if (!ds.sql) return ds;
        const review = await reviewAndFixSql(ds.sql, {
          schemaContext: schemaCtx,
          surface: "dashboard",
        });
        if (review.fixedSql) {
          if (
            validateSqlExpression(dashAllowlist, review.fixedSql, `dashboard_fix:${ds.name}`, true)
          ) {
            logger.info("Dashboard Engine: review applied fix", {
              dataset: ds.name,
              qualityScore: review.qualityScore,
            });
            return { ...ds, sql: review.fixedSql };
          }
          logger.warn("Dashboard Engine: review fix failed schema validation, keeping original", {
            dataset: ds.name,
          });
          return ds;
        }
        if (review.verdict === "fail") {
          logger.warn("Dashboard Engine: review rejected dataset", {
            dataset: ds.name,
            issues: review.issues.map((i) => i.message),
          });
          return null;
        }
        return ds;
      }),
    );
    parsed.datasets = reviewed.filter((ds): ds is NonNullable<typeof ds> => ds !== null);
    if (parsed.datasets.length === 0) {
      logger.warn("Dashboard Engine: all datasets rejected by review", {
        domain: group.domain,
      });
      return null;
    }
  }

  // EXPLAIN validation: dry-run each dataset SQL to catch planning errors
  const explainResults = await Promise.all(
    parsed.datasets.map(async (ds) => {
      if (!ds.sql) return ds;
      const err = await validateDatasetSql(ds.sql, ds.name);
      return err ? null : ds;
    }),
  );
  parsed.datasets = explainResults.filter((ds): ds is NonNullable<typeof ds> => ds !== null);
  if (parsed.datasets.length === 0) {
    logger.warn("Dashboard Engine: all datasets failed EXPLAIN validation", {
      domain: group.domain,
    });
    return null;
  }
  // Drop widgets that reference removed datasets
  parsed.widgets = parsed.widgets.filter((w) =>
    parsed.datasets.some((ds) => ds.name === w.datasetName),
  );

  const lakeviewDashboard = assembleLakeviewDashboard(parsed);

  const useCaseIds = group.useCases.map((uc) => uc.id);

  return buildDashboardRecommendation(
    parsed,
    lakeviewDashboard,
    group.domain,
    group.subdomains,
    businessName,
    useCaseIds,
  );
}

/**
 * Run the Dashboard Engine pipeline.
 *
 * Produces one dashboard recommendation per domain with SQL datasets
 * and Lakeview-compatible widget specifications.
 */
export async function runDashboardEngine(
  input: DashboardEngineInput,
): Promise<DashboardEngineResult> {
  const {
    run,
    useCases,
    metadata,
    genieRecommendations,
    existingDashboards = [],
    domainFilter,
    onProgress,
  } = input;

  const endpoint = run.config.aiModel;
  const businessName = run.config.businessName;
  const businessContext = run.businessContext;

  logger.info("Dashboard Engine starting", {
    runId: run.runId,
    useCaseCount: useCases.length,
    tableCount: metadata.tableCount,
  });

  onProgress?.("Grouping use cases by domain...", 5);

  const allGroups = groupUseCasesByDomain(useCases);
  const domainGroups = domainFilter?.length
    ? allGroups.filter((g) => domainFilter.includes(g.domain))
    : allGroups;

  if (domainGroups.length === 0) {
    logger.warn("No domain groups for dashboard generation", {
      runId: run.runId,
      domainFilter,
    });
    return { recommendations: [] };
  }

  // Build existing-dashboard-to-domain mapping for enhancement detection
  const existingDashboardByDomain = new Map<string, DiscoveredDashboard>();
  if (existingDashboards.length > 0) {
    for (const group of domainGroups) {
      const domainTableSet = new Set(group.tables.map((t) => t.toLowerCase()));
      let bestMatch: { dashboard: DiscoveredDashboard; overlap: number } | null = null;
      for (const dash of existingDashboards) {
        const overlap = dash.tables.filter((t) => domainTableSet.has(t.toLowerCase())).length;
        if (overlap > 0 && (!bestMatch || overlap > bestMatch.overlap)) {
          bestMatch = { dashboard: dash, overlap };
        }
      }
      if (bestMatch && bestMatch.overlap >= 1) {
        existingDashboardByDomain.set(group.domain, bestMatch.dashboard);
      }
    }
    if (existingDashboardByDomain.size > 0) {
      logger.info("Existing dashboard mapping", {
        totalExisting: existingDashboards.length,
        domainsWithExisting: existingDashboardByDomain.size,
      });
    }
  }

  logger.info("Dashboard Engine: processing domains", {
    domainCount: domainGroups.length,
    domains: domainGroups.map((g) => g.domain),
  });

  const recommendations: DashboardRecommendation[] = [];

  for (let i = 0; i < domainGroups.length; i++) {
    const group = domainGroups[i];
    const pct = Math.round(10 + (i / domainGroups.length) * 85);
    onProgress?.(`Designing dashboard for ${group.domain}...`, pct);

    try {
      const rec = await processDomain(
        group,
        metadata,
        endpoint,
        businessName,
        businessContext,
        genieRecommendations,
        run.runId,
      );

      if (rec) {
        const existingDash = existingDashboardByDomain.get(group.domain);
        if (existingDash) {
          rec.recommendationType = "enhancement";
          rec.existingAssetId = existingDash.dashboardId;
          rec.changeSummary = `Enhancement of "${existingDash.displayName}": ${rec.datasetCount} datasets, ${rec.widgetCount} widgets (existing has ${existingDash.datasetCount} datasets, ${existingDash.widgetCount} widgets)`;
        }
        recommendations.push(rec);
        logger.info("Dashboard Engine: domain complete", {
          domain: group.domain,
          datasets: rec.datasetCount,
          widgets: rec.widgetCount,
        });
      }
    } catch (err) {
      logger.error("Dashboard Engine: domain failed", {
        domain: group.domain,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  onProgress?.("Dashboard generation complete", 100);

  logger.info("Dashboard Engine complete", {
    runId: run.runId,
    recommendationCount: recommendations.length,
    domains: recommendations.map((r) => r.domain),
  });

  return { recommendations };
}

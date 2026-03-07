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
} from "@/lib/genie/types";
import type {
  DashboardDesign,
  DashboardRecommendation,
  DashboardEngineInput,
  DashboardEngineResult,
  FilterCandidate,
} from "./types";
import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { parseLLMJson } from "@/lib/genie/passes/parse-llm-json";
import { buildDashboardDesignPrompt, DASHBOARD_SYSTEM_MESSAGE } from "./prompts";
import { assembleLakeviewDashboard, buildDashboardRecommendation } from "./assembler";
import { buildSchemaAllowlist, validateSqlExpression } from "@/lib/genie/schema-allowlist";
import { reviewAndFixSql } from "@/lib/ai/sql-reviewer";
import { isReviewEnabled } from "@/lib/dbx/client";
import { validateDatasetSql } from "./validation";
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

  // LLM review gate: review + fix each dataset SQL via the dedicated review endpoint
  if (isReviewEnabled("dashboard")) {
    const schemaCtx = columnSchemas.join("\n");
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

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
} from "./types";
import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { parseLLMJson } from "@/lib/genie/passes/parse-llm-json";
import { buildDashboardDesignPrompt, DASHBOARD_SYSTEM_MESSAGE } from "./prompts";
import { assembleLakeviewDashboard, buildDashboardRecommendation } from "./assembler";
import { logger } from "@/lib/logger";

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

  return Array.from(domainMap.values()).sort(
    (a, b) => b.useCases.length - a.useCases.length
  );
}

function buildColumnSchemas(
  metadata: MetadataSnapshot,
  tableFqns: string[]
): string[] {
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
    ([table, cols]) => `${table}: ${cols.join(", ")}`
  );
}

function getGenieOutputsForDomain(
  domain: string,
  genieRecommendations?: GenieEngineRecommendation[]
): { measures: EnrichedSqlSnippetMeasure[]; dimensions: EnrichedSqlSnippetDimension[]; filters: EnrichedSqlSnippetFilter[] } | null {
  if (!genieRecommendations) return null;

  const rec = genieRecommendations.find(
    (r) => r.domain.toLowerCase() === domain.toLowerCase()
  );
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

async function processDomain(
  group: DomainGroup,
  metadata: MetadataSnapshot,
  endpoint: string,
  businessName: string,
  businessContext: import("@/lib/domain/types").BusinessContext | null,
  genieRecommendations?: GenieEngineRecommendation[]
): Promise<DashboardRecommendation | null> {
  const columnSchemas = buildColumnSchemas(metadata, group.tables);
  const genieOutputs = getGenieOutputsForDomain(group.domain, genieRecommendations);

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

  const parsed = parseLLMJson(result.content) as DashboardDesign;

  if (!parsed.datasets || !parsed.widgets || parsed.datasets.length === 0) {
    logger.warn("Dashboard Engine: LLM returned empty design", {
      domain: group.domain,
    });
    return null;
  }

  const lakeviewDashboard = assembleLakeviewDashboard(parsed);

  const useCaseIds = group.useCases.map((uc) => uc.id);

  return buildDashboardRecommendation(
    parsed,
    lakeviewDashboard,
    group.domain,
    group.subdomains,
    businessName,
    useCaseIds
  );
}

/**
 * Run the Dashboard Engine pipeline.
 *
 * Produces one dashboard recommendation per domain with SQL datasets
 * and Lakeview-compatible widget specifications.
 */
export async function runDashboardEngine(
  input: DashboardEngineInput
): Promise<DashboardEngineResult> {
  const {
    run,
    useCases,
    metadata,
    genieRecommendations,
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
      );

      if (rec) {
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

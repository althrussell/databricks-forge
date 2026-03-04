/**
 * Ad-Hoc Dashboard Engine — intent-aware dashboard generator from a table
 * list and Ask Forge conversation context.
 *
 * Mirrors the Genie ad-hoc engine pattern (lib/genie/adhoc-engine.ts):
 * scrapes metadata from information_schema, maps conversation context into
 * the dashboard design prompt, then runs the proven engine pipeline
 * (buildDashboardDesignPrompt → LLM → assembleLakeviewDashboard).
 *
 * The conversation context is what makes the dashboard purpose-built:
 *   - conversationSummary  → businessContext.strategicGoals
 *   - widgetDescriptions   → synthetic use case statements
 *   - domainHint           → domain
 *   - sqlBlocks            → synthetic use case SQL
 */

import type { UseCase, BusinessContext, ColumnInfo, MetadataSnapshot } from "@/lib/domain/types";
import type { DashboardDesign, DashboardRecommendation } from "./types";
import { buildDashboardDesignPrompt, DASHBOARD_SYSTEM_MESSAGE } from "./prompts";
import { assembleLakeviewDashboard, buildDashboardRecommendation } from "./assembler";
import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { parseLLMJson } from "@/lib/genie/passes/parse-llm-json";
import { fetchTableInfoBatch, fetchColumnsBatch } from "@/lib/queries/metadata";
import { buildSchemaAllowlist, validateSqlExpression } from "@/lib/genie/schema-allowlist";
import { createDashboard, publishDashboard } from "@/lib/dbx/dashboards";
import { getServingEndpoint, getConfig } from "@/lib/dbx/client";
import { logger } from "@/lib/logger";

const TEMPERATURE = 0.3;

export interface AdHocDashboardInput {
  tables: string[];
  sqlBlocks?: string[];
  conversationSummary?: string;
  widgetDescriptions?: string[];
  domainHint?: string;
  title?: string;
  deploy?: boolean;
  publish?: boolean;
}

export interface AdHocDashboardResult {
  recommendation: DashboardRecommendation;
  dashboardId?: string;
  dashboardUrl?: string;
}

function buildColumnSchemas(columns: ColumnInfo[], tableFqns: string[]): string[] {
  const targetSet = new Set(tableFqns.map((f) => f.toLowerCase()));
  const columnsByTable = new Map<string, string[]>();

  for (const c of columns) {
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

/**
 * Build synthetic UseCase objects from conversation context.
 *
 * Widget descriptions become use case statements (telling the LLM what
 * to visualise). SQL blocks become use case SQL (giving the LLM
 * ready-made queries to refine into datasets). When neither is available,
 * a generic use case per table is created.
 */
function synthesiseUseCases(
  tables: string[],
  sqlBlocks: string[],
  widgetDescriptions: string[],
  domainHint: string,
): UseCase[] {
  const useCases: UseCase[] = [];
  const base = {
    id: "",
    runId: "",
    useCaseNo: 0,
    type: "Statistical" as const,
    analyticsTechnique: "Dashboard",
    solution: "",
    businessValue: "",
    beneficiary: "",
    sponsor: "",
    domain: domainHint || "General",
    subdomain: "",
    priorityScore: 0.8,
    feasibilityScore: 0.8,
    impactScore: 0.8,
    overallScore: 0.8,
    userPriorityScore: null,
    userFeasibilityScore: null,
    userImpactScore: null,
    userOverallScore: null,
    sqlStatus: null,
    feedback: null,
    feedbackAt: null,
    enrichmentTags: null,
  };

  if (widgetDescriptions.length > 0) {
    for (let i = 0; i < widgetDescriptions.length; i++) {
      useCases.push({
        ...base,
        useCaseNo: i + 1,
        name: widgetDescriptions[i].slice(0, 80),
        statement: widgetDescriptions[i],
        tablesInvolved: tables,
        sqlCode: sqlBlocks[i] ?? null,
      });
    }
  }

  if (sqlBlocks.length > widgetDescriptions.length) {
    for (let i = widgetDescriptions.length; i < sqlBlocks.length; i++) {
      useCases.push({
        ...base,
        useCaseNo: useCases.length + 1,
        name: `Query ${i + 1}`,
        statement: `Analyse data from ${tables.slice(0, 3).map((t) => t.split(".").pop()).join(", ")}`,
        tablesInvolved: tables,
        sqlCode: sqlBlocks[i],
      });
    }
  }

  if (useCases.length === 0) {
    for (let i = 0; i < tables.length; i++) {
      const tableName = tables[i].split(".").pop() ?? tables[i];
      useCases.push({
        ...base,
        useCaseNo: i + 1,
        name: `Analyse ${tableName}`,
        statement: `Analyse key metrics and trends from ${tableName}`,
        tablesInvolved: [tables[i]],
        sqlCode: null,
      });
    }
  }

  return useCases;
}

function buildBusinessContext(conversationSummary?: string): BusinessContext | null {
  if (!conversationSummary) return null;
  return {
    industries: "",
    strategicGoals: conversationSummary,
    businessPriorities: "",
    strategicInitiative: "",
    valueChain: "",
    revenueModel: "",
    additionalContext: "",
  };
}

/**
 * Run the ad-hoc dashboard engine.
 *
 * Scrapes metadata for the given tables, synthesises use cases from
 * conversation context, calls the LLM to design a Lakeview dashboard,
 * and optionally deploys it to the Databricks workspace.
 */
export async function runAdHocDashboardEngine(
  input: AdHocDashboardInput,
): Promise<AdHocDashboardResult> {
  const {
    tables,
    sqlBlocks = [],
    conversationSummary,
    widgetDescriptions = [],
    domainHint = "",
    title,
    deploy = false,
    publish = false,
  } = input;

  logger.info("Ad-hoc Dashboard Engine starting", {
    tableCount: tables.length,
    sqlBlockCount: sqlBlocks.length,
    widgetCount: widgetDescriptions.length,
    domainHint: domainHint || "(none)",
    deploy,
  });

  const [tableInfos, columns] = await Promise.all([
    fetchTableInfoBatch(tables),
    fetchColumnsBatch(tables),
  ]);

  if (columns.length === 0) {
    throw new Error("Could not retrieve column metadata for the specified tables");
  }

  const columnSchemas = buildColumnSchemas(columns, tables);
  const useCases = synthesiseUseCases(tables, sqlBlocks, widgetDescriptions, domainHint);
  const businessContext = buildBusinessContext(conversationSummary);
  const domain = domainHint || tableInfos[0]?.schema || "General";
  const businessName = title || "Ask Forge";

  const prompt = buildDashboardDesignPrompt({
    businessName,
    businessContext,
    domain,
    subdomains: [],
    useCases,
    tables,
    columnSchemas,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: DASHBOARD_SYSTEM_MESSAGE },
    { role: "user", content: prompt },
  ];

  logger.info("Ad-hoc Dashboard Engine: calling LLM", {
    useCaseCount: useCases.length,
    columnSchemaCount: columnSchemas.length,
  });

  const result = await chatCompletion({
    endpoint: getServingEndpoint(),
    messages,
    temperature: TEMPERATURE,
    responseFormat: "json_object",
  });

  const design = parseLLMJson(result.content, "adhoc-dashboard") as DashboardDesign;

  if (!design.datasets || !design.widgets || design.datasets.length === 0) {
    throw new Error("LLM returned an empty dashboard design");
  }

  // Validate dataset SQL against the actual schema to catch hallucinated columns
  const metadata: Pick<MetadataSnapshot, "tables" | "columns" | "metricViews"> = {
    tables: tableInfos,
    columns,
    metricViews: [],
  };
  const allowlist = buildSchemaAllowlist(metadata as MetadataSnapshot);
  const validDatasets = design.datasets.filter((ds) => {
    if (!ds.sql) return true;
    return validateSqlExpression(allowlist, ds.sql, `adhoc-dashboard:${ds.name}`, true);
  });

  if (validDatasets.length < design.datasets.length) {
    logger.warn("Dashboard Engine: dropped datasets with invalid SQL references", {
      domain: domainHint || "General",
      dropped: design.datasets.length - validDatasets.length,
      remaining: validDatasets.length,
    });
    design.datasets = validDatasets;
  }

  if (design.datasets.length === 0) {
    throw new Error("All dashboard datasets were rejected due to invalid SQL references");
  }

  const lakeviewDashboard = assembleLakeviewDashboard(design);
  const useCaseIds = useCases.map((uc) => uc.id);

  const recommendation = buildDashboardRecommendation(
    design,
    lakeviewDashboard,
    domain,
    [],
    businessName,
    useCaseIds,
  );

  logger.info("Ad-hoc Dashboard Engine: design complete", {
    datasets: recommendation.datasetCount,
    widgets: recommendation.widgetCount,
  });

  if (!deploy) {
    return { recommendation };
  }

  const config = getConfig();
  const dashResult = await createDashboard({
    displayName: recommendation.title,
    serializedDashboard: recommendation.serializedDashboard,
    warehouseId: config.warehouseId,
  });

  const dashboardId = dashResult.dashboard_id;
  const dashboardUrl = `${config.host}/sql/dashboardsv3/${dashboardId}`;

  if (publish) {
    try {
      await publishDashboard(dashboardId, config.warehouseId);
      logger.info("Ad-hoc dashboard published", { dashboardId });
    } catch (err) {
      logger.warn("Ad-hoc dashboard publish failed (dashboard was still created)", {
        dashboardId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("Ad-hoc Dashboard Engine: deployed", { dashboardId, dashboardUrl });

  return { recommendation, dashboardId, dashboardUrl };
}

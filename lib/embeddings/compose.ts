/**
 * Text composition functions for all 12 embeddable entity kinds.
 *
 * Each function takes a Prisma/domain record and produces a
 * human-readable text representation suitable for embedding.
 * The composed text should be rich enough for semantic search
 * but not so long that it dilutes the embedding signal.
 */

import type { EmbeddingKind } from "./types";

// ---------------------------------------------------------------------------
// 1. table_detail
// ---------------------------------------------------------------------------

/**
 * Prisma ForgeTableDetail shape (subset of fields we use).
 * We accept a loose type to avoid coupling to the generated Prisma client.
 */
interface TableDetailInput {
  tableFqn: string;
  catalog: string;
  schema: string;
  tableName: string;
  tableType?: string | null;
  comment?: string | null;
  generatedDescription?: string | null;
  format?: string | null;
  owner?: string | null;
  dataDomain?: string | null;
  dataSubdomain?: string | null;
  dataTier?: string | null;
  sensitivityLevel?: string | null;
  partitionColumns?: string | string[] | null;
  clusteringColumns?: string | string[] | null;
  columnsJson?: string | null;
  tagsJson?: string | null;
  sizeInBytes?: bigint | number | null;
  numRows?: bigint | number | null;
}

export function composeTableDetail(t: TableDetailInput): string {
  const cols = safeParseArray(t.columnsJson);
  const colNames = cols.map((c) => String(c.name || "")).filter(Boolean);
  const tags = safeParseArray(t.tagsJson)
    .map((tag) => `${tag.key}=${tag.value}`)
    .filter(Boolean);

  return lines([
    `Table: ${t.tableFqn}`,
    `Type: ${t.tableType || "TABLE"} | Domain: ${t.dataDomain || "unknown"}${t.dataSubdomain ? ` / ${t.dataSubdomain}` : ""}`,
    t.dataTier ? `Tier: ${t.dataTier}` : null,
    t.format ? `Format: ${t.format}` : null,
    `Description: ${t.generatedDescription || t.comment || "No description"}`,
    colNames.length > 0 ? `Columns: ${colNames.join(", ")}` : null,
    t.owner ? `Owner: ${t.owner}` : null,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : null,
    t.partitionColumns ? `Partitioned by: ${Array.isArray(t.partitionColumns) ? t.partitionColumns.join(", ") : t.partitionColumns}` : null,
    t.clusteringColumns ? `Clustered by: ${Array.isArray(t.clusteringColumns) ? t.clusteringColumns.join(", ") : t.clusteringColumns}` : null,
    t.sensitivityLevel ? `Sensitivity: ${t.sensitivityLevel}` : null,
    t.sizeInBytes ? `Size: ${formatBytes(Number(t.sizeInBytes))}` : null,
    t.numRows ? `Rows: ${Number(t.numRows).toLocaleString()}` : null,
  ]);
}

export function tableDetailMetadata(t: TableDetailInput): Record<string, unknown> {
  return {
    catalog: t.catalog,
    schema: t.schema,
    tableName: t.tableName,
    domain: t.dataDomain || null,
    tier: t.dataTier || null,
    tableType: t.tableType || null,
  };
}

// ---------------------------------------------------------------------------
// 2. column_profile
// ---------------------------------------------------------------------------

interface ColumnInput {
  tableFqn: string;
  name: string;
  dataType: string;
  comment?: string | null;
  nullable?: boolean;
  isPii?: boolean;
}

export function composeColumnProfile(tableFqn: string, col: ColumnInput): string {
  return lines([
    `Column: ${tableFqn}.${col.name}`,
    `Type: ${col.dataType}${col.nullable === false ? " NOT NULL" : ""}`,
    col.comment ? `Description: ${col.comment}` : null,
    col.isPii ? "PII: yes" : null,
  ]);
}

// ---------------------------------------------------------------------------
// 3. use_case
// ---------------------------------------------------------------------------

interface UseCaseInput {
  id: string;
  name: string;
  type?: string;
  analyticsTechnique?: string;
  statement: string;
  solution: string;
  businessValue: string;
  beneficiary?: string;
  sponsor?: string;
  domain: string;
  subdomain?: string;
  tablesInvolved?: string[] | string;
  overallScore?: number;
}

export function composeUseCase(uc: UseCaseInput): string {
  const tables =
    typeof uc.tablesInvolved === "string"
      ? safeParseArray(uc.tablesInvolved).join(", ")
      : (uc.tablesInvolved ?? []).join(", ");

  return lines([
    uc.name,
    `Domain: ${uc.domain}${uc.subdomain ? ` / ${uc.subdomain}` : ""}`,
    uc.type ? `Type: ${uc.type}` : null,
    uc.analyticsTechnique ? `Technique: ${uc.analyticsTechnique}` : null,
    `Problem: ${uc.statement}`,
    `Solution: ${uc.solution}`,
    `Business Value: ${uc.businessValue}`,
    uc.beneficiary ? `Beneficiary: ${uc.beneficiary}` : null,
    uc.sponsor ? `Sponsor: ${uc.sponsor}` : null,
    tables ? `Tables: ${tables}` : null,
    uc.overallScore != null ? `Score: ${(uc.overallScore * 100).toFixed(0)}%` : null,
  ]);
}

// ---------------------------------------------------------------------------
// 4. business_context
// ---------------------------------------------------------------------------

interface BusinessContextInput {
  businessName?: string;
  industries?: string;
  strategicGoals?: string;
  businessPriorities?: string;
  strategicInitiative?: string;
  valueChain?: string;
  revenueModel?: string;
  additionalContext?: string;
}

export function composeBusinessContext(
  ctx: BusinessContextInput,
  businessName?: string,
): string {
  const name = businessName || ctx.businessName || "Unknown";
  return lines([
    `Business: ${name}`,
    ctx.industries ? `Industries: ${ctx.industries}` : null,
    ctx.strategicGoals ? `Strategic Goals: ${ctx.strategicGoals}` : null,
    ctx.businessPriorities ? `Business Priorities: ${ctx.businessPriorities}` : null,
    ctx.strategicInitiative ? `Strategic Initiative: ${ctx.strategicInitiative}` : null,
    ctx.valueChain ? `Value Chain: ${ctx.valueChain}` : null,
    ctx.revenueModel ? `Revenue Model: ${ctx.revenueModel}` : null,
    ctx.additionalContext ? `Additional Context: ${ctx.additionalContext}` : null,
  ]);
}

// ---------------------------------------------------------------------------
// 5. genie_recommendation
// ---------------------------------------------------------------------------

interface GenieRecommendationInput {
  domain: string;
  title: string;
  description: string;
  tables?: string[];
  metricViews?: string[];
  changeSummary?: string | null;
  recommendationType?: string | null;
}

export function composeGenieRecommendation(rec: GenieRecommendationInput): string {
  return lines([
    `Genie Space: ${rec.title}`,
    `Domain: ${rec.domain}`,
    `Description: ${rec.description}`,
    rec.recommendationType ? `Type: ${rec.recommendationType}` : null,
    rec.changeSummary ? `Changes: ${rec.changeSummary}` : null,
    rec.tables && rec.tables.length > 0 ? `Tables: ${rec.tables.join(", ")}` : null,
    rec.metricViews && rec.metricViews.length > 0
      ? `Metric Views: ${rec.metricViews.join(", ")}`
      : null,
  ]);
}

// ---------------------------------------------------------------------------
// 6. genie_question
// ---------------------------------------------------------------------------

export function composeGenieQuestion(
  question: string,
  domain: string,
  sql?: string | null,
): string {
  return lines([
    `Question: ${question}`,
    `Domain: ${domain}`,
    sql ? `SQL: ${sql}` : null,
  ]);
}

// ---------------------------------------------------------------------------
// 7. environment_insight
// ---------------------------------------------------------------------------

interface InsightInput {
  insightType: string;
  tableFqn?: string | null;
  payloadJson: string;
}

export function composeEnvironmentInsight(insight: InsightInput): string {
  const p = safeParseObject(insight.payloadJson);

  switch (insight.insightType) {
    case "pii_detection":
      return lines([
        `PII Detection: Table ${p.tableFqn || insight.tableFqn}`,
        `Column: ${p.columnName}`,
        `Classification: ${p.classification}${p.confidence ? ` (${p.confidence})` : ""}`,
        p.reason ? `Reason: ${p.reason}` : null,
        p.regulation ? `Regulation: ${p.regulation}` : null,
      ]);

    case "redundancy":
      return lines([
        `Redundancy: ${p.tableA} and ${p.tableB}`,
        `Similarity: ${p.similarityPercent}%`,
        p.sharedColumns ? `Shared Columns: ${arrayJoin(p.sharedColumns)}` : null,
        p.reason ? `Reason: ${p.reason}` : null,
        p.recommendation ? `Recommendation: ${p.recommendation}` : null,
      ]);

    case "governance_gap":
      return lines([
        `Governance Gap: ${p.tableFqn || insight.tableFqn} (Score: ${p.overallScore})`,
        ...(Array.isArray(p.gaps)
          ? p.gaps.map(
              (g: Record<string, string>) =>
                `${g.category}: ${g.detail}${g.recommendation ? ` → ${g.recommendation}` : ""}`,
            )
          : []),
      ]);

    case "implicit_relationship":
      return lines([
        `Implicit Relationship: ${p.sourceTableFqn}.${p.sourceColumn} → ${p.targetTableFqn}.${p.targetColumn}`,
        p.confidence ? `Confidence: ${p.confidence}` : null,
        p.reasoning ? `Reasoning: ${p.reasoning}` : null,
      ]);

    case "data_product":
      return composeDataProduct(p);

    case "analytics_maturity":
      return lines([
        `Analytics Maturity: ${p.level || "Unknown"} (Score: ${p.overallScore || "N/A"})`,
        ...(Array.isArray(p.topRecommendations)
          ? p.topRecommendations.map((r: string) => `• ${r}`)
          : []),
      ]);

    default:
      return lines([
        `${insight.insightType}: ${insight.tableFqn || ""}`,
        JSON.stringify(p).slice(0, 500),
      ]);
  }
}

// ---------------------------------------------------------------------------
// 8. table_health
// ---------------------------------------------------------------------------

interface TableHealthInput {
  tableFqn: string;
  healthScore?: number | null;
  issuesJson?: string | null;
  recommendationsJson?: string | null;
  totalWriteOps?: number;
  totalOptimizeOps?: number;
  totalVacuumOps?: number;
  hasStreamingWrites?: boolean;
}

export function composeTableHealth(h: TableHealthInput): string {
  const issues = safeParseArray(h.issuesJson);
  const recs = safeParseArray(h.recommendationsJson);

  return lines([
    `Table Health: ${h.tableFqn}`,
    h.healthScore != null ? `Score: ${h.healthScore}/100` : null,
    issues.length > 0 ? `Issues: ${issues.join("; ")}` : null,
    recs.length > 0 ? `Recommendations: ${recs.join("; ")}` : null,
    h.hasStreamingWrites ? "Has streaming writes" : null,
    h.totalWriteOps ? `Write ops: ${h.totalWriteOps}` : null,
    h.totalOptimizeOps ? `Optimize ops: ${h.totalOptimizeOps}` : null,
    h.totalVacuumOps ? `Vacuum ops: ${h.totalVacuumOps}` : null,
  ]);
}

// ---------------------------------------------------------------------------
// 9. data_product
// ---------------------------------------------------------------------------

function composeDataProduct(p: Record<string, unknown>): string {
  return lines([
    `Data Product: ${p.productName || "Unknown"}`,
    p.description ? `Description: ${p.description}` : null,
    p.primaryDomain ? `Domain: ${p.primaryDomain}` : null,
    p.maturityLevel ? `Maturity: ${p.maturityLevel}` : null,
    p.ownerHint ? `Owner: ${p.ownerHint}` : null,
    p.tables ? `Tables: ${arrayJoin(p.tables)}` : null,
  ]);
}

export { composeDataProduct };

// ---------------------------------------------------------------------------
// 10. outcome_map
// ---------------------------------------------------------------------------

interface OutcomeMapInput {
  name: string;
  objectives?: Array<{
    name: string;
    whyChange?: string;
    priorities?: Array<{
      name: string;
      useCases?: Array<{ name: string; description?: string }>;
    }>;
  }>;
  suggestedDomains?: string[];
  suggestedPriorities?: string[];
}

export function composeOutcomeMap(om: OutcomeMapInput): string {
  const parts: string[] = [`Industry: ${om.name}`];

  if (om.suggestedDomains?.length) {
    parts.push(`Domains: ${om.suggestedDomains.join(", ")}`);
  }
  if (om.suggestedPriorities?.length) {
    parts.push(`Priorities: ${om.suggestedPriorities.join(", ")}`);
  }

  for (const obj of om.objectives ?? []) {
    parts.push(`Objective: ${obj.name}`);
    if (obj.whyChange) parts.push(`  Why: ${obj.whyChange}`);
    for (const pri of obj.priorities ?? []) {
      parts.push(`  Priority: ${pri.name}`);
      for (const uc of pri.useCases ?? []) {
        parts.push(`    Use Case: ${uc.name}${uc.description ? ` — ${uc.description}` : ""}`);
      }
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// 11. lineage_context
// ---------------------------------------------------------------------------

interface LineageInput {
  sourceTableFqn: string;
  targetTableFqn: string;
  sourceType?: string | null;
  targetType?: string | null;
  entityType?: string | null;
  eventCount?: number;
}

export function composeLineageContext(l: LineageInput): string {
  return lines([
    `Lineage: ${l.sourceTableFqn} → ${l.targetTableFqn}`,
    l.sourceType || l.targetType
      ? `Types: ${l.sourceType || "?"} → ${l.targetType || "?"}`
      : null,
    l.entityType ? `Via: ${l.entityType}` : null,
    l.eventCount && l.eventCount > 1 ? `Events: ${l.eventCount}` : null,
  ]);
}

// ---------------------------------------------------------------------------
// 12. document_chunk
// ---------------------------------------------------------------------------

export function composeDocumentChunk(
  text: string,
  filename: string,
  category: string,
  chunkIndex: number,
): string {
  return lines([
    `Source: ${filename} (${category}, chunk ${chunkIndex + 1})`,
    text,
  ]);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function lines(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join("\n");
}

function safeParseArray(json: string | null | undefined): Array<Record<string, unknown>> {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseObject(json: string | null | undefined): Record<string, unknown> {
  if (!json) return {};
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function arrayJoin(val: unknown): string {
  return Array.isArray(val) ? val.join(", ") : String(val || "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

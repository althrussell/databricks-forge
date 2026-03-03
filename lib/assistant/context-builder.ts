/**
 * Context builder for the Ask Forge assistant.
 *
 * Dual-strategy context pipeline:
 *   Strategy 1: Direct Lakebase queries (business context, scan summary,
 *               deployed assets, per-table deep detail)
 *   Strategy 2: Vector semantic search (RAG retrieval across all embedding kinds)
 *
 * Both strategies are merged and deduplicated before injection into the LLM.
 */

import { retrieveContext, formatRetrievedContext, provenanceLabel } from "@/lib/embeddings/retriever";
import type { RetrievedChunk } from "@/lib/embeddings/types";
import type { AssistantIntent } from "./intent";
import { isEmbeddingEnabled } from "@/lib/embeddings/config";
import { withPrisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface TableEnrichment {
  tableFqn: string;
  owner: string | null;
  numRows: string | null;
  sizeInBytes: string | null;
  lastModified: string | null;
  createdBy: string | null;
  dataDomain: string | null;
  dataTier: string | null;
  healthScore: number | null;
  issues: string[];
  recommendations: string[];
  lastWriteTimestamp: string | null;
  lastWriteOperation: string | null;
  upstreamTables: string[];
  downstreamTables: string[];
}

export interface AssistantContext {
  ragContext: string;
  chunks: RetrievedChunk[];
  conversationHistory: string;
  tables: string[];
  tableEnrichments: TableEnrichment[];
  hasDataGaps: boolean;
  retrievalTopScore: number | null;
  retrievalAvgScore: number | null;
  lowConfidenceRetrieval: boolean;
}

interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

const INTENT_SCOPES: Record<AssistantIntent, Array<{
  scope: "estate" | "usecases" | "genie" | "insights" | "documents" | "benchmarks" | undefined;
  topK: number;
  minScore: number;
  useLatestRun?: boolean;
  useLatestScan?: boolean;
}>> = {
  business: [
    { scope: "usecases", topK: 10, minScore: 0.4, useLatestRun: true },
    { scope: "estate", topK: 8, minScore: 0.35, useLatestScan: true },
    { scope: "benchmarks", topK: 6, minScore: 0.35 },
  ],
  technical: [
    { scope: "estate", topK: 15, minScore: 0.4, useLatestScan: true },
    { scope: "insights", topK: 8, minScore: 0.4, useLatestScan: true },
  ],
  dashboard: [
    { scope: "insights", topK: 10, minScore: 0.4, useLatestScan: true },
    { scope: "usecases", topK: 8, minScore: 0.4, useLatestRun: true },
  ],
  navigation: [
    { scope: "estate", topK: 10, minScore: 0.35, useLatestScan: true },
    { scope: "usecases", topK: 8, minScore: 0.35, useLatestRun: true },
    { scope: "documents", topK: 5, minScore: 0.35 },
  ],
  exploration: [
    { scope: "estate", topK: 10, minScore: 0.35, useLatestScan: true },
    { scope: "usecases", topK: 8, minScore: 0.35, useLatestRun: true },
    { scope: "documents", topK: 5, minScore: 0.35 },
  ],
};

interface DirectContextResult {
  text: string | null;
  latestRunId: string | null;
  latestScanId: string | null;
}

interface RetrievalPlan {
  scope: "estate" | "usecases" | "genie" | "insights" | "documents" | "benchmarks" | undefined;
  topK: number;
  minScore: number;
  useLatestRun?: boolean;
  useLatestScan?: boolean;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Build full LLM context using dual-strategy pipeline:
 *   1. Direct Lakebase queries (always available, no embedding dependency)
 *   2. Vector semantic search (when embeddings are enabled)
 */
export async function buildAssistantContext(
  question: string,
  intent: AssistantIntent,
  history: ConversationTurn[] = [],
): Promise<AssistantContext> {
  // --- Strategy 1: Direct Lakebase context (always runs) ---
  const directContext = await fetchDirectLakebaseContext();

  // --- Strategy 2: Vector semantic search (when embeddings enabled) ---
  let chunks: RetrievedChunk[] = [];
  let ragContext = "";

  if (isEmbeddingEnabled()) {
    const plans = INTENT_SCOPES[intent];
    chunks = await retrieveWithFallback(question, plans, directContext.latestRunId, directContext.latestScanId);

    ragContext = formatRetrievedContext(chunks, 12000);

    logger.debug("[assistant/context] Built RAG context", {
      chunkCount: chunks.length,
      contextLength: ragContext.length,
      topScore: chunks[0]?.score,
    });
  }

  // --- Merge: prepend direct context, then RAG, then table enrichment ---
  let fullContext = "";

  if (directContext.text) {
    fullContext += directContext.text + "\n\n";
  }

  if (ragContext) {
    fullContext += ragContext;
  }

  const tables = mergeTableReferenceLists(
    extractTableReferencesFromChunks(chunks),
    extractTableFqnsFromText(directContext.text ?? ""),
    extractTableFqnsFromText(question),
  );
  if (chunks.length > 0 && tables.length === 0) {
    logger.warn("[assistant/context] Retrieved chunks but inferred zero table references", {
      chunkCount: chunks.length,
    });
  }
  const tableEnrichments = await fetchTableEnrichments(tables);

  if (tableEnrichments.length > 0) {
    fullContext += "\n\n## Estate Metadata for Referenced Tables\n\n" + formatTableEnrichments(tableEnrichments);
  } else if (tables.length > 0) {
    fullContext += "\n\n## Referenced Tables\n\n" + tables.map((t) => `- ${t}`).join("\n");
  }

  const conversationHistory = formatConversationHistory(history);

  const retrievalTopScore = chunks.length > 0 ? chunks[0].score : null;
  const retrievalAvgScore = chunks.length > 0
    ? chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length
    : null;
  const lowConfidenceRetrieval = retrievalTopScore !== null && retrievalTopScore < 0.5;

  if (lowConfidenceRetrieval) {
    fullContext =
      "## Retrieval Confidence\nTop retrieval score is low. Answer conservatively and explicitly call out uncertainty where context is thin.\n\n" +
      fullContext;
  }

  return {
    ragContext: fullContext,
    chunks,
    conversationHistory,
    tables,
    tableEnrichments,
    hasDataGaps: chunks.length === 0 && !directContext.text,
    retrievalTopScore,
    retrievalAvgScore,
    lowConfidenceRetrieval,
  };
}

/**
 * Build numbered source references for citation in the LLM response.
 */
export function buildSourceReferences(chunks: RetrievedChunk[]): Array<{
  index: number;
  label: string;
  kind: string;
  sourceId: string;
  score: number;
  metadata: Record<string, unknown> | null;
}> {
  return chunks.slice(0, 10).map((chunk, i) => ({
    index: i + 1,
    label: provenanceLabel(chunk),
    kind: chunk.kind,
    sourceId: chunk.sourceId,
    score: chunk.score,
    metadata: chunk.metadata,
  }));
}

// ---------------------------------------------------------------------------
// Strategy 1: Direct Lakebase context
// ---------------------------------------------------------------------------

/**
 * Fetch structured context directly from Lakebase, independent of vector search.
 * Provides business grounding, estate overview, and deployed asset awareness.
 */
async function fetchDirectLakebaseContext(): Promise<DirectContextResult> {
  try {
    return await withPrisma(async (prisma) => {
      const sections: string[] = [];
      let latestRunId: string | null = null;
      let latestScanId: string | null = null;

      // 1. Business context from latest completed run
      const latestRun = await prisma.forgeRun.findFirst({
        where: { status: "completed" },
        orderBy: { createdAt: "desc" },
        select: {
          runId: true,
          businessName: true,
          businessContext: true,
          businessPriorities: true,
          strategicGoals: true,
          businessDomains: true,
          ucMetadata: true,
        },
      });

      if (latestRun) {
        latestRunId = latestRun.runId;
        const parts = ["## Business Context"];
        parts.push(`Organisation: ${latestRun.businessName}`);
        if (latestRun.businessContext) parts.push(`Context: ${truncate(latestRun.businessContext, 800)}`);
        if (latestRun.businessPriorities) parts.push(`Priorities: ${truncate(latestRun.businessPriorities, 400)}`);
        if (latestRun.strategicGoals) parts.push(`Strategic Goals: ${truncate(latestRun.strategicGoals, 400)}`);
        if (latestRun.businessDomains) parts.push(`Business Domains: ${latestRun.businessDomains}`);
        sections.push(parts.join("\n"));
      }

      // 2. Estate summary from latest scan
      const latestScan = await prisma.forgeEnvironmentScan.findFirst({
        orderBy: { createdAt: "desc" },
        select: {
          scanId: true,
          tableCount: true,
          domainCount: true,
          piiTablesCount: true,
          avgGovernanceScore: true,
          lineageDiscoveredCount: true,
          dataProductCount: true,
          createdAt: true,
          ucPath: true,
        },
      });

      if (latestScan) {
        latestScanId = latestScan.scanId;
        const parts = ["## Data Estate Summary"];
        parts.push(`Scope: ${latestScan.ucPath}`);
        parts.push(`Tables: ${latestScan.tableCount} | Domains: ${latestScan.domainCount} | PII tables: ${latestScan.piiTablesCount}`);
        parts.push(`Lineage edges: ${latestScan.lineageDiscoveredCount} | Data products: ${latestScan.dataProductCount}`);
        parts.push(`Avg governance score: ${latestScan.avgGovernanceScore.toFixed(0)}/100`);
        parts.push(`Last scanned: ${latestScan.createdAt.toISOString()}`);
        sections.push(parts.join("\n"));
      }

      // 3. Deployed assets (dashboards + Genie spaces)
      const [deployedDashboards, deployedSpaces] = await Promise.all([
        prisma.forgeDashboard.findMany({
          where: { status: { not: "trashed" } },
          select: { title: true, domain: true, dashboardId: true },
          take: 20,
        }),
        prisma.forgeGenieSpace.findMany({
          where: { status: { not: "trashed" } },
          select: { title: true, domain: true, spaceId: true },
          take: 20,
        }),
      ]);

      if (deployedDashboards.length > 0 || deployedSpaces.length > 0) {
        const parts = ["## Already Deployed Assets"];
        if (deployedDashboards.length > 0) {
          parts.push(`Dashboards (${deployedDashboards.length}):`);
          for (const d of deployedDashboards) {
            parts.push(`- ${d.title}${d.domain ? ` [${d.domain}]` : ""}`);
          }
        }
        if (deployedSpaces.length > 0) {
          parts.push(`Genie Spaces (${deployedSpaces.length}):`);
          for (const s of deployedSpaces) {
            parts.push(`- ${s.title}${s.domain ? ` [${s.domain}]` : ""}`);
          }
        }
        sections.push(parts.join("\n"));
      }

      return {
        text: sections.length === 0 ? null : sections.join("\n\n---\n\n"),
        latestRunId,
        latestScanId,
      };
    });
  } catch (err) {
    logger.warn("[assistant/context] Failed to fetch direct Lakebase context", { error: String(err) });
    return { text: null, latestRunId: null, latestScanId: null };
  }
}

// ---------------------------------------------------------------------------
// Table reference extraction (broadened)
// ---------------------------------------------------------------------------

const THREE_PART_FQN = /\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\b/g;
const TABLE_LIMIT = 20;

function extractTableReferencesFromChunks(chunks: RetrievedChunk[]): string[] {
  const tables = new Set<string>();

  for (const chunk of chunks) {
    // Direct FQN kinds: sourceId IS the FQN
    if (["table_detail", "column_profile", "table_health"].includes(chunk.kind)) {
      tables.add(chunk.sourceId);
    }

    const m = chunk.metadata ?? {};

    // metadata.tableFqn (table_health, environment_insight, column_profile)
    if (typeof m.tableFqn === "string" && m.tableFqn.includes(".")) {
      tables.add(m.tableFqn);
    }

    // metadata.source / metadata.target (lineage_context)
    if (typeof m.source === "string" && m.source.includes(".")) {
      tables.add(m.source);
    }
    if (typeof m.target === "string" && m.target.includes(".")) {
      tables.add(m.target);
    }

    // metadata.tables (array, used by some genie/use-case chunks)
    if (Array.isArray(m.tables)) {
      for (const t of m.tables) {
        if (typeof t === "string" && t.includes(".")) tables.add(t);
      }
    }
  }

  // Supplement: regex-scan ALL chunk content for three-part FQNs.
  // Genie, use-case, and question chunks often contain table FQNs in their
  // text but not in structured metadata, so we always scan broadly.
  for (const chunk of chunks) {
    for (const match of chunk.content.matchAll(THREE_PART_FQN)) {
      tables.add(match[0]);
    }
  }

  return [...tables];
}

export function extractTableFqnsFromText(text: string): string[] {
  if (!text) return [];
  const tables = new Set<string>();
  for (const match of text.matchAll(THREE_PART_FQN)) {
    tables.add(match[0]);
  }
  return [...tables];
}

function normalizeTableFqn(input: string): string {
  return input.replace(/[`"']/g, "").trim();
}

export function mergeTableReferenceLists(...lists: string[][]): string[] {
  const normalized = new Map<string, string>();
  for (const list of lists) {
    for (const item of list) {
      const value = normalizeTableFqn(item);
      if (!value || value.split(".").length < 3) continue;
      const key = value.toLowerCase();
      if (!normalized.has(key)) {
        normalized.set(key, value);
      }
    }
  }
  return Array.from(normalized.values()).slice(0, TABLE_LIMIT);
}

async function retrieveWithFallback(
  question: string,
  plans: RetrievalPlan[],
  latestRunId: string | null,
  latestScanId: string | null,
): Promise<RetrievedChunk[]> {
  const strict = await retrieveForPlans(question, plans, latestRunId, latestScanId, false);
  if (strict.length > 0) {
    return strict;
  }

  const hasStrictFilters = plans.some((plan) => plan.useLatestRun || plan.useLatestScan);
  if (!hasStrictFilters) {
    return strict;
  }

  logger.info("[assistant/context] Strict retrieval returned no chunks, retrying relaxed filters");
  return retrieveForPlans(question, plans, latestRunId, latestScanId, true);
}

async function retrieveForPlans(
  question: string,
  plans: RetrievalPlan[],
  latestRunId: string | null,
  latestScanId: string | null,
  relaxed: boolean,
): Promise<RetrievedChunk[]> {
  const retrievals = await Promise.all(
    plans.map((plan) =>
      retrieveContext(question, {
        scope: plan.scope,
        topK: plan.topK,
        minScore: relaxed ? Math.max(0.25, plan.minScore - 0.1) : plan.minScore,
        enforceSourcePriority: true,
        runId: !relaxed && plan.useLatestRun ? latestRunId ?? undefined : undefined,
        scanId: !relaxed && plan.useLatestScan ? latestScanId ?? undefined : undefined,
      }),
    ),
  );

  const deduped = new Map<string, RetrievedChunk>();
  for (let i = 0; i < retrievals.length; i++) {
    const plan = plans[i];
    const list = retrievals[i];
    logger.debug("[assistant/context] Retrieval scope result", {
      scope: plan.scope ?? "all",
      relaxed,
      resultCount: list.length,
      topScore: list[0]?.score,
    });
    for (const chunk of list) {
      const key = `${chunk.kind}:${chunk.sourceId}`;
      const existing = deduped.get(key);
      if (!existing || chunk.score > existing.score) {
        deduped.set(key, chunk);
      }
    }
  }
  return Array.from(deduped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, TABLE_LIMIT);
}

// ---------------------------------------------------------------------------
// Table enrichment (per-table deep detail from Lakebase)
// ---------------------------------------------------------------------------

/**
 * Fetch enrichment metadata (health, staleness, owner, lineage, insights,
 * related use cases) for a list of table FQNs directly from Lakebase.
 */
async function fetchTableEnrichments(fqns: string[]): Promise<TableEnrichment[]> {
  if (fqns.length === 0) return [];

  try {
    return await withPrisma(async (prisma) => {
      const [details, histories, lineage] = await Promise.all([
        prisma.forgeTableDetail.findMany({
          where: { tableFqn: { in: fqns } },
          orderBy: { scan: { createdAt: "desc" } },
          distinct: ["tableFqn"],
        }),
        prisma.forgeTableHistorySummary.findMany({
          where: { tableFqn: { in: fqns } },
          orderBy: { scan: { createdAt: "desc" } },
          distinct: ["tableFqn"],
        }),
        prisma.forgeTableLineage.findMany({
          where: {
            OR: [
              { sourceTableFqn: { in: fqns } },
              { targetTableFqn: { in: fqns } },
            ],
          },
        }),
      ]);

      const historyByFqn = new Map(histories.map((h) => [h.tableFqn, h]));

      const upstreamByFqn = new Map<string, string[]>();
      const downstreamByFqn = new Map<string, string[]>();
      for (const edge of lineage) {
        const ds = downstreamByFqn.get(edge.sourceTableFqn) ?? [];
        ds.push(edge.targetTableFqn);
        downstreamByFqn.set(edge.sourceTableFqn, ds);

        const us = upstreamByFqn.get(edge.targetTableFqn) ?? [];
        us.push(edge.sourceTableFqn);
        upstreamByFqn.set(edge.targetTableFqn, us);
      }

      return details.map((d) => {
        const h = historyByFqn.get(d.tableFqn);
        const issues = parseJsonArray(h?.issuesJson);
        const recommendations = parseJsonArray(h?.recommendationsJson);

        return {
          tableFqn: d.tableFqn,
          owner: d.owner,
          numRows: d.numRows ? String(d.numRows) : null,
          sizeInBytes: d.sizeInBytes ? String(d.sizeInBytes) : null,
          lastModified: d.lastModified ? new Date(d.lastModified).toISOString() : null,
          createdBy: d.createdBy,
          dataDomain: d.dataDomain,
          dataTier: d.dataTier,
          healthScore: h?.healthScore ?? null,
          issues,
          recommendations,
          lastWriteTimestamp: h?.lastWriteTimestamp ? new Date(h.lastWriteTimestamp).toISOString() : null,
          lastWriteOperation: h?.lastWriteOperation ?? null,
          upstreamTables: upstreamByFqn.get(d.tableFqn) ?? [],
          downstreamTables: downstreamByFqn.get(d.tableFqn) ?? [],
        };
      });
    });
  } catch (err) {
    logger.warn("[assistant/context] Failed to fetch table enrichments", { error: String(err) });
    return [];
  }
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function formatConversationHistory(history: ConversationTurn[]): string {
  if (history.length === 0) return "";

  const recent = history.slice(-10);
  return recent
    .map((turn) => {
      const role = turn.role === "user" ? "User" : "Assistant";
      const content = turn.content.length > 500
        ? turn.content.slice(0, 500) + "…"
        : turn.content;
      return `**${role}:** ${content}`;
    })
    .join("\n\n");
}

function formatTableEnrichments(enrichments: TableEnrichment[]): string {
  return enrichments
    .map((t) => {
      const parts = [`**${t.tableFqn}**`];
      if (t.owner) parts.push(`- Owner: ${t.owner}`);
      if (t.createdBy) parts.push(`- Created by: ${t.createdBy}`);
      if (t.dataDomain) parts.push(`- Domain: ${t.dataDomain}${t.dataTier ? ` (${t.dataTier})` : ""}`);
      if (t.numRows) parts.push(`- Rows: ${Number(t.numRows).toLocaleString()}`);
      if (t.sizeInBytes) parts.push(`- Size: ${formatBytes(Number(t.sizeInBytes))}`);
      if (t.healthScore !== null) parts.push(`- Health score: ${t.healthScore}/100`);
      if (t.lastModified) parts.push(`- Last modified: ${t.lastModified}`);
      if (t.lastWriteTimestamp) parts.push(`- Last write: ${t.lastWriteTimestamp} (${t.lastWriteOperation ?? "unknown op"})`);
      if (t.issues.length > 0) parts.push(`- Issues: ${t.issues.join("; ")}`);
      if (t.upstreamTables.length > 0) parts.push(`- Upstream: ${t.upstreamTables.join(", ")}`);
      if (t.downstreamTables.length > 0) parts.push(`- Downstream: ${t.downstreamTables.join(", ")}`);
      return parts.join("\n");
    })
    .join("\n\n");
}

function parseJsonArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? s.slice(0, maxLen) + "…" : s;
}

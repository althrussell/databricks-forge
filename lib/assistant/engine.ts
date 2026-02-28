/**
 * Ask Forge engine -- orchestrates the conversational AI assistant.
 *
 * Coordinates intent detection, RAG context building, LLM streaming,
 * and action extraction into a unified pipeline that powers the
 * conversational panel.
 */

import { classifyIntent, type AssistantIntent, type IntentClassification } from "./intent";
import { buildAssistantContext, buildSourceReferences, type AssistantContext, type TableEnrichment } from "./context-builder";
import { buildAssistantMessages, type AssistantPersona } from "./prompts";
import { extractSqlBlocks } from "./sql-proposer";
import { extractDashboardIntent, type DashboardProposal } from "./dashboard-proposer";
import { retrieveContext } from "@/lib/embeddings/retriever";
import { isEmbeddingEnabled } from "@/lib/embeddings/config";
import { chatCompletionStream, type StreamCallback, type TokenUsage } from "@/lib/dbx/model-serving";
import { getServingEndpoint } from "@/lib/dbx/client";
import { createAssistantLog } from "@/lib/lakebase/assistant-log";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ActionCard {
  type:
    | "run_sql"
    | "deploy_notebook"
    | "create_dashboard"
    | "deploy_dashboard"
    | "create_genie_space"
    | "view_tables"
    | "view_erd"
    | "start_discovery"
    | "export_report"
    | "view_run"
    | "ask_genie";
  label: string;
  payload: Record<string, unknown>;
}

export interface SourceCard {
  index: number;
  label: string;
  kind: string;
  sourceId: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export interface ExistingDashboard {
  sourceId: string;
  title: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export interface AssistantResponse {
  answer: string;
  intent: IntentClassification;
  sources: SourceCard[];
  actions: ActionCard[];
  tables: string[];
  tableEnrichments: TableEnrichment[];
  sqlBlocks: string[];
  dashboardProposal: DashboardProposal | null;
  existingDashboards: ExistingDashboard[];
  tokenUsage: TokenUsage | null;
  durationMs: number;
  logId: string | null;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * Run the full assistant pipeline: classify -> context -> stream -> extract.
 *
 * The `onChunk` callback is invoked for each streaming content delta,
 * enabling real-time SSE streaming to the client.
 */
export async function runAssistantEngine(
  question: string,
  history: ConversationTurn[] = [],
  onChunk?: StreamCallback,
  sessionId?: string,
  userId?: string | null,
  persona: AssistantPersona = "business",
): Promise<AssistantResponse> {
  const start = Date.now();

  const intentResult = await classifyIntent(question);
  logger.info("[assistant/engine] Intent classified", {
    intent: intentResult.intent,
    confidence: intentResult.confidence,
  });

  const context: AssistantContext = await buildAssistantContext(
    question,
    intentResult.intent,
    history,
  );

  // Short-circuit when no data exists -- avoid burning LLM tokens on generic answers
  if (context.hasDataGaps) {
    const noDataAnswer = `**No data available yet.**\n\nAsk Forge needs data from your Unity Catalog estate to provide grounded answers. To get started:\n\n1. **Run an Environment Scan** -- go to the Environment page and scan your catalogs\n2. **Run a Discovery Pipeline** -- go to Configure and generate use cases\n3. **Upload documents** to the Knowledge Base for additional context\n\nOnce data is available, I can answer questions about your tables, columns, health, lineage, and more.`;

    if (onChunk) {
      onChunk(noDataAnswer);
    }

    let logId: string | null = null;
    try {
      logId = await createAssistantLog({
        sessionId: sessionId ?? "anonymous",
        question,
        intent: intentResult.intent,
        intentConfidence: intentResult.confidence,
        response: noDataAnswer,
        durationMs: Date.now() - start,
        userId: userId ?? undefined,
        persona,
      });
    } catch {
      // best-effort logging
    }

    return {
      answer: noDataAnswer,
      intent: intentResult,
      sources: [],
      actions: [
        { type: "start_discovery", label: "Start Discovery", payload: {} },
      ],
      tables: [],
      tableEnrichments: [],
      sqlBlocks: [],
      dashboardProposal: null,
      existingDashboards: [],
      tokenUsage: null,
      durationMs: Date.now() - start,
      logId,
    };
  }

  const sources = buildSourceReferences(context.chunks);

  const { system, user } = buildAssistantMessages(
    context.ragContext,
    context.conversationHistory,
    question,
    persona,
  );

  const llmResponse = await chatCompletionStream(
    {
      endpoint: getServingEndpoint(),
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      maxTokens: 4096,
    },
    onChunk,
  );

  const answer = llmResponse.content;
  const sqlBlocks = extractSqlBlocks(answer);
  const dashboardProposal = extractDashboardIntent(answer);

  let existingDashboards: ExistingDashboard[] = [];
  if (intentResult.intent === "dashboard") {
    try {
      const { withPrisma } = await import("@/lib/prisma");
      const dbDashboards = await withPrisma(async (prisma) =>
        prisma.forgeDashboardRecommendation.findMany({
          select: { id: true, title: true, domain: true, description: true },
          take: 5,
          orderBy: { createdAt: "desc" },
        }),
      );
      existingDashboards = dbDashboards.map((d) => ({
        sourceId: d.id,
        title: d.title,
        score: 1.0,
        metadata: { domain: d.domain, description: d.description },
      }));
    } catch {
      // best-effort dashboard lookup
    }
  }

  let genieSpaceMatch: { spaceTitle: string; spaceId: string; score: number } | null = null;
  if (isEmbeddingEnabled()) {
    try {
      const genieChunks = await retrieveContext(question, {
        kinds: ["genie_recommendation", "genie_question"],
        topK: 1,
        minScore: 0.7,
      });
      if (genieChunks.length > 0) {
        const m = genieChunks[0].metadata ?? {};
        genieSpaceMatch = {
          spaceTitle: (m.spaceTitle as string) ?? (m.title as string) ?? "Genie Space",
          spaceId: (m.spaceId as string) ?? genieChunks[0].sourceId,
          score: genieChunks[0].score,
        };
      }
    } catch {
      // best-effort Genie routing
    }
  }

  const actions = buildActions(
    intentResult.intent, sqlBlocks, dashboardProposal, context.tables,
    genieSpaceMatch, context.tableEnrichments, question,
  );

  const durationMs = Date.now() - start;

  logger.info("[assistant/engine] Response complete", {
    intent: intentResult.intent,
    sourceCount: sources.length,
    sqlBlockCount: sqlBlocks.length,
    actionCount: actions.length,
    durationMs,
  });

  let logId: string | null = null;
  try {
    logId = await createAssistantLog({
      sessionId: sessionId ?? "anonymous",
      question,
      intent: intentResult.intent,
      intentConfidence: intentResult.confidence,
      ragChunkIds: context.chunks.map((c) => c.sourceId),
      response: answer,
      sqlGenerated: sqlBlocks.length > 0 ? sqlBlocks[0] : undefined,
      durationMs,
      promptTokens: llmResponse.usage?.promptTokens,
      completionTokens: llmResponse.usage?.completionTokens,
      totalTokens: llmResponse.usage?.totalTokens,
      userId: userId ?? undefined,
      sources,
      referencedTables: context.tables,
      persona,
    });
  } catch (err) {
    logger.warn("[assistant/engine] Failed to log interaction", { error: String(err) });
  }

  return {
    answer,
    intent: intentResult,
    sources,
    actions,
    tables: context.tables,
    tableEnrichments: context.tableEnrichments,
    sqlBlocks,
    dashboardProposal,
    existingDashboards,
    tokenUsage: llmResponse.usage,
    durationMs,
    logId,
  };
}

function isSubstantiveSql(sql: string): boolean {
  const upper = sql.toUpperCase();
  return (
    sql.length > 100 ||
    upper.includes("JOIN") ||
    upper.includes("GROUP BY") ||
    upper.includes("WINDOW") ||
    upper.includes("WITH ")
  );
}

function buildActions(
  intent: AssistantIntent,
  sqlBlocks: string[],
  dashboardProposal: DashboardProposal | null,
  tables: string[],
  genieMatch: { spaceTitle: string; spaceId: string; score: number } | null = null,
  tableEnrichments: TableEnrichment[] = [],
  conversationSummary: string = "",
): ActionCard[] {
  const actions: ActionCard[] = [];

  if (sqlBlocks.length > 0) {
    actions.push({
      type: "run_sql",
      label: "Run this SQL",
      payload: { sql: sqlBlocks[0] },
    });
    if (isSubstantiveSql(sqlBlocks[0])) {
      actions.push({
        type: "deploy_notebook",
        label: "Deploy as Notebook",
        payload: { sql: sqlBlocks[0] },
      });
    }
  }

  if (sqlBlocks.length > 0 && intent === "dashboard" && dashboardProposal) {
    actions.push({
      type: "deploy_dashboard",
      label: "Deploy as Dashboard",
      payload: { sql: sqlBlocks[0], proposal: dashboardProposal },
    });
  } else if (intent === "dashboard" || dashboardProposal) {
    actions.push({
      type: "create_dashboard",
      label: "Create Dashboard",
      payload: { proposal: dashboardProposal },
    });
  }

  if (tables.length > 0) {
    actions.push({
      type: "view_tables",
      label: `View ${tables.length} Referenced Table${tables.length > 1 ? "s" : ""}`,
      payload: { tables },
    });

    if (tables.length >= 2) {
      actions.push({
        type: "view_erd",
        label: "View ERD",
        payload: { tables },
      });

      const schemas = tables
        .map((t) => t.split(".")[1])
        .filter(Boolean);
      const schemaCounts = new Map<string, number>();
      for (const s of schemas) schemaCounts.set(s, (schemaCounts.get(s) || 0) + 1);
      let domainHint = "";
      let bestCount = 0;
      for (const [schema, count] of schemaCounts) {
        if (count > bestCount) { bestCount = count; domainHint = schema; }
      }

      const enrichmentMap = new Map(tableEnrichments.map((e) => [e.tableFqn, e]));
      actions.push({
        type: "create_genie_space",
        label: "Create Genie Space",
        payload: {
          tables,
          domainHint: domainHint || undefined,
          tableEnrichments: tables.map((t) => enrichmentMap.get(t)).filter(Boolean),
          sqlBlocks: sqlBlocks.slice(0, 3),
          conversationSummary: conversationSummary || undefined,
          intent,
        },
      });
    }
  }

  if (genieMatch) {
    const host = process.env.DATABRICKS_HOST?.replace(/\/+$/, "") ?? "";
    actions.unshift({
      type: "ask_genie",
      label: `Ask Genie: ${genieMatch.spaceTitle}`,
      payload: {
        genieSpaceId: genieMatch.spaceId,
        genieSpaceTitle: genieMatch.spaceTitle,
        url: host ? `${host}/ml/genie/rooms/${genieMatch.spaceId}` : "",
      },
    });
  }

  return actions;
}

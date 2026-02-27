/**
 * Ask Forge engine -- orchestrates the conversational AI assistant.
 *
 * Coordinates intent detection, RAG context building, LLM streaming,
 * and action extraction into a unified pipeline that powers the
 * conversational panel.
 */

import { classifyIntent, type AssistantIntent, type IntentClassification } from "./intent";
import { buildAssistantContext, buildSourceReferences, type AssistantContext, type TableEnrichment } from "./context-builder";
import { buildAssistantMessages } from "./prompts";
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
    | "export_report";
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

  const sources = buildSourceReferences(context.chunks);

  const { system, user } = buildAssistantMessages(
    context.ragContext,
    context.conversationHistory,
    question,
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
  if (intentResult.intent === "dashboard" && isEmbeddingEnabled()) {
    try {
      const dashChunks = await retrieveContext(question, {
        kinds: ["genie_recommendation"],
        topK: 3,
        minScore: 0.5,
      });
      existingDashboards = dashChunks.map((c) => ({
        sourceId: c.sourceId,
        title: (c.metadata?.title as string) ?? c.sourceId,
        score: c.score,
        metadata: c.metadata,
      }));
    } catch {
      // best-effort dashboard search
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

  const actions = buildActions(intentResult.intent, sqlBlocks, dashboardProposal, context.tables, genieSpaceMatch);

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

function buildActions(
  intent: AssistantIntent,
  sqlBlocks: string[],
  dashboardProposal: DashboardProposal | null,
  tables: string[],
  genieMatch: { spaceTitle: string; spaceId: string; score: number } | null = null,
): ActionCard[] {
  const actions: ActionCard[] = [];

  if (sqlBlocks.length > 0) {
    actions.push({
      type: "run_sql",
      label: "Run this SQL",
      payload: { sql: sqlBlocks[0] },
    });
    actions.push({
      type: "deploy_notebook",
      label: "Deploy as Notebook",
      payload: { sql: sqlBlocks[0] },
    });
  }

  if (sqlBlocks.length > 0 && (intent === "dashboard" || dashboardProposal)) {
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
    }

    actions.push({
      type: "create_genie_space",
      label: "Create Genie Space",
      payload: { tables },
    });
  }

  if (genieMatch) {
    actions.unshift({
      type: "view_tables",
      label: `Ask Genie: ${genieMatch.spaceTitle}`,
      payload: { genieSpaceId: genieMatch.spaceId, genieSpaceTitle: genieMatch.spaceTitle },
    });
  }

  return actions;
}

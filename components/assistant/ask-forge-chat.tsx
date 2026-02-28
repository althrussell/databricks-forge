"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnswerStream } from "./answer-stream";
import { SourceCardList } from "./source-card";
import { ActionCardList, type ActionCardData } from "./action-card";
import { SqlRunner } from "./sql-runner";
import { DeployOptions } from "./deploy-options";
import type { AssistantPersona } from "@/lib/assistant/prompts";
import {
  BrainCircuit,
  Send,
  Loader2,
  User,
  Bot,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---------------------------------------------------------------------------
// Types (exported for consumers)
// ---------------------------------------------------------------------------

export interface TableEnrichmentData {
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

export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceData[];
  actions?: ActionCardData[];
  intent?: { intent: string; confidence: number };
  sqlBlocks?: string[];
  tableEnrichments?: TableEnrichmentData[];
  isStreaming?: boolean;
  logId?: string;
  feedback?: "up" | "down" | null;
}

export interface SourceData {
  index: number;
  label: string;
  kind: string;
  sourceId: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export interface AskForgeChatProps {
  /** Render mode -- 'full' gives a spacious layout, 'compact' is for the sheet */
  mode?: "full" | "compact";
  /** Active persona controlling response style */
  persona?: AssistantPersona;
  /** External session ID tied to a conversation. If omitted, generates a new one. */
  sessionId?: string;
  /** Pre-loaded messages from a saved conversation */
  initialMessages?: ConversationMessage[];
  /** Dynamic suggested questions shown on the empty state (falls back to defaults) */
  suggestedQuestions?: string[];
  /** Called when a SQL block should be opened in a dialog */
  onOpenSql?: (sql: string) => void;
  /** Called when a deploy-as-notebook action fires */
  onDeploySql?: (sql: string) => void;
  /** Called when a deploy-dashboard action fires */
  onDeployDashboard?: (sql: string, proposal: Record<string, unknown> | null) => void;
  /** Called when table enrichments are received for the latest message */
  onTableEnrichments?: (enrichments: TableEnrichmentData[]) => void;
  /** Called when referenced table FQNs are available from the response */
  onReferencedTables?: (tables: string[]) => void;
  /** Called when source references are available from the response */
  onSources?: (sources: SourceData[]) => void;
  /** Called when the backend creates a conversation for this session */
  onConversationCreated?: (conversationId: string) => void;
  /** Called when the user clears the conversation (parent should start a new session) */
  onClear?: () => void;
}

export interface AskForgeChatHandle {
  submitQuestion: (question: string) => void;
}

// ---------------------------------------------------------------------------
// Suggested questions (fallback when no dynamic questions are provided)
// ---------------------------------------------------------------------------

const FALLBACK_QUESTIONS = [
  "How can I calculate Customer Lifetime Value?",
  "Which tables have PII data?",
  "Show me revenue trends by region",
  "What data quality issues exist?",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const AskForgeChat = React.forwardRef<AskForgeChatHandle, AskForgeChatProps>(
  function AskForgeChat(
    {
      mode = "full",
      persona = "business",
      sessionId: externalSessionId,
      initialMessages,
      suggestedQuestions,
      onOpenSql,
      onDeploySql,
      onDeployDashboard,
      onTableEnrichments,
      onReferencedTables,
      onSources,
      onConversationCreated,
      onClear,
    },
    ref,
  ) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<ConversationMessage[]>(initialMessages ?? []);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [activeSql, setActiveSql] = React.useState<string | null>(null);
  const [deploySql, setDeploySql] = React.useState<string | null>(null);
  const [fallbackSessionId] = React.useState(() => crypto.randomUUID());
  const sessionId = externalSessionId ?? fallbackSessionId;
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMessages(initialMessages ?? []);
  }, [initialMessages]);

  const scrollToBottom = React.useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, 50);
  }, []);

  const handleSubmit = async (externalQuestion?: string) => {
    const question = (externalQuestion ?? input).trim();
    if (!question || loading) return;

    const userMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };

    const assistantMsg: ConversationMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);
    setActiveSql(null);
    scrollToBottom();

    try {
      const history = messages
        .filter((m) => !m.isStreaming)
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, sessionId, persona }),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let streamedContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === "chunk") {
              streamedContent += parsed.content;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? { ...m, content: streamedContent }
                    : m,
                ),
              );
              scrollToBottom();
            } else if (parsed.type === "done") {
              const enrichments = parsed.tableEnrichments ?? [];
              const tables: string[] = parsed.tables ?? [];
              const sources: SourceData[] = parsed.sources ?? [];
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        content: parsed.answer,
                        isStreaming: false,
                        sources,
                        actions: parsed.actions ?? [],
                        intent: parsed.intent ?? undefined,
                        sqlBlocks: parsed.sqlBlocks ?? [],
                        tableEnrichments: enrichments,
                        logId: parsed.logId ?? undefined,
                        feedback: null,
                      }
                    : m,
                ),
              );
              if (enrichments.length > 0) {
                onTableEnrichments?.(enrichments);
              }
              if (tables.length > 0) {
                onReferencedTables?.(tables);
              }
              if (sources.length > 0) {
                onSources?.(sources);
              }
              if (parsed.conversationId) {
                onConversationCreated?.(parsed.conversationId);
              }
            } else if (parsed.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        content: `**Error:** ${parsed.error}`,
                        isStreaming: false,
                      }
                    : m,
                ),
              );
            }
          } catch {
            // skip malformed SSE lines
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? {
                ...m,
                content: `**Error:** ${err instanceof Error ? err.message : "Something went wrong"}`,
                isStreaming: false,
              }
            : m,
        ),
      );
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  React.useImperativeHandle(ref, () => ({
    submitQuestion: (q: string) => {
      setInput(q);
      setTimeout(() => handleSubmit(q), 0);
    },
  }));

  const handleAction = (action: ActionCardData) => {
    if (action.type === "run_sql" && action.payload.sql) {
      if (onOpenSql) {
        onOpenSql(action.payload.sql as string);
      } else {
        setActiveSql(action.payload.sql as string);
        setDeploySql(null);
      }
    } else if (action.type === "deploy_notebook" && action.payload.sql) {
      if (onDeploySql) {
        onDeploySql(action.payload.sql as string);
      } else {
        setDeploySql(action.payload.sql as string);
        setActiveSql(null);
      }
    } else if (action.type === "deploy_dashboard" && action.payload.sql) {
      if (onDeployDashboard) {
        onDeployDashboard(
          action.payload.sql as string,
          (action.payload.proposal as Record<string, unknown>) ?? null,
        );
      } else {
        router.push("/dashboards");
      }
    } else if (action.type === "view_tables") {
      if (action.payload.fqn) {
        router.push(`/environment/table/${encodeURIComponent(action.payload.fqn as string)}`);
      } else if (Array.isArray(action.payload.tables) && action.payload.tables.length === 1) {
        router.push(`/environment/table/${encodeURIComponent(action.payload.tables[0] as string)}`);
      } else {
        router.push("/environment?tab=tables");
      }
    } else if (action.type === "view_erd") {
      router.push("/environment?tab=erd");
    } else if (action.type === "create_dashboard") {
      router.push("/dashboards");
    } else if (action.type === "create_genie_space") {
      const tables = (action.payload.tables as string[]) ?? [];
      const params = new URLSearchParams();
      if (tables.length > 0) params.set("tables", tables.join(","));
      if (action.payload.domainHint) params.set("domain", action.payload.domainHint as string);
      if (action.payload.conversationSummary) params.set("context", action.payload.conversationSummary as string);
      router.push(`/genie/new?${params.toString()}`);
    } else if (action.type === "start_discovery") {
      router.push("/configure");
    } else if (action.type === "view_run" && action.payload.runId) {
      router.push(`/runs/${action.payload.runId}`);
    } else if (action.type === "ask_genie" && action.payload.url) {
      window.open(action.payload.url as string, "_blank");
    } else if (action.type === "export_report") {
      router.push("/environment?tab=overview");
    }
  };

  const handleRequestFix = (sql: string, error: string) => {
    setInput(`Fix this SQL error:\n\nSQL: ${sql}\n\nError: ${error}`);
    setActiveSql(null);
    inputRef.current?.focus();
  };

  const handleFeedback = async (msgId: string, logId: string, rating: "up" | "down") => {
    setMessages((prev) =>
      prev.map((m) => (m.id === msgId ? { ...m, feedback: rating } : m)),
    );
    try {
      await fetch("/api/assistant/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, rating }),
      });
    } catch {
      // feedback is best-effort
    }
  };

  const handleClear = () => {
    setMessages([]);
    setActiveSql(null);
    setDeploySql(null);
    onTableEnrichments?.([]);
    onReferencedTables?.([]);
    onSources?.([]);
    onClear?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const isCompact = mode === "compact";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <BrainCircuit className="size-5 text-primary" />
          <h2 className="text-base font-semibold">Ask Forge</h2>
          <Badge variant="secondary" className="text-[10px]">AI</Badge>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleClear} title="Clear conversation">
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className={`space-y-4 p-4 ${isCompact ? "" : "mx-auto w-full max-w-[min(90%,72rem)]"}`}>
          {messages.length === 0 && (
            suggestedQuestions && suggestedQuestions.length === 0 ? (
              <div className={`flex flex-col items-center justify-center gap-4 text-center ${isCompact ? "py-16" : "py-24"}`}>
                <AlertCircle className={`text-muted-foreground/40 ${isCompact ? "size-10" : "size-14"}`} />
                <div>
                  <p className={`font-medium ${isCompact ? "" : "text-lg"}`}>No data available yet</p>
                  <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                    Run an environment scan or discovery pipeline to start asking questions.
                    Ask Forge answers are grounded in your actual metadata.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push("/environment")}>
                    Go to Environment
                  </Button>
                  <Button variant="default" size="sm" onClick={() => router.push("/configure")}>
                    Go to Configure
                  </Button>
                </div>
              </div>
            ) : (
              <div className={`flex flex-col items-center justify-center gap-3 text-center ${isCompact ? "py-16" : "py-24"}`}>
                <BrainCircuit className={`text-muted-foreground/30 ${isCompact ? "size-12" : "size-16"}`} />
                <div>
                  <p className={`font-medium ${isCompact ? "" : "text-lg"}`}>Ask Forge anything about your data</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ask business questions, explore your estate, or request SQL and dashboards.
                    Answers are grounded in your actual metadata.
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {(suggestedQuestions ?? FALLBACK_QUESTIONS).map((q) => (
                    <button
                      key={q}
                      onClick={() => { setInput(q); inputRef.current?.focus(); }}
                      className="rounded-full border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}

          {messages.map((msg) => (
            <div key={msg.id} className="space-y-3">
              <div className="flex items-start gap-2.5">
                <div className={`mt-1 flex size-6 shrink-0 items-center justify-center rounded-full ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {msg.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                </div>
                <div className="min-w-0 flex-1">
                  {msg.role === "user" ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <>
                      {msg.intent && (
                        <Badge variant="outline" className="mb-2 text-[10px]">
                          {msg.intent.intent} · {(msg.intent.confidence * 100).toFixed(0)}%
                        </Badge>
                      )}
                      <AnswerStream content={msg.content} isStreaming={msg.isStreaming ?? false} />
                    </>
                  )}
                </div>
              </div>

              {msg.role === "assistant" && !msg.isStreaming && msg.actions && msg.actions.length > 0 && (
                <div className="ml-8">
                  <ActionCardList actions={msg.actions} onAction={handleAction} />
                </div>
              )}

              {msg.role === "assistant" && !msg.isStreaming && msg.sources && msg.sources.length > 0 && (
                <div className="ml-8">
                  <SourceCardList sources={msg.sources} />
                </div>
              )}

              {msg.role === "assistant" && !msg.isStreaming && msg.logId && (
                <div className="ml-8 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-7 p-0 ${msg.feedback === "up" ? "text-green-600" : "text-muted-foreground"}`}
                    onClick={() => handleFeedback(msg.id, msg.logId!, "up")}
                    disabled={!!msg.feedback}
                    title="Helpful"
                  >
                    <ThumbsUp className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-7 p-0 ${msg.feedback === "down" ? "text-red-600" : "text-muted-foreground"}`}
                    onClick={() => handleFeedback(msg.id, msg.logId!, "down")}
                    disabled={!!msg.feedback}
                    title="Not helpful"
                  >
                    <ThumbsDown className="size-3.5" />
                  </Button>
                  {msg.feedback && (
                    <span className="text-[10px] text-muted-foreground">
                      {msg.feedback === "up" ? "Thanks!" : "We'll improve"}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Inline SQL runner -- only used in compact/sheet mode without dialog support */}
          {activeSql && !onOpenSql && (
            <div className="ml-8">
              <SqlRunner sql={activeSql} onRequestFix={handleRequestFix} />
            </div>
          )}

          {deploySql && !onDeploySql && (
            <div className="ml-8">
              <DeployOptions sql={deploySql} />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4">
        <div className={`flex items-end gap-2 ${isCompact ? "" : "mx-auto w-full max-w-[min(90%,72rem)]"}`}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your data estate..."
            className="flex-1 resize-none rounded-md border bg-muted/50 px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            rows={input.includes("\n") ? Math.min(5, input.split("\n").length + 1) : 1}
            disabled={loading}
          />
          <Button
            size="sm"
            className="h-9 w-9 shrink-0 p-0"
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
        <p className={`mt-1.5 text-[10px] text-muted-foreground ${isCompact ? "" : "mx-auto w-full max-w-[min(90%,72rem)]"}`}>
          Press Enter to send, Shift+Enter for new line. ⌘J to toggle.
        </p>
      </div>
    </div>
  );
  },
);


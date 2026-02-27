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
import {
  BrainCircuit,
  Send,
  Loader2,
  User,
  Bot,
  Trash2,
  ThumbsUp,
  ThumbsDown,
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
  /** Called when the user wants to ask about a specific table */
  onAskAboutTable?: (fqn: string) => void;
}

// ---------------------------------------------------------------------------
// Suggested questions
// ---------------------------------------------------------------------------

const SUGGESTED_QUESTIONS = [
  "How can I calculate Customer Lifetime Value?",
  "Which tables have PII data?",
  "Show me revenue trends by region",
  "What data quality issues exist?",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AskForgeChat({
  mode = "full",
  onOpenSql,
  onDeploySql,
  onDeployDashboard,
  onTableEnrichments,
  onReferencedTables,
  onSources,
  onAskAboutTable,
}: AskForgeChatProps) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [activeSql, setActiveSql] = React.useState<string | null>(null);
  const [deploySql, setDeploySql] = React.useState<string | null>(null);
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const scrollToBottom = React.useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }, 50);
  }, []);

  const handleSubmit = async () => {
    const question = input.trim();
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
        body: JSON.stringify({ question, history, sessionId }),
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
      router.push("/metadata-genie");
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
      <ScrollArea className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className={`space-y-4 p-4 ${isCompact ? "" : "mx-auto max-w-3xl"}`}>
          {messages.length === 0 && (
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
                {SUGGESTED_QUESTIONS.map((q) => (
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
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t p-4">
        <div className={`flex items-end gap-2 ${isCompact ? "" : "mx-auto max-w-3xl"}`}>
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
            onClick={handleSubmit}
            disabled={loading || !input.trim()}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
        <p className={`mt-1.5 text-[10px] text-muted-foreground ${isCompact ? "" : "mx-auto max-w-3xl"}`}>
          Press Enter to send, Shift+Enter for new line. ⌘J to toggle.
        </p>
      </div>
    </div>
  );
}


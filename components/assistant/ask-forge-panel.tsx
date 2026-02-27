"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  X,
  Trash2,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SourceData {
  index: number;
  label: string;
  kind: string;
  sourceId: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceData[];
  actions?: ActionCardData[];
  intent?: { intent: string; confidence: number };
  sqlBlocks?: string[];
  isStreaming?: boolean;
  logId?: string;
  feedback?: "up" | "down" | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AskForgePanel() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ConversationMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [activeSql, setActiveSql] = React.useState<string | null>(null);
  const [deploySql, setDeploySql] = React.useState<string | null>(null);
  const [sessionId] = React.useState(() => crypto.randomUUID());
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

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
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        content: parsed.answer,
                        isStreaming: false,
                        sources: parsed.sources ?? [],
                        actions: parsed.actions ?? [],
                        intent: parsed.intent ?? undefined,
                        sqlBlocks: parsed.sqlBlocks ?? [],
                        logId: parsed.logId ?? undefined,
                        feedback: null,
                      }
                    : m,
                ),
              );
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
      setActiveSql(action.payload.sql as string);
      setDeploySql(null);
    } else if (action.type === "deploy_notebook" && action.payload.sql) {
      setDeploySql(action.payload.sql as string);
      setActiveSql(null);
    } else if (action.type === "view_tables" && action.payload.fqn) {
      setOpen(false);
      router.push(`/environment/table/${encodeURIComponent(action.payload.fqn as string)}`);
    } else if (action.type === "view_erd") {
      setOpen(false);
      router.push("/environment?tab=erd");
    } else if (action.type === "create_dashboard") {
      setOpen(false);
      router.push("/dashboards");
    } else if (action.type === "create_genie_space") {
      setOpen(false);
      router.push("/metadata-genie");
    } else if (action.type === "start_discovery") {
      setOpen(false);
      router.push("/configure");
    } else if (action.type === "view_run" && action.payload.runId) {
      setOpen(false);
      router.push(`/runs/${action.payload.runId}`);
    } else if (action.type === "ask_genie" && action.payload.url) {
      window.open(action.payload.url as string, "_blank");
    } else if (action.type === "export_report") {
      setOpen(false);
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="hidden gap-1.5 text-xs md:flex"
        onClick={() => setOpen(true)}
      >
        <BrainCircuit className="size-4" />
        Ask Forge
        <kbd className="ml-1 inline-flex h-5 items-center rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
          ⌘J
        </kbd>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-xl">
          <SheetHeader className="flex flex-row items-center justify-between border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <BrainCircuit className="size-5 text-primary" />
              <SheetTitle className="text-base">Ask Forge</SheetTitle>
              <Badge variant="secondary" className="text-[10px]">AI</Badge>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleClear} title="Clear conversation">
                  <Trash2 className="size-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1 overflow-y-auto" ref={scrollRef}>
            <div className="space-y-4 p-4">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                  <BrainCircuit className="size-12 text-muted-foreground/30" />
                  <div>
                    <p className="font-medium">Ask Forge anything about your data</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Ask business questions, explore your estate, or request SQL and dashboards
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {[
                      "How can I calculate Customer Lifetime Value?",
                      "Which tables have PII data?",
                      "Show me revenue trends by region",
                      "What data quality issues exist?",
                    ].map((q) => (
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

              {activeSql && (
                <div className="ml-8">
                  <SqlRunner sql={activeSql} onRequestFix={handleRequestFix} />
                </div>
              )}

              {deploySql && (
                <div className="ml-8">
                  <DeployOptions sql={deploySql} />
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-4">
            <div className="flex items-end gap-2">
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
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Press Enter to send, Shift+Enter for new line. ⌘J to toggle.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

"use client";

import * as React from "react";
import {
  AskForgeChat,
  type AskForgeChatHandle,
  type ConversationMessage,
  type TableEnrichmentData,
  type SourceData,
} from "@/components/assistant/ask-forge-chat";
import { AskForgeContextPanel, type TableDetailData } from "@/components/assistant/ask-forge-context-panel";
import { ConversationHistory } from "@/components/assistant/conversation-history";
import { EmbeddingStatus } from "@/components/assistant/embedding-status";
import { SqlDialog } from "@/components/assistant/sql-dialog";
import { DeployDashboardDialog } from "@/components/assistant/deploy-dashboard-dialog";
import { DeployOptions } from "@/components/assistant/deploy-options";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AssistantPersona } from "@/lib/assistant/prompts";
import { PanelRightClose, PanelRight, Briefcase, Wrench } from "lucide-react";

export default function AskForgeContent() {
  const [activeSql, setActiveSql] = React.useState<string | null>(null);
  const [deploySql, setDeploySql] = React.useState<string | null>(null);
  const [dashboardSql, setDashboardSql] = React.useState<string | null>(null);
  const [dashboardProposal, setDashboardProposal] = React.useState<Record<string, unknown> | null>(null);
  const [tableEnrichments, setTableEnrichments] = React.useState<TableEnrichmentData[]>([]);
  const [tableDetails, setTableDetails] = React.useState<Map<string, TableDetailData>>(new Map());
  const [referencedTables, setReferencedTables] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<SourceData[]>([]);
  const [loadingTables, setLoadingTables] = React.useState(false);
  const [suggestedQuestions, setSuggestedQuestions] = React.useState<string[] | undefined>();
  const chatRef = React.useRef<AskForgeChatHandle>(null);

  const [historyCollapsed, setHistoryCollapsed] = React.useState(false);
  const [contextCollapsed, setContextCollapsed] = React.useState(false);
  const [historyAvailable, setHistoryAvailable] = React.useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = React.useState(0);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [chatSessionId, setChatSessionId] = React.useState(() => crypto.randomUUID());
  const [initialMessages, setInitialMessages] = React.useState<ConversationMessage[] | undefined>();
  const [persona, setPersona] = React.useState<AssistantPersona>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("askforge-persona");
      if (stored === "tech") return "tech";
    }
    return "business";
  });

  const fetchSuggestions = React.useCallback((p: AssistantPersona) => {
    fetch(`/api/assistant/suggestions?persona=${p}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.questions?.length) setSuggestedQuestions(data.questions);
      })
      .catch(() => {});
  }, []);

  React.useEffect(() => {
    fetchSuggestions(persona);
  }, [persona, fetchSuggestions]);

  React.useEffect(() => {
    fetch("/api/assistant/conversations")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.authenticated) setHistoryAvailable(true);
      })
      .catch(() => {});
  }, []);

  const abortRef = React.useRef<AbortController | null>(null);

  const fetchTableDetails = React.useCallback(async (fqns: string[]) => {
    abortRef.current?.abort();

    if (fqns.length === 0) {
      setTableDetails(new Map());
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoadingTables(true);
    const newDetails = new Map<string, TableDetailData>();

    await Promise.all(
      fqns.slice(0, 10).map(async (fqn) => {
        try {
          const resp = await fetch(`/api/environment/table/${encodeURIComponent(fqn)}`, {
            signal: controller.signal,
          });
          if (resp.ok && !controller.signal.aborted) {
            const data = await resp.json();
            newDetails.set(fqn, data);
          }
        } catch {
          // best-effort per table (including AbortError)
        }
      }),
    );

    if (!controller.signal.aborted) {
      setTableDetails(newDetails);
      setLoadingTables(false);
    }
  }, []);

  const handleReferencedTables = React.useCallback(
    (tables: string[]) => {
      setReferencedTables(tables);
      fetchTableDetails(tables);
    },
    [fetchTableDetails],
  );

  const handleAskAboutTable = React.useCallback((fqn: string) => {
    chatRef.current?.submitQuestion(`Tell me everything about the table ${fqn} - its health, lineage, columns, data quality, and how it's used.`);
  }, []);

  const conversationAbortRef = React.useRef<AbortController | null>(null);

  const handleSelectConversation = React.useCallback(async (conversationId: string) => {
    if (conversationId === activeConversationId) return;

    conversationAbortRef.current?.abort();
    const controller = new AbortController();
    conversationAbortRef.current = controller;

    try {
      const resp = await fetch(`/api/assistant/conversations/${conversationId}`, {
        signal: controller.signal,
      });
      if (!resp.ok || controller.signal.aborted) return;
      const data = await resp.json();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawMessages: any[] = data.messages ?? [];
      const msgs: ConversationMessage[] = rawMessages.map(
        (m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          intent: m.intent ? { intent: m.intent, confidence: m.intentConfidence ?? 0 } : undefined,
          sqlBlocks: m.sqlGenerated ? [m.sqlGenerated] : undefined,
          sources: m.sources ?? undefined,
          logId: m.role === "assistant" ? m.logId : undefined,
          feedback: m.feedbackRating as "up" | "down" | undefined ?? null,
          isStreaming: false,
        }),
      );

      // Restore context panel from the last assistant message that has context
      const lastAssistantWithContext = [...msgs].reverse().find(
        (m) => m.role === "assistant" && (m.sources?.length || false),
      );
      const restoredSources = lastAssistantWithContext?.sources ?? [];
      const lastAssistantWithTables = [...rawMessages].reverse().find(
        (m: { role: string; referencedTables?: string[] }) =>
          m.role === "assistant" && m.referencedTables?.length,
      );
      const restoredTables: string[] = lastAssistantWithTables?.referencedTables ?? [];

      if (data.persona === "tech" || data.persona === "business") {
        setPersona(data.persona);
      }

      setActiveConversationId(conversationId);
      setChatSessionId(data.sessionId);
      setInitialMessages(msgs);
      setSources(restoredSources);
      if (restoredTables.length > 0) {
        handleReferencedTables(restoredTables);
      } else {
        setReferencedTables([]);
        setTableDetails(new Map());
      }
      setTableEnrichments([]);
    } catch {
      // best-effort
    }
  }, [activeConversationId, handleReferencedTables]);

  const handleNewConversation = React.useCallback(() => {
    setActiveConversationId(null);
    setChatSessionId(crypto.randomUUID());
    setInitialMessages(undefined);
    setTableEnrichments([]);
    setTableDetails(new Map());
    setReferencedTables([]);
    setSources([]);
    const stored = localStorage.getItem("askforge-persona");
    setPersona(stored === "tech" ? "tech" : "business");
  }, []);

  const handleClearOrDelete = React.useCallback(async () => {
    if (activeConversationId) {
      try {
        await fetch(`/api/assistant/conversations/${activeConversationId}`, { method: "DELETE" });
      } catch {
        // best-effort
      }
      setHistoryRefreshKey((k) => k + 1);
    }
    handleNewConversation();
  }, [activeConversationId, handleNewConversation]);

  const handleConversationCreated = React.useCallback((conversationId: string) => {
    setActiveConversationId(conversationId);
    setHistoryRefreshKey((k) => k + 1);
  }, []);

  const handlePersonaChange = React.useCallback((value: string) => {
    if (value !== "business" && value !== "tech") return;
    setPersona(value);
    localStorage.setItem("askforge-persona", value);
  }, []);

  return (
    <div className="-m-6 flex h-[calc(100vh-3rem)] flex-col">
      <EmbeddingStatus />

      {/* Persona toggle banner */}
      <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Mode</span>
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={persona}
          onValueChange={handlePersonaChange}
        >
          <ToggleGroupItem value="business" className="gap-1 px-2.5 text-xs">
            <Briefcase className="size-3.5" />
            Business
          </ToggleGroupItem>
          <ToggleGroupItem value="tech" className="gap-1 px-2.5 text-xs">
            <Wrench className="size-3.5" />
            Tech
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* History sidebar */}
        {historyAvailable && (
          <ConversationHistory
            activeConversationId={activeConversationId}
            refreshKey={historyRefreshKey}
            onSelectConversation={handleSelectConversation}
            onNewConversation={handleNewConversation}
            collapsed={historyCollapsed}
            onToggleCollapse={() => setHistoryCollapsed((p) => !p)}
          />
        )}

        {/* Chat panel */}
        <div className="flex min-w-0 flex-1 flex-col border-r">
          <AskForgeChat
            key={chatSessionId}
            ref={chatRef}
            mode="full"
            persona={persona}
            sessionId={chatSessionId}
            initialMessages={initialMessages}
            suggestedQuestions={suggestedQuestions}
            onOpenSql={(sql) => {
              setActiveSql(sql);
              setDeploySql(null);
            }}
            onDeploySql={(sql) => {
              setDeploySql(sql);
              setActiveSql(null);
            }}
            onDeployDashboard={(sql, proposal) => {
              setDashboardSql(sql);
              setDashboardProposal(proposal);
            }}
            onTableEnrichments={setTableEnrichments}
            onReferencedTables={handleReferencedTables}
            onSources={setSources}
            onConversationCreated={handleConversationCreated}
            onClear={handleClearOrDelete}
          />
        </div>

        {/* Context panel toggle + panel */}
        <div className="hidden shrink-0 lg:flex">
          <div className="flex flex-col">
            <Button
              variant="ghost"
              size="sm"
              className="m-1 h-8 w-8 p-0"
              onClick={() => setContextCollapsed((p) => !p)}
              title={contextCollapsed ? "Show context panel" : "Hide context panel"}
            >
              {contextCollapsed ? <PanelRight className="size-4" /> : <PanelRightClose className="size-4" />}
            </Button>
          </div>
          {!contextCollapsed && (
            <div className="w-[400px] min-w-0 overflow-hidden">
              <AskForgeContextPanel
                enrichments={tableEnrichments}
                tableDetails={tableDetails}
                referencedTables={referencedTables}
                sources={sources}
                loadingTables={loadingTables}
                onAskAboutTable={handleAskAboutTable}
              />
            </div>
          )}
        </div>
      </div>

      <SqlDialog
        open={!!activeSql}
        sql={activeSql ?? ""}
        onOpenChange={(open) => { if (!open) setActiveSql(null); }}
        onRequestFix={() => {
          setActiveSql(null);
        }}
      />

      {deploySql && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg">
            <DeployOptions sql={deploySql} />
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setDeploySql(null)}
                className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <DeployDashboardDialog
        open={!!dashboardSql}
        sql={dashboardSql ?? ""}
        proposal={dashboardProposal}
        onOpenChange={(open) => { if (!open) { setDashboardSql(null); setDashboardProposal(null); } }}
      />
    </div>
  );
}

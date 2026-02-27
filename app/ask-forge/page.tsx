"use client";

import * as React from "react";
import { AskForgeChat, type AskForgeChatHandle, type TableEnrichmentData, type SourceData } from "@/components/assistant/ask-forge-chat";
import { AskForgeContextPanel, type TableDetailData } from "@/components/assistant/ask-forge-context-panel";
import { EmbeddingStatus } from "@/components/assistant/embedding-status";
import { SqlDialog } from "@/components/assistant/sql-dialog";
import { DeployDashboardDialog } from "@/components/assistant/deploy-dashboard-dialog";
import { DeployOptions } from "@/components/assistant/deploy-options";

export default function AskForgePage() {
  const [activeSql, setActiveSql] = React.useState<string | null>(null);
  const [deploySql, setDeploySql] = React.useState<string | null>(null);
  const [dashboardSql, setDashboardSql] = React.useState<string | null>(null);
  const [dashboardProposal, setDashboardProposal] = React.useState<Record<string, unknown> | null>(null);
  const [tableEnrichments, setTableEnrichments] = React.useState<TableEnrichmentData[]>([]);
  const [tableDetails, setTableDetails] = React.useState<Map<string, TableDetailData>>(new Map());
  const [referencedTables, setReferencedTables] = React.useState<string[]>([]);
  const [sources, setSources] = React.useState<SourceData[]>([]);
  const [loadingTables, setLoadingTables] = React.useState(false);
  const chatRef = React.useRef<AskForgeChatHandle>(null);

  const fetchTableDetails = React.useCallback(async (fqns: string[]) => {
    if (fqns.length === 0) {
      setTableDetails(new Map());
      return;
    }

    setLoadingTables(true);
    const newDetails = new Map<string, TableDetailData>();

    await Promise.all(
      fqns.slice(0, 10).map(async (fqn) => {
        try {
          const resp = await fetch(`/api/environment/table/${encodeURIComponent(fqn)}`);
          if (resp.ok) {
            const data = await resp.json();
            newDetails.set(fqn, data);
          }
        } catch {
          // best-effort per table
        }
      }),
    );

    setTableDetails(newDetails);
    setLoadingTables(false);
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <EmbeddingStatus />

      <div className="flex min-h-0 flex-1">
        {/* Chat panel */}
        <div className="flex min-w-0 flex-1 flex-col border-r">
          <AskForgeChat
            ref={chatRef}
            mode="full"
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
          />
        </div>

        {/* Context panel */}
        <div className="hidden w-[400px] shrink-0 overflow-y-auto lg:block">
          <AskForgeContextPanel
            enrichments={tableEnrichments}
            tableDetails={tableDetails}
            referencedTables={referencedTables}
            sources={sources}
            loadingTables={loadingTables}
            onAskAboutTable={handleAskAboutTable}
          />
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

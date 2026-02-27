"use client";

import * as React from "react";
import { AskForgeChat, type TableEnrichmentData } from "@/components/assistant/ask-forge-chat";
import { AskForgeContextPanel } from "@/components/assistant/ask-forge-context-panel";
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

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Knowledge status bar */}
      <EmbeddingStatus />

      {/* Main two-panel layout */}
      <div className="flex min-h-0 flex-1">
        {/* Chat panel -- left */}
        <div className="flex min-w-0 flex-1 flex-col border-r">
          <AskForgeChat
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
          />
        </div>

        {/* Context panel -- right */}
        <div className="hidden w-[380px] shrink-0 overflow-y-auto lg:block">
          <AskForgeContextPanel enrichments={tableEnrichments} />
        </div>
      </div>

      {/* SQL Dialog */}
      <SqlDialog
        open={!!activeSql}
        sql={activeSql ?? ""}
        onOpenChange={(open) => { if (!open) setActiveSql(null); }}
        onRequestFix={(sql, error) => {
          setActiveSql(null);
        }}
      />

      {/* Deploy as Notebook (inline in a dialog-like overlay) */}
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

      {/* Deploy as Dashboard Dialog */}
      <DeployDashboardDialog
        open={!!dashboardSql}
        sql={dashboardSql ?? ""}
        proposal={dashboardProposal}
        onOpenChange={(open) => { if (!open) { setDashboardSql(null); setDashboardProposal(null); } }}
      />
    </div>
  );
}

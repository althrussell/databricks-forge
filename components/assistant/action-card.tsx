"use client";

import { Button } from "@/components/ui/button";
import {
  Play,
  BookOpen,
  LayoutDashboard,
  Sparkles,
  Table2,
  GitBranch,
  Rocket,
  Download,
  ExternalLink,
  Eye,
} from "lucide-react";

export interface ActionCardData {
  type: string;
  label: string;
  payload: Record<string, unknown>;
}

interface ActionCardProps {
  action: ActionCardData;
  onAction: (action: ActionCardData) => void;
}

const ACTION_CONFIG: Record<string, { icon: React.ReactNode; variant: "default" | "outline" | "secondary" }> = {
  run_sql: { icon: <Play className="size-3.5" />, variant: "default" },
  deploy_notebook: { icon: <BookOpen className="size-3.5" />, variant: "outline" },
  create_dashboard: { icon: <LayoutDashboard className="size-3.5" />, variant: "outline" },
  deploy_dashboard: { icon: <LayoutDashboard className="size-3.5" />, variant: "default" },
  create_genie_space: { icon: <Sparkles className="size-3.5" />, variant: "outline" },
  view_tables: { icon: <Table2 className="size-3.5" />, variant: "secondary" },
  view_erd: { icon: <GitBranch className="size-3.5" />, variant: "secondary" },
  start_discovery: { icon: <Rocket className="size-3.5" />, variant: "outline" },
  export_report: { icon: <Download className="size-3.5" />, variant: "secondary" },
  view_run: { icon: <Eye className="size-3.5" />, variant: "secondary" },
  ask_genie: { icon: <ExternalLink className="size-3.5" />, variant: "outline" },
};

export function ActionCard({ action, onAction }: ActionCardProps) {
  const config = ACTION_CONFIG[action.type] ?? { icon: <Play className="size-3.5" />, variant: "outline" as const };

  return (
    <Button
      variant={config.variant}
      size="sm"
      className="h-8 gap-1.5 text-xs"
      onClick={() => onAction(action)}
    >
      {config.icon}
      {action.label}
    </Button>
  );
}

export function ActionCardList({
  actions,
  onAction,
}: {
  actions: ActionCardData[];
  onAction: (action: ActionCardData) => void;
}) {
  if (actions.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Actions</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action, i) => (
          <ActionCard key={i} action={action} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}

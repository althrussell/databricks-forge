"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LayoutDashboard, Rocket, AlertCircle } from "lucide-react";

interface DeployDashboardDialogProps {
  open: boolean;
  sql: string;
  proposal: Record<string, unknown> | null;
  onOpenChange: (open: boolean) => void;
}

export function DeployDashboardDialog({
  open,
  sql,
  proposal,
  onOpenChange,
}: DeployDashboardDialogProps) {
  const router = useRouter();
  const title = (proposal?.title as string) ?? "Forge AI Dashboard";
  const description = (proposal?.description as string) ?? "";
  const tables = (proposal?.tables as string[]) ?? [];
  const widgets = (proposal?.widgetDescriptions as string[]) ?? [];

  const handleDeploy = () => {
    const params = new URLSearchParams();
    if (sql) params.set("sql", sql);
    if (title) params.set("title", title);
    onOpenChange(false);
    router.push(`/dashboards?${params.toString()}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutDashboard className="size-5 text-primary" />
            Deploy as Dashboard
          </DialogTitle>
          <DialogDescription>
            This query can be visualized as a dashboard. Review the proposal and deploy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">{title}</p>
            {description && (
              <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            )}
          </div>

          {tables.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Referenced Tables</p>
              <div className="flex flex-wrap gap-1.5">
                {tables.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {widgets.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">Proposed Widgets</p>
              <ul className="space-y-1">
                {widgets.map((w, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                    <LayoutDashboard className="mt-0.5 size-3 shrink-0 text-primary" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">SQL</p>
            <pre className="max-h-[150px] overflow-auto rounded-md bg-muted p-3 text-xs">
              <code>{sql}</code>
            </pre>
          </div>

          {!sql && (
            <div className="flex items-center gap-2 text-xs text-amber-600">
              <AlertCircle className="size-3.5" />
              No SQL query provided. The dashboard builder will need manual query input.
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleDeploy} className="gap-1.5">
            <Rocket className="size-3.5" />
            Deploy Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

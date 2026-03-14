"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { DemoSessionSummary } from "@/lib/demo/types";

interface CompleteStepProps {
  sessionId: string;
  catalog: string;
  schema: string;
}

export function CompleteStep({ sessionId, catalog, schema }: CompleteStepProps) {
  const [session, setSession] = useState<DemoSessionSummary | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/demo/sessions/${sessionId}`)
      .then((r) => r.json())
      .then(setSession)
      .catch(() => {});
  }, [sessionId]);

  const fqn = `${catalog}.${schema}`;

  const handleCopyFqn = () => {
    navigator.clipboard.writeText(fqn);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="space-y-6 px-1">
      <div className="flex flex-col items-center gap-3 py-6">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <h3 className="text-lg font-semibold">Demo Data Ready</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Synthetic demo data has been generated and is ready to use.
          Point any Forge feature at this catalog to run the demo.
        </p>
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <code className="text-sm font-mono">{fqn}</code>
          </div>
          <Button variant="ghost" size="sm" onClick={handleCopyFqn}>
            <Copy className="h-3.5 w-3.5" />
          </Button>
        </div>

        {session && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Tables</p>
              <p className="text-lg font-semibold">{session.tablesCreated}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Rows</p>
              <p className="text-lg font-semibold">{session.totalRows.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="text-lg font-semibold">{Math.round(session.durationMs / 1000)}s</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Next Steps</p>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc ml-4">
          <li>Run the <strong>Discovery Pipeline</strong> against <code>{fqn}</code></li>
          <li>Use <strong>Genie Studio</strong> to create Genie Spaces from the demo data</li>
          <li>Create <strong>AI/BI Dashboards</strong> for executive-ready visualisations</li>
          <li>Use <strong>Ask Forge</strong> to explore the generated data</li>
        </ul>
      </div>
    </div>
  );
}

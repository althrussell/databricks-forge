"use client";

import { Badge } from "@/components/ui/badge";
import type { ResearchEngineResult } from "@/lib/demo/research-engine/types";

interface SchemaReviewStepProps {
  research: ResearchEngineResult;
}

export function SchemaReviewStep({ research }: SchemaReviewStepProps) {
  return (
    <div className="space-y-6 px-1">
      <div className="space-y-2">
        <p className="text-sm font-medium">Data Assets to Generate</p>
        <p className="text-xs text-muted-foreground">
          These data assets were selected based on the research. Tables will be designed from these assets.
        </p>
        <div className="flex flex-wrap gap-2">
          {research.matchedDataAssetIds.map((id) => (
            <Badge key={id} variant="outline">{id}</Badge>
          ))}
        </div>
      </div>

      {research.dataNarratives.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Data Narratives</p>
          <p className="text-xs text-muted-foreground">
            These stories will be embedded as patterns in the generated data.
          </p>
          <div className="space-y-2">
            {research.dataNarratives.map((n, i) => (
              <div key={i} className="rounded-md border p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{n.title}</p>
                  <Badge variant="secondary">{n.pattern}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{n.description}</p>
                <div className="flex gap-1">
                  {n.affectedTables.map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {research.nomenclature && Object.keys(research.nomenclature).length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Nomenclature</p>
          <p className="text-xs text-muted-foreground">
            Company-specific terms that will be used in table and column names.
          </p>
          <div className="rounded-md bg-muted p-3">
            <div className="grid grid-cols-2 gap-1 text-xs">
              {Object.entries(research.nomenclature).map(([k, v]) => (
                <div key={k}>
                  <span className="text-muted-foreground">{k}:</span>{" "}
                  <span className="font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {research.demoNarrative?.killerMoments && research.demoNarrative.killerMoments.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Demo Highlights</p>
          <div className="space-y-2">
            {research.demoNarrative.killerMoments.slice(0, 3).map((m, i) => (
              <div key={i} className="rounded-md border-l-2 border-primary pl-3 py-1">
                <p className="text-sm font-medium">{m.title}</p>
                <p className="text-xs text-muted-foreground">{m.scenario}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

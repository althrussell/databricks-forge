"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { X, Loader2, Network } from "lucide-react";
import type { ERDGraph } from "@/lib/domain/types";

interface ErdModalProps {
  tableFqns: string[];
  onClose: () => void;
}

export function ErdModal({ tableFqns, onClose }: ErdModalProps) {
  const [graph, setGraph] = React.useState<ERDGraph | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [ERDViewer, setERDViewer] = React.useState<React.ComponentType<{ graph: ERDGraph }> | null>(null);

  React.useEffect(() => {
    import("@/components/environment/erd-viewer")
      .then((m) => setERDViewer(() => m.ERDViewer));
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function fetchERD() {
      try {
        const resp = await fetch("/api/environment/aggregate/erd?format=json&includeLineage=true");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const fullGraph: ERDGraph = await resp.json();

        // Build set with 1-hop neighbors
        const relevantFqns = new Set(tableFqns);
        for (const edge of fullGraph.edges) {
          if (relevantFqns.has(edge.source) || relevantFqns.has(edge.target)) {
            relevantFqns.add(edge.source);
            relevantFqns.add(edge.target);
          }
        }

        const filteredEdges = fullGraph.edges.filter(
          (e) => relevantFqns.has(e.source) && relevantFqns.has(e.target),
        );

        const filteredGraph: ERDGraph = {
          nodes: fullGraph.nodes.filter((n) => relevantFqns.has(n.tableFqn)),
          edges: filteredEdges,
          domains: [...new Set(
            fullGraph.nodes
              .filter((n) => relevantFqns.has(n.tableFqn) && n.domain)
              .map((n) => n.domain!),
          )],
          stats: {
            fkCount: filteredEdges.filter((e) => e.edgeType === "fk").length,
            implicitCount: filteredEdges.filter((e) => e.edgeType === "implicit").length,
            lineageCount: filteredEdges.filter((e) => e.edgeType === "lineage").length,
          },
        };

        if (!cancelled) {
          setGraph(filteredGraph);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load ERD");
          setLoading(false);
        }
      }
    }

    fetchERD();
    return () => { cancelled = true; };
  }, [tableFqns]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Network className="size-5 text-primary" />
          <h2 className="text-base font-semibold">
            Entity Relationship Diagram
          </h2>
          <span className="text-sm text-muted-foreground">
            {graph ? `${graph.nodes.length} tables, ${graph.edges.length} relationships` : ""}
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden">
        {loading && (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>Loading ERD...</span>
          </div>
        )}

        {error && (
          <div className="flex h-full items-center justify-center text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && graph && graph.nodes.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No relationship data available for the referenced tables.
          </div>
        )}

        {!loading && !error && graph && graph.nodes.length > 0 && ERDViewer && (
          <ERDViewer graph={graph} />
        )}

        {!loading && !error && graph && graph.nodes.length > 0 && !ERDViewer && (
          <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span>Loading viewer...</span>
          </div>
        )}
      </div>
    </div>
  );
}

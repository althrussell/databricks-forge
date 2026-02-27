"use client";

/**
 * Universal Cmd+K search bar using CommandDialog.
 *
 * Opens a command palette overlay with debounced semantic search
 * across all embedded entities. Results are grouped by kind with
 * relevance scores and click-through navigation.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Table2,
  Lightbulb,
  Sparkles,
  ShieldAlert,
  FileText,
  ArrowRight,
  Database,
  GitBranch,
  Heart,
  BarChart3,
  MessageSquare,
} from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResult {
  id: string;
  kind: string;
  sourceId: string;
  runId: string | null;
  scanId: string | null;
  content: string;
  metadata: Record<string, unknown> | null;
  score: number;
}

type Scope = "all" | "estate" | "usecases" | "genie" | "insights" | "documents";

const SCOPE_LABELS: Record<Scope, string> = {
  all: "All",
  estate: "Tables",
  usecases: "Use Cases",
  genie: "Genie",
  insights: "Insights",
  documents: "Documents",
};

const KIND_ICON: Record<string, React.ReactNode> = {
  table_detail: <Table2 className="size-4 text-blue-500" />,
  column_profile: <Database className="size-4 text-indigo-500" />,
  use_case: <Lightbulb className="size-4 text-amber-500" />,
  business_context: <BarChart3 className="size-4 text-green-500" />,
  genie_recommendation: <Sparkles className="size-4 text-purple-500" />,
  genie_question: <MessageSquare className="size-4 text-purple-400" />,
  environment_insight: <ShieldAlert className="size-4 text-orange-500" />,
  table_health: <Heart className="size-4 text-red-500" />,
  data_product: <Database className="size-4 text-teal-500" />,
  outcome_map: <FileText className="size-4 text-cyan-500" />,
  lineage_context: <GitBranch className="size-4 text-gray-500" />,
  document_chunk: <FileText className="size-4 text-gray-400" />,
};

const KIND_LABEL: Record<string, string> = {
  table_detail: "Table",
  column_profile: "Columns",
  use_case: "Use Case",
  business_context: "Business Context",
  genie_recommendation: "Genie Space",
  genie_question: "Genie Question",
  environment_insight: "Insight",
  table_health: "Health",
  data_product: "Data Product",
  outcome_map: "Outcome Map",
  lineage_context: "Lineage",
  document_chunk: "Document",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchBar() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<Scope>("all");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [searched, setSearched] = React.useState(false);
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  // Check if embedding feature is enabled
  React.useEffect(() => {
    fetch("/api/embeddings/status")
      .then((r) => r.json())
      .then((data) => setEnabled(data.enabled ?? false))
      .catch(() => setEnabled(false));
  }, []);

  // Cmd+K / Ctrl+K to open (only when embeddings enabled)
  React.useEffect(() => {
    if (enabled === false) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled]);

  if (enabled === false || enabled === null) return null;

  // Debounced search
  React.useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim() || query.trim().length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query.trim(),
          scope,
          topK: "15",
          minScore: "0.3",
        });
        const resp = await fetch(`/api/search?${params}`);
        if (resp.ok) {
          const data = await resp.json();
          setResults(data.results ?? []);
        } else {
          setResults([]);
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, scope]);

  // Reset on close
  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setQuery("");
      setResults([]);
      setSearched(false);
    }
  };

  // Navigate to result source
  const handleSelect = (result: SearchResult) => {
    setOpen(false);
    if (result.kind === "table_detail" || result.kind === "column_profile" || result.kind === "table_health") {
      router.push(`/environment`);
    } else if (result.kind === "use_case" && result.runId) {
      router.push(`/runs/${result.runId}`);
    } else if ((result.kind === "genie_recommendation" || result.kind === "genie_question") && result.runId) {
      router.push(`/runs/${result.runId}?tab=genie`);
    } else if (result.kind === "environment_insight" || result.kind === "data_product" || result.kind === "lineage_context") {
      router.push(`/environment`);
    } else if (result.kind === "document_chunk") {
      router.push(`/knowledge-base`);
    } else {
      router.push(`/environment`);
    }
  };

  // Group results by kind
  const grouped = React.useMemo(() => {
    const groups = new Map<string, SearchResult[]>();
    for (const r of results) {
      const arr = groups.get(r.kind) ?? [];
      arr.push(r);
      groups.set(r.kind, arr);
    }
    return groups;
  }, [results]);

  const firstLine = (text: string) => {
    const line = text.split("\n")[0] || text;
    return line.length > 120 ? line.slice(0, 120) + "…" : line;
  };

  const scoreColor = (score: number) => {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-amber-600";
    return "text-muted-foreground";
  };

  return (
    <>
      {/* Trigger button in header */}
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors"
      >
        <Search className="size-3.5" />
        <span>Search…</span>
        <kbd className="ml-4 inline-flex h-5 items-center rounded border bg-background px-1.5 text-[10px] font-mono font-medium text-muted-foreground">
          ⌘K
        </kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Search"
        description="Semantic search across tables, use cases, insights, and documents"
      >
        <CommandInput
          placeholder="Search across your entire data estate…"
          value={query}
          onValueChange={setQuery}
        />

        {/* Scope tabs */}
        <div className="flex items-center gap-1 border-b px-3 py-1.5">
          {(Object.keys(SCOPE_LABELS) as Scope[]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors ${
                scope === s
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>

        <CommandList className="max-h-[400px]">
          {loading && (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <div className="animate-spin mr-2 size-4 border-2 border-primary border-t-transparent rounded-full" />
              Searching…
            </div>
          )}

          {!loading && searched && results.length === 0 && (
            <CommandEmpty>
              No results found for &ldquo;{query}&rdquo;
            </CommandEmpty>
          )}

          {!loading && Array.from(grouped.entries()).map(([kind, items], idx) => (
            <React.Fragment key={kind}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={KIND_LABEL[kind] || kind}>
                {items.map((r) => (
                  <CommandItem
                    key={r.id}
                    value={r.content}
                    onSelect={() => handleSelect(r)}
                    className="flex items-start gap-2 py-2"
                  >
                    <span className="mt-0.5 shrink-0">
                      {KIND_ICON[r.kind] || <Search className="size-4" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{firstLine(r.content)}</p>
                      {r.metadata && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {[r.metadata.catalog, r.metadata.domain, r.metadata.tier]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[10px] font-mono ${scoreColor(r.score)}`}>
                        {(r.score * 100).toFixed(0)}%
                      </span>
                      <ArrowRight className="size-3 text-muted-foreground" />
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </React.Fragment>
          ))}

          {!loading && !searched && !query && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 size-8 opacity-30" />
              <p>Search tables, use cases, insights, and more</p>
              <p className="mt-1 text-xs">Results are ranked by semantic similarity</p>
            </div>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}

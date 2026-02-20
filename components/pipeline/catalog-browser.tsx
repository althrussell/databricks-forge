"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Layers,
  TableProperties,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Search,
  Zap,
  ShieldAlert,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TableNode {
  name: string;
  fqn: string;
  comment: string | null;
  tableType: string;
}

interface SchemaNode {
  name: string;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  tables: TableNode[];
  /** Timestamp of last successful fetch, null if never fetched. */
  fetchedAt: number | null;
}

interface CatalogNode {
  name: string;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  schemas: SchemaNode[];
  /** Timestamp of last successful fetch, null if never fetched. */
  fetchedAt: number | null;
}

interface CatalogBrowserProps {
  selectedSources: string[];
  onSelectionChange: (sources: string[]) => void;
  /** "table" = select catalogs/schemas/tables (default). "schema" = single schema selection only. */
  selectionMode?: "table" | "schema";
  /** Pre-expand a specific catalog.schema path on mount. */
  defaultExpandPath?: string;
}

/** How long cached children remain fresh before refetch on expand (ms). */
const STALE_THRESHOLD_MS = 60_000;

type BrowserPhase =
  | "warming-up"
  | "loading"
  | "ready"
  | "error";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CatalogBrowser({
  selectedSources,
  onSelectionChange,
  selectionMode = "table",
  defaultExpandPath,
}: CatalogBrowserProps) {
  const [catalogs, setCatalogs] = useState<CatalogNode[]>([]);
  const [phase, setPhase] = useState<BrowserPhase>("warming-up");
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [warmupElapsed, setWarmupElapsed] = useState(0);
  const warmupStartRef = useRef<number>(Date.now());

  // ── Warehouse warmup ────────────────────────────────────────────────────
  const warmupWarehouse = useCallback(async () => {
    setPhase("warming-up");
    setError(null);
    setErrorCode(null);
    setWarmupElapsed(0);
    warmupStartRef.current = Date.now();

    // Poll elapsed time so the UI updates every second
    const timer = setInterval(() => {
      setWarmupElapsed(Math.floor((Date.now() - warmupStartRef.current) / 1000));
    }, 1_000);

    try {
      const res = await fetch("/api/metadata?type=warmup");
      clearInterval(timer);

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // Warehouse not ready -- show how long it took and the error
        if (data.error) {
          setError(data.error);
          setErrorCode("WAREHOUSE_UNAVAILABLE");
          setPhase("error");
          return false;
        }
      }

      return true;
    } catch (err) {
      clearInterval(timer);
      setError(
        err instanceof Error ? err.message : "Failed to connect to SQL Warehouse"
      );
      setErrorCode("WAREHOUSE_UNAVAILABLE");
      setPhase("error");
      return false;
    }
  }, []);

  // ── Fetch catalogs ─────────────────────────────────────────────────────
  const fetchCatalogs = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch("/api/metadata?type=catalogs");
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to fetch catalogs");
        setErrorCode(data.errorCode ?? "WAREHOUSE_UNAVAILABLE");
        setPhase("error");
        return;
      }

      const names: string[] = data.catalogs ?? [];
      setCatalogs(
        names.map((name) => ({
          name,
          expanded: false,
          loading: false,
          error: null,
          schemas: [],
          fetchedAt: null,
        }))
      );
      setPhase("ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalogs");
      setErrorCode("WAREHOUSE_UNAVAILABLE");
      setPhase("error");
    }
  }, []);

  // ── Initial mount: warmup then fetch ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const ready = await warmupWarehouse();
      if (cancelled) return;
      if (ready) {
        await fetchCatalogs();
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [warmupWarehouse, fetchCatalogs]);

  // ── Auto-expand default path when ready ─────────────────────────────────
  const defaultExpandedRef = useRef(false);
  useEffect(() => {
    if (phase !== "ready" || !defaultExpandPath || defaultExpandedRef.current) return;
    const parts = defaultExpandPath.split(".");
    if (parts.length >= 1) {
      defaultExpandedRef.current = true;
      toggleCatalog(parts[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, defaultExpandPath]);

  // ── Full retry (warmup + fetch) ────────────────────────────────────────
  const fullRetry = useCallback(async () => {
    const ready = await warmupWarehouse();
    if (ready) {
      await fetchCatalogs();
    }
  }, [warmupWarehouse, fetchCatalogs]);

  // ── Refresh catalogs only (no warmup) ──────────────────────────────────
  const refreshCatalogs = useCallback(async () => {
    await fetchCatalogs();
  }, [fetchCatalogs]);

  // ── Force-refresh a catalog's schemas ──────────────────────────────────
  const refreshCatalogSchemas = useCallback(
    async (catalogName: string) => {
      setCatalogs((prev) =>
        prev.map((c) =>
          c.name === catalogName
            ? { ...c, loading: true, error: null, schemas: [], fetchedAt: null }
            : c
        )
      );

      try {
        const res = await fetch(
          `/api/metadata?type=schemas&catalog=${encodeURIComponent(catalogName)}`
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? "Failed to fetch schemas");
        }
        const data = await res.json();
        const schemaNames: string[] = data.schemas ?? [];
        setCatalogs((prev) =>
          prev.map((c) =>
            c.name === catalogName
              ? {
                  ...c,
                  loading: false,
                  fetchedAt: Date.now(),
                  schemas: schemaNames.map((s) => ({
                    name: s,
                    expanded: false,
                    loading: false,
                    error: null,
                    tables: [],
                    fetchedAt: null,
                  })),
                }
              : c
          )
        );
      } catch (err) {
        setCatalogs((prev) =>
          prev.map((c) =>
            c.name === catalogName
              ? {
                  ...c,
                  loading: false,
                  error:
                    err instanceof Error ? err.message : "Failed to load schemas",
                }
              : c
          )
        );
      }
    },
    []
  );

  // ── Expand / collapse a catalog ────────────────────────────────────────
  const toggleCatalog = async (catalogName: string) => {
    const cat = catalogs.find((c) => c.name === catalogName);
    if (!cat) return;

    const isStale =
      !cat.fetchedAt || Date.now() - cat.fetchedAt > STALE_THRESHOLD_MS;
    const hasFreshData = cat.schemas.length > 0 && !isStale;

    if (hasFreshData) {
      // Toggle expand/collapse without refetch
      setCatalogs((prev) =>
        prev.map((c) =>
          c.name === catalogName ? { ...c, expanded: !c.expanded } : c
        )
      );
      return;
    }

    // Need to fetch schemas
    setCatalogs((prev) =>
      prev.map((c) =>
        c.name === catalogName
          ? { ...c, expanded: true, loading: true, error: null }
          : c
      )
    );

    try {
      const res = await fetch(
        `/api/metadata?type=schemas&catalog=${encodeURIComponent(catalogName)}`
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Failed to fetch schemas");
      }
      const data = await res.json();
      const schemaNames: string[] = data.schemas ?? [];
      setCatalogs((prev) =>
        prev.map((c) =>
          c.name === catalogName
            ? {
                ...c,
                loading: false,
                fetchedAt: Date.now(),
                schemas: schemaNames.map((s) => ({
                  name: s,
                  expanded: false,
                  loading: false,
                  error: null,
                  tables: [],
                  fetchedAt: null,
                })),
              }
            : c
        )
      );
    } catch (err) {
      setCatalogs((prev) =>
        prev.map((c) =>
          c.name === catalogName
            ? {
                ...c,
                loading: false,
                error:
                  err instanceof Error ? err.message : "Failed to load schemas",
              }
            : c
        )
      );
    }
  };

  // ── Force-refresh a schema's tables ────────────────────────────────────
  const refreshSchemaTables = useCallback(
    async (catalogName: string, schemaName: string) => {
      const updateSchema = (updater: (s: SchemaNode) => SchemaNode) => {
        setCatalogs((prev) =>
          prev.map((c) =>
            c.name === catalogName
              ? {
                  ...c,
                  schemas: c.schemas.map((s) =>
                    s.name === schemaName ? updater(s) : s
                  ),
                }
              : c
          )
        );
      };

      updateSchema((s) => ({
        ...s,
        loading: true,
        error: null,
        tables: [],
        fetchedAt: null,
      }));

      try {
        const res = await fetch(
          `/api/metadata?type=tables&catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}`
        );
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? "Failed to fetch tables");
        }
        const data = await res.json();
        const tables: TableNode[] = (data.tables ?? []).map(
          (t: {
            tableName: string;
            fqn: string;
            comment: string | null;
            tableType: string;
          }) => ({
            name: t.tableName,
            fqn: t.fqn,
            comment: t.comment,
            tableType: t.tableType,
          })
        );
        updateSchema((s) => ({
          ...s,
          loading: false,
          fetchedAt: Date.now(),
          tables,
        }));
      } catch (err) {
        updateSchema((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : "Failed to load tables",
        }));
      }
    },
    []
  );

  // ── Expand / collapse a schema (fetch tables) ─────────────────────────
  const toggleSchema = async (catalogName: string, schemaName: string) => {
    const updateSchema = (updater: (s: SchemaNode) => SchemaNode) => {
      setCatalogs((prev) =>
        prev.map((c) =>
          c.name === catalogName
            ? {
                ...c,
                schemas: c.schemas.map((s) =>
                  s.name === schemaName ? updater(s) : s
                ),
              }
            : c
        )
      );
    };

    const cat = catalogs.find((c) => c.name === catalogName);
    const sch = cat?.schemas.find((s) => s.name === schemaName);
    if (!sch) return;

    const isStale =
      !sch.fetchedAt || Date.now() - sch.fetchedAt > STALE_THRESHOLD_MS;
    const hasFreshData = sch.tables.length > 0 && !isStale;

    if (hasFreshData) {
      updateSchema((s) => ({ ...s, expanded: !s.expanded }));
      return;
    }

    updateSchema((s) => ({ ...s, expanded: true, loading: true, error: null }));

    try {
      const res = await fetch(
        `/api/metadata?type=tables&catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}`
      );
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error ?? "Failed to fetch tables");
      }
      const data = await res.json();
      const tables: TableNode[] = (data.tables ?? []).map(
        (t: {
          tableName: string;
          fqn: string;
          comment: string | null;
          tableType: string;
        }) => ({
          name: t.tableName,
          fqn: t.fqn,
          comment: t.comment,
          tableType: t.tableType,
        })
      );
      updateSchema((s) => ({
        ...s,
        loading: false,
        fetchedAt: Date.now(),
        tables,
      }));
    } catch (err) {
      updateSchema((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load tables",
      }));
    }
  };

  // ── Search filter ───────────────────────────────────────────────────────
  const searchLower = search.toLowerCase();

  const filteredCatalogs = useMemo(() => {
    if (!searchLower) return catalogs;
    return catalogs.filter((c) => {
      if (c.name.toLowerCase().includes(searchLower)) return true;
      if (
        c.schemas.some((s) => {
          if (s.name.toLowerCase().includes(searchLower)) return true;
          if (s.tables.some((t) => t.name.toLowerCase().includes(searchLower)))
            return true;
          return false;
        })
      )
        return true;
      return false;
    });
  }, [catalogs, searchLower]);

  // ── Selection helpers ──────────────────────────────────────────────────
  const isSelected = (source: string) => selectedSources.includes(source);

  const addSource = (source: string) => {
    if (!isSelected(source)) {
      onSelectionChange([...selectedSources, source]);
    }
  };

  const removeSource = (source: string) => {
    onSelectionChange(selectedSources.filter((s) => s !== source));
  };

  const isCoveredBy = (path: string) => {
    const parts = path.split(".");
    if (parts.length === 3) {
      return isSelected(parts[0]) || isSelected(`${parts[0]}.${parts[1]}`);
    }
    if (parts.length === 2) {
      return isSelected(parts[0]);
    }
    return false;
  };

  // ── Render ─────────────────────────────────────────────────────────────

  // Phase: warming up
  if (phase === "warming-up") {
    return (
      <div className="space-y-3 rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Zap className="h-4 w-4 animate-pulse text-amber-500" />
          <span className="font-medium">Starting SQL Warehouse...</span>
        </div>
        {warmupElapsed >= 3 && (
          <p className="text-xs text-muted-foreground">
            The warehouse is waking up. This can take up to a few minutes on first use.
            <span className="ml-1 tabular-nums text-muted-foreground/70">
              ({warmupElapsed}s)
            </span>
          </p>
        )}
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    );
  }

  // Phase: loading catalogs (warehouse ready)
  if (phase === "loading") {
    return (
      <div className="space-y-2 rounded-md border p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          Loading catalogs...
        </div>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }

  // Phase: error
  if (phase === "error") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
        {errorCode === "INSUFFICIENT_PERMISSIONS" ? (
          <ShieldAlert className="h-5 w-5 text-destructive" />
        ) : (
          <AlertCircle className="h-5 w-5 text-destructive" />
        )}
        <p className="text-sm text-destructive">
          {errorCode === "WAREHOUSE_UNAVAILABLE"
            ? "SQL Warehouse is not responding. It may still be starting up."
            : errorCode === "INSUFFICIENT_PERMISSIONS"
              ? "You don't have permission to view catalogs. Contact your workspace admin."
              : error ?? "Failed to load catalogs"}
        </p>
        {error && errorCode !== "INSUFFICIENT_PERMISSIONS" && (
          <p className="max-w-md text-xs text-muted-foreground">{error}</p>
        )}
        <Button variant="outline" size="sm" onClick={fullRetry}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  // Phase: ready but no catalogs
  if (catalogs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-6 text-center">
        <Database className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No catalogs found in this workspace.
        </p>
        <p className="max-w-sm text-xs text-muted-foreground/70">
          This may happen if the warehouse just started. Try refreshing, or check
          that your SQL Warehouse has access to Unity Catalog.
        </p>
        <Button variant="outline" size="sm" onClick={refreshCatalogs}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tree browser */}
      <div className="rounded-md border">
        {/* Header */}
        <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search catalogs, schemas, and tables..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 pl-7 text-xs"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 text-xs"
            onClick={refreshCatalogs}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        {/* Tree */}
        <div className="h-[300px] overflow-y-auto">
          <div className="p-1">
            {filteredCatalogs.length === 0 && search ? (
              <div className="flex flex-col items-center gap-1 py-8 text-center text-xs text-muted-foreground">
                <Search className="h-4 w-4" />
                No results match &ldquo;{search}&rdquo;
              </div>
            ) : (
              filteredCatalogs.map((catalog) => (
                <CatalogRow
                  key={catalog.name}
                  catalog={catalog}
                  onToggleCatalog={() => toggleCatalog(catalog.name)}
                  onToggleSchema={(schema) =>
                    toggleSchema(catalog.name, schema)
                  }
                  onRefreshCatalog={() => refreshCatalogSchemas(catalog.name)}
                  onRefreshSchema={(schema) =>
                    refreshSchemaTables(catalog.name, schema)
                  }
                  isSelected={isSelected}
                  isCoveredBy={isCoveredBy}
                  onAdd={addSource}
                  onRemove={removeSource}
                  searchFilter={searchLower}
                  selectionMode={selectionMode}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Selected sources pills (hidden in schema mode -- parent manages display) */}
      {selectionMode === "table" && selectedSources.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">
            Selected sources ({selectedSources.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {selectedSources.map((source) => {
              const depth = source.split(".").length;
              const Icon =
                depth === 1
                  ? Database
                  : depth === 2
                    ? Layers
                    : TableProperties;
              return (
                <Badge key={source} variant="secondary" className="gap-1 pr-1">
                  <Icon className="h-3 w-3 text-muted-foreground" />
                  {source}
                  <button
                    type="button"
                    onClick={() => removeSource(source)}
                    className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalog row (expand/collapse + schema + table children)
// ---------------------------------------------------------------------------

function CatalogRow({
  catalog,
  onToggleCatalog,
  onToggleSchema,
  onRefreshCatalog,
  onRefreshSchema,
  isSelected,
  isCoveredBy,
  onAdd,
  onRemove,
  searchFilter,
  selectionMode = "table",
}: {
  catalog: CatalogNode;
  onToggleCatalog: () => void;
  onToggleSchema: (schema: string) => void;
  onRefreshCatalog: () => void;
  onRefreshSchema: (schema: string) => void;
  isSelected: (source: string) => boolean;
  isCoveredBy: (path: string) => boolean;
  onAdd: (source: string) => void;
  onRemove: (source: string) => void;
  searchFilter?: string;
  selectionMode?: "table" | "schema";
}) {
  const catalogSelected = isSelected(catalog.name);
  const hasSearch = !!searchFilter;
  const catalogNameMatches =
    hasSearch && catalog.name.toLowerCase().includes(searchFilter);

  // Filter schemas when searching
  const filteredSchemas = useMemo(() => {
    if (!hasSearch || catalogNameMatches) return catalog.schemas;
    return catalog.schemas.filter((s) => {
      if (s.name.toLowerCase().includes(searchFilter)) return true;
      if (s.tables.some((t) => t.name.toLowerCase().includes(searchFilter)))
        return true;
      return false;
    });
  }, [catalog.schemas, hasSearch, catalogNameMatches, searchFilter]);

  const showExpanded =
    catalog.expanded ||
    (hasSearch && filteredSchemas.length > 0 && catalog.schemas.length > 0);

  return (
    <div>
      {/* Catalog level */}
      <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted/50">
        <button
          type="button"
          onClick={onToggleCatalog}
          className="flex shrink-0 items-center gap-1"
        >
          {showExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Database className="h-4 w-4 text-orange-500" />
        </button>

        <button
          type="button"
          onClick={onToggleCatalog}
          className="flex-1 text-left text-sm font-medium"
        >
          <HighlightMatch text={catalog.name} query={searchFilter} />
        </button>

        {/* Per-catalog refresh */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-60 hover:!opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            onRefreshCatalog();
          }}
          title="Refresh schemas"
        >
          <RefreshCw className="h-3 w-3" />
        </Button>

        {selectionMode === "table" && (
          catalogSelected ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs text-green-600"
              onClick={() => onRemove(catalog.name)}
            >
              <Check className="h-3 w-3" />
              Added
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs opacity-0 group-hover:opacity-100"
              onClick={() => onAdd(catalog.name)}
            >
              <Plus className="h-3 w-3" />
              Add all
            </Button>
          )
        )}
      </div>

      {/* Schemas */}
      {showExpanded && (
        <div className="ml-5 border-l pl-2">
          {catalog.loading && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Loading schemas...
            </div>
          )}

          {catalog.error && (
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {catalog.error}
              <button
                type="button"
                onClick={onRefreshCatalog}
                className="ml-1 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {!catalog.loading &&
            !catalog.error &&
            catalog.schemas.length === 0 && (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                No schemas found
                <button
                  type="button"
                  onClick={onRefreshCatalog}
                  className="underline hover:no-underline"
                >
                  Retry
                </button>
              </div>
            )}

          {filteredSchemas.map((schema) => (
            <SchemaRow
              key={schema.name}
              schema={schema}
              catalogName={catalog.name}
              onToggle={() => onToggleSchema(schema.name)}
              onRefresh={() => onRefreshSchema(schema.name)}
              isSelected={isSelected}
              isCoveredBy={isCoveredBy}
              onAdd={onAdd}
              onRemove={onRemove}
              searchFilter={searchFilter}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema row (expand/collapse + table children)
// ---------------------------------------------------------------------------

function SchemaRow({
  schema,
  catalogName,
  onToggle,
  onRefresh,
  isSelected,
  isCoveredBy,
  onAdd,
  onRemove,
  searchFilter,
  selectionMode = "table",
}: {
  schema: SchemaNode;
  catalogName: string;
  onToggle: () => void;
  onRefresh: () => void;
  isSelected: (source: string) => boolean;
  isCoveredBy: (path: string) => boolean;
  onAdd: (source: string) => void;
  onRemove: (source: string) => void;
  searchFilter?: string;
  selectionMode?: "table" | "schema";
}) {
  const schemaPath = `${catalogName}.${schema.name}`;
  const schemaSelected = isSelected(schemaPath);
  const covered = isCoveredBy(schemaPath);

  // Derive table list -- if the catalog or schema name already matches the
  // search, show ALL tables (don't filter children by the parent's match).
  const hasSearch = !!searchFilter;
  const catalogNameMatches =
    hasSearch && catalogName.toLowerCase().includes(searchFilter ?? "");
  const schemaNameMatches =
    hasSearch && schema.name.toLowerCase().includes(searchFilter ?? "");
  const tablesToShow =
    !hasSearch || catalogNameMatches || schemaNameMatches
      ? schema.tables
      : schema.tables.filter((t) =>
          t.name.toLowerCase().includes(searchFilter ?? "")
        );

  // Show expanded section when schema is expanded OR tables were loaded
  const isOpen = schema.expanded || schema.tables.length > 0;

  const isSchemaMode = selectionMode === "schema";

  const handleSchemaClick = () => {
    if (isSchemaMode) {
      // Single-select: replace selection with this schema
      if (schemaSelected) {
        onRemove(schemaPath);
      } else {
        onAdd(schemaPath);
      }
    } else {
      onToggle();
    }
  };

  return (
    <div>
      {/* Schema level */}
      <div className={`group/schema flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/50 ${isSchemaMode && schemaSelected ? "bg-violet-50 dark:bg-violet-950/30" : ""}`}>
        <button
          type="button"
          onClick={handleSchemaClick}
          className="flex shrink-0 items-center gap-1"
        >
          {isSchemaMode ? (
            schemaSelected ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Layers className="h-3.5 w-3.5 text-blue-500" />
            )
          ) : isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          {!isSchemaMode && <Layers className="h-3.5 w-3.5 text-blue-500" />}
        </button>

        <button
          type="button"
          onClick={handleSchemaClick}
          className={`flex-1 text-left text-sm ${covered && !schemaSelected ? "text-muted-foreground" : ""} ${isSchemaMode && schemaSelected ? "font-medium text-violet-700 dark:text-violet-400" : ""}`}
        >
          <HighlightMatch text={schema.name} query={searchFilter} />
          {!isSchemaMode && schema.tables.length > 0 && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/60">
              ({schema.tables.length})
            </span>
          )}
          {!isSchemaMode && covered && !schemaSelected && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/60">
              (included via catalog)
            </span>
          )}
        </button>

        {/* Per-schema refresh -- only in table mode */}
        {!isSchemaMode && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 w-5 shrink-0 p-0 opacity-0 group-hover/schema:opacity-60 hover:!opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            title="Refresh tables"
          >
            <RefreshCw className="h-2.5 w-2.5" />
          </Button>
        )}

        {isSchemaMode ? (
          schemaSelected ? (
            <Badge variant="outline" className="text-[9px] text-green-600 border-green-200">
              Selected
            </Badge>
          ) : null
        ) : schemaSelected ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1.5 text-[11px] text-green-600"
            onClick={() => onRemove(schemaPath)}
          >
            <Check className="h-2.5 w-2.5" />
            Added
          </Button>
        ) : covered ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1.5 text-[11px] opacity-0 group-hover/schema:opacity-100"
            onClick={() => onAdd(schemaPath)}
          >
            <Plus className="h-2.5 w-2.5" />
            Add
          </Button>
        )}
      </div>

      {/* Tables section -- hidden in schema mode, shown when schema is open in table mode */}
      {!isSchemaMode && isOpen && (
        <div className="ml-5 border-l pl-2">
          {schema.loading && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Loading tables...
            </div>
          )}

          {schema.error && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-destructive">
              <AlertCircle className="h-3 w-3" />
              {schema.error}
              <button
                type="button"
                onClick={onRefresh}
                className="ml-1 underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {!schema.loading && !schema.error && schema.tables.length === 0 && (
            <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
              No tables found
              <button
                type="button"
                onClick={onRefresh}
                className="underline hover:no-underline"
              >
                Retry
              </button>
            </div>
          )}

          {tablesToShow.map((table, idx) => {
            const tablePath = `${catalogName}.${schema.name}.${table.name}`;
            const tableSelected = isSelected(tablePath);
            const tableCovered = isCoveredBy(tablePath);
            const displayName =
              table.name || table.fqn.split(".").pop() || `table-${idx}`;

            return (
              <div
                key={`${catalogName}.${schema.name}.${displayName}.${idx}`}
                className="group/table flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-muted/50"
              >
                <TableProperties className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span
                  className={`flex-1 truncate text-xs ${tableCovered && !tableSelected ? "text-muted-foreground" : ""}`}
                  title={table.fqn}
                >
                  {displayName}
                </span>

                {tableSelected ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 gap-0.5 px-1.5 text-[10px] text-green-600"
                    onClick={() => onRemove(tablePath)}
                  >
                    <Check className="h-2.5 w-2.5" />
                    Added
                  </Button>
                ) : tableCovered ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 gap-0.5 px-1.5 text-[10px] opacity-0 group-hover/table:opacity-100"
                    onClick={() => onAdd(tablePath)}
                  >
                    <Plus className="h-2.5 w-2.5" />
                    Add
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Highlight matching text
// ---------------------------------------------------------------------------

function HighlightMatch({
  text,
  query,
}: {
  text: string;
  query?: string;
}) {
  if (!query) return <>{text}</>;

  const idx = text.toLowerCase().indexOf(query);
  if (idx === -1) return <>{text}</>;

  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-yellow-200/60 px-0.5 dark:bg-yellow-500/30">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

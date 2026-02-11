"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
}

interface CatalogNode {
  name: string;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  schemas: SchemaNode[];
}

interface CatalogBrowserProps {
  selectedSources: string[];
  onSelectionChange: (sources: string[]) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CatalogBrowser({
  selectedSources,
  onSelectionChange,
}: CatalogBrowserProps) {
  const [catalogs, setCatalogs] = useState<CatalogNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ── Fetch catalogs ─────────────────────────────────────────────────────
  const fetchCatalogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/metadata?type=catalogs");
      if (!res.ok) throw new Error("Failed to fetch catalogs");
      const data = await res.json();
      const names: string[] = data.catalogs ?? [];
      setCatalogs(
        names.map((name) => ({
          name,
          expanded: false,
          loading: false,
          error: null,
          schemas: [],
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load catalogs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogs();
  }, [fetchCatalogs]);

  // ── Expand / collapse a catalog ────────────────────────────────────────
  const toggleCatalog = async (catalogName: string) => {
    setCatalogs((prev) =>
      prev.map((c) => {
        if (c.name !== catalogName) return c;
        if (c.schemas.length > 0) return { ...c, expanded: !c.expanded };
        return { ...c, expanded: true, loading: true, error: null };
      })
    );

    const cat = catalogs.find((c) => c.name === catalogName);
    if (cat && cat.schemas.length > 0) return;

    try {
      const res = await fetch(
        `/api/metadata?type=schemas&catalog=${encodeURIComponent(catalogName)}`
      );
      if (!res.ok) throw new Error("Failed to fetch schemas");
      const data = await res.json();
      const schemaNames: string[] = data.schemas ?? [];
      setCatalogs((prev) =>
        prev.map((c) =>
          c.name === catalogName
            ? {
                ...c,
                loading: false,
                schemas: schemaNames.map((s) => ({
                  name: s,
                  expanded: false,
                  loading: false,
                  error: null,
                  tables: [],
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

  // ── Expand / collapse a schema (fetch tables) ─────────────────────────
  const toggleSchema = async (catalogName: string, schemaName: string) => {
    const updateSchema = (
      updater: (s: SchemaNode) => SchemaNode
    ) => {
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

    if (sch && sch.tables.length > 0) {
      updateSchema((s) => ({ ...s, expanded: !s.expanded }));
      return;
    }

    updateSchema((s) => ({ ...s, expanded: true, loading: true, error: null }));

    try {
      const res = await fetch(
        `/api/metadata?type=tables&catalog=${encodeURIComponent(catalogName)}&schema=${encodeURIComponent(schemaName)}`
      );
      if (!res.ok) throw new Error("Failed to fetch tables");
      const data = await res.json();
      const tables: TableNode[] = (data.tables ?? []).map(
        (t: { tableName: string; fqn: string; comment: string | null; tableType: string }) => ({
          name: t.tableName,
          fqn: t.fqn,
          comment: t.comment,
          tableType: t.tableType,
        })
      );
      updateSchema((s) => ({ ...s, loading: false, tables }));
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

  /** Check if a parent scope already covers this path */
  const isCoveredBy = (path: string) => {
    const parts = path.split(".");
    // catalog.schema.table → check catalog and catalog.schema
    if (parts.length === 3) {
      return isSelected(parts[0]) || isSelected(`${parts[0]}.${parts[1]}`);
    }
    // catalog.schema → check catalog
    if (parts.length === 2) {
      return isSelected(parts[0]);
    }
    return false;
  };

  // ── Render ─────────────────────────────────────────────────────────────

  if (loading) {
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

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertCircle className="h-5 w-5 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchCatalogs}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Retry
        </Button>
      </div>
    );
  }

  if (catalogs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-6 text-center">
        <Database className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No catalogs found. Check your SQL Warehouse connection and permissions.
        </p>
        <Button variant="outline" size="sm" onClick={fetchCatalogs}>
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
            onClick={fetchCatalogs}
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
                  isSelected={isSelected}
                  isCoveredBy={isCoveredBy}
                  onAdd={addSource}
                  onRemove={removeSource}
                  searchFilter={searchLower}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Selected sources pills */}
      {selectedSources.length > 0 && (
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
  isSelected,
  isCoveredBy,
  onAdd,
  onRemove,
  searchFilter,
}: {
  catalog: CatalogNode;
  onToggleCatalog: () => void;
  onToggleSchema: (schema: string) => void;
  isSelected: (source: string) => boolean;
  isCoveredBy: (path: string) => boolean;
  onAdd: (source: string) => void;
  onRemove: (source: string) => void;
  searchFilter?: string;
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

        {catalogSelected ? (
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
            </div>
          )}

          {!catalog.loading &&
            !catalog.error &&
            catalog.schemas.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                No schemas found
              </div>
            )}

          {filteredSchemas.map((schema) => (
            <SchemaRow
              key={schema.name}
              schema={schema}
              catalogName={catalog.name}
              onToggle={() => onToggleSchema(schema.name)}
              isSelected={isSelected}
              isCoveredBy={isCoveredBy}
              onAdd={onAdd}
              onRemove={onRemove}
              searchFilter={searchFilter}
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
  isSelected,
  isCoveredBy,
  onAdd,
  onRemove,
  searchFilter,
}: {
  schema: SchemaNode;
  catalogName: string;
  onToggle: () => void;
  isSelected: (source: string) => boolean;
  isCoveredBy: (path: string) => boolean;
  onAdd: (source: string) => void;
  onRemove: (source: string) => void;
  searchFilter?: string;
}) {
  const schemaPath = `${catalogName}.${schema.name}`;
  const schemaSelected = isSelected(schemaPath);
  const covered = isCoveredBy(schemaPath);

  const hasSearch = !!searchFilter;
  const schemaNameMatches =
    hasSearch && schema.name.toLowerCase().includes(searchFilter);

  // Filter tables when searching
  const filteredTables = useMemo(() => {
    if (!hasSearch || schemaNameMatches) return schema.tables;
    return schema.tables.filter((t) =>
      t.name.toLowerCase().includes(searchFilter)
    );
  }, [schema.tables, hasSearch, schemaNameMatches, searchFilter]);

  const showExpanded =
    schema.expanded ||
    (hasSearch && filteredTables.length > 0 && schema.tables.length > 0);

  return (
    <div>
      {/* Schema level */}
      <div className="group/schema flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/50">
        <button
          type="button"
          onClick={onToggle}
          className="flex shrink-0 items-center gap-1"
        >
          {showExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Layers className="h-3.5 w-3.5 text-blue-500" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          className={`flex-1 text-left text-sm ${covered && !schemaSelected ? "text-muted-foreground" : ""}`}
        >
          <HighlightMatch text={schema.name} query={searchFilter} />
          {covered && !schemaSelected && (
            <span className="ml-1.5 text-[10px] text-muted-foreground/60">
              (included via catalog)
            </span>
          )}
        </button>

        {schemaSelected ? (
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

      {/* Tables */}
      {showExpanded && (
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
            </div>
          )}

          {!schema.loading && !schema.error && schema.tables.length === 0 && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              No tables found
            </div>
          )}

          {filteredTables.map((table) => {
            const tablePath = table.fqn;
            const tableSelected = isSelected(tablePath);
            const tableCovered = isCoveredBy(tablePath);

            return (
              <div
                key={table.name}
                className="group/table flex items-center gap-1 rounded-md px-2 py-0.5 hover:bg-muted/50"
              >
                <TableProperties className="h-3 w-3 shrink-0 text-emerald-500" />
                <span
                  className={`flex-1 truncate text-xs ${tableCovered && !tableSelected ? "text-muted-foreground" : ""}`}
                  title={table.comment ?? table.fqn}
                >
                  <HighlightMatch text={table.name} query={searchFilter} />
                  {table.comment && (
                    <span className="ml-1 text-[10px] text-muted-foreground/60">
                      {table.comment.length > 40
                        ? table.comment.slice(0, 40) + "..."
                        : table.comment}
                    </span>
                  )}
                </span>

                {tableSelected ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 gap-0.5 px-1 text-[10px] text-green-600"
                    onClick={() => onRemove(tablePath)}
                  >
                    <Check className="h-2.5 w-2.5" />
                  </Button>
                ) : tableCovered ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 gap-0.5 px-1 text-[10px] opacity-0 group-hover/table:opacity-100"
                    onClick={() => onAdd(tablePath)}
                  >
                    <Plus className="h-2.5 w-2.5" />
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

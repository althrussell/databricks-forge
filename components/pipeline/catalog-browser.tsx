"use client";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Database,
  Layers,
  ChevronRight,
  ChevronDown,
  Plus,
  Check,
  X,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogNode {
  name: string;
  expanded: boolean;
  loading: boolean;
  error: string | null;
  schemas: string[];
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
        // If already has schemas, just toggle
        if (c.schemas.length > 0) {
          return { ...c, expanded: !c.expanded };
        }
        // Need to fetch schemas
        return { ...c, expanded: true, loading: true, error: null };
      })
    );

    // Check if we need to fetch
    const cat = catalogs.find((c) => c.name === catalogName);
    if (cat && cat.schemas.length > 0) return; // already loaded

    try {
      const res = await fetch(
        `/api/metadata?type=schemas&catalog=${encodeURIComponent(catalogName)}`
      );
      if (!res.ok) throw new Error("Failed to fetch schemas");
      const data = await res.json();
      const schemas: string[] = data.schemas ?? [];
      setCatalogs((prev) =>
        prev.map((c) =>
          c.name === catalogName
            ? { ...c, schemas, loading: false }
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

  // Check if a catalog-level source supersedes a schema-level one
  const isCoveredByCatalog = (catalogName: string) =>
    isSelected(catalogName);

  // ── Render ─────────────────────────────────────────────────────────────

  // Top-level loading
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

  // Top-level error
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

  // Empty
  if (catalogs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-md border border-dashed p-6 text-center">
        <Database className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No catalogs found. Check your SQL Warehouse connection and
          permissions.
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
        <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            Browse Unity Catalog
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={fetchCatalogs}
          >
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        {/* Tree */}
        <div className="h-[280px] overflow-y-auto">
          <div className="p-1">
            {catalogs.map((catalog) => (
              <CatalogRow
                key={catalog.name}
                catalog={catalog}
                onToggle={() => toggleCatalog(catalog.name)}
                isSelected={isSelected}
                isCoveredByCatalog={isCoveredByCatalog(catalog.name)}
                onAddCatalog={() => addSource(catalog.name)}
                onAddSchema={(schema) =>
                  addSource(`${catalog.name}.${schema}`)
                }
                onRemove={removeSource}
              />
            ))}
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
            {selectedSources.map((source) => (
              <Badge
                key={source}
                variant="secondary"
                className="gap-1 pr-1"
              >
                <Database className="h-3 w-3 text-muted-foreground" />
                {source}
                <button
                  type="button"
                  onClick={() => removeSource(source)}
                  className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalog row (expand/collapse + schema children)
// ---------------------------------------------------------------------------

function CatalogRow({
  catalog,
  onToggle,
  isSelected,
  isCoveredByCatalog,
  onAddCatalog,
  onAddSchema,
  onRemove,
}: {
  catalog: CatalogNode;
  onToggle: () => void;
  isSelected: (source: string) => boolean;
  isCoveredByCatalog: boolean;
  onAddCatalog: () => void;
  onAddSchema: (schema: string) => void;
  onRemove: (source: string) => void;
}) {
  const catalogSelected = isSelected(catalog.name);

  return (
    <div>
      {/* Catalog level */}
      <div className="group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-muted/50">
        <button
          type="button"
          onClick={onToggle}
          className="flex shrink-0 items-center gap-1"
        >
          {catalog.expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <Database className="h-4 w-4 text-orange-500" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          className="flex-1 text-left text-sm font-medium"
        >
          {catalog.name}
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
            onClick={onAddCatalog}
          >
            <Plus className="h-3 w-3" />
            Add all
          </Button>
        )}
      </div>

      {/* Schemas */}
      {catalog.expanded && (
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

          {catalog.schemas.map((schema) => {
            const schemaPath = `${catalog.name}.${schema}`;
            const schemaSelected = isSelected(schemaPath);
            const covered = isCoveredByCatalog;

            return (
              <div
                key={schema}
                className="group/schema flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted/50"
              >
                <Layers className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                <span
                  className={`flex-1 text-sm ${covered ? "text-muted-foreground" : ""}`}
                >
                  {schema}
                  {covered && !schemaSelected && (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                      (included via catalog)
                    </span>
                  )}
                </span>

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
                    onClick={() => onAddSchema(schema)}
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

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Check, Copy, Eye, Info, Loader2, Plus, Wrench, X } from "lucide-react";
import { SpaceDiffViewer } from "./space-diff-viewer";

interface FixChange {
  section: string;
  description: string;
  added: number;
  modified: number;
}

interface OptimizationReviewProps {
  changes: FixChange[];
  strategiesRun: string[];
  currentSerializedSpace: string;
  updatedSerializedSpace: string;
  onApply: (serializedSpace: string) => void;
  onCloneAndApply: (serializedSpace: string) => void;
  onCancel: () => void;
  /** Create a brand new space from the optimized config */
  onCreateNew?: (serializedSpace: string) => void;
  applying: boolean;
  cloning: boolean;
  creating?: boolean;
  /** When true, individual changes can be toggled on/off. Default false (batch apply). */
  enableSelection?: boolean;
  /** Callback to build a merged space from selected indices. Required when enableSelection is true. */
  onBuildSelectedSpace?: (selectedIndices: number[]) => Promise<string> | string;
}

function priorityFromChange(change: FixChange): "high" | "medium" | "low" {
  if (change.section.includes("join") || change.section.includes("measure")) return "high";
  if (change.section.includes("instruction") || change.section.includes("filter")) return "medium";
  return "low";
}

function priorityColor(priority: "high" | "medium" | "low") {
  switch (priority) {
    case "high":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";
    case "medium":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
    case "low":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400";
  }
}

export function OptimizationReview({
  changes,
  strategiesRun,
  currentSerializedSpace,
  updatedSerializedSpace,
  onApply,
  onCloneAndApply,
  onCancel,
  onCreateNew,
  applying,
  cloning,
  creating = false,
  enableSelection = false,
  onBuildSelectedSpace,
}: OptimizationReviewProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set(changes.map((_, i) => i)));
  const [showDiff, setShowDiff] = useState(false);

  const isSelectable = enableSelection && !!onBuildSelectedSpace;
  const allSelected = selected.size === changes.length;

  const getEffectiveSpace = async (): Promise<string> => {
    if (!isSelectable || allSelected) return updatedSerializedSpace;
    return onBuildSelectedSpace!([...selected]);
  };

  const handleApply = async () => {
    const space = await getEffectiveSpace();
    onApply(space);
  };

  const handleCloneAndApply = async () => {
    const space = await getEffectiveSpace();
    onCloneAndApply(space);
  };

  const handleCreateNew = async () => {
    if (!onCreateNew) return;
    const space = await getEffectiveSpace();
    onCreateNew(space);
  };

  const toggleItem = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === changes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(changes.map((_, i) => i)));
    }
  };

  const hasSelection = isSelectable ? selected.size > 0 : true;

  const highCount = changes.filter((c) => priorityFromChange(c) === "high").length;
  const medCount = changes.filter((c) => priorityFromChange(c) === "medium").length;
  const lowCount = changes.filter((c) => priorityFromChange(c) === "low").length;
  const hasActualChanges = changes.length > 0 && changes.some((c) => c.added > 0 || c.modified > 0);

  if (showDiff) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Configuration Preview</h2>
          <Button variant="outline" size="sm" onClick={() => setShowDiff(false)}>
            Back to Suggestions
          </Button>
        </div>
        <SpaceDiffViewer
          currentSerializedSpace={currentSerializedSpace}
          updatedSerializedSpace={updatedSerializedSpace}
          changes={changes}
        />
        <div className="flex gap-2">
          <Button onClick={handleApply} disabled={applying || cloning || creating}>
            {applying ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Check className="mr-2 size-4" />
            )}
            Apply to Space
          </Button>
          <Button
            variant="outline"
            onClick={handleCloneAndApply}
            disabled={applying || cloning || creating}
          >
            {cloning ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Copy className="mr-2 size-4" />
            )}
            Clone and Apply
          </Button>
          {onCreateNew && (
            <Button
              variant="outline"
              onClick={handleCreateNew}
              disabled={applying || cloning || creating}
            >
              {creating ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Create New Space
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel}>
            <X className="mr-2 size-4" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (changes.length === 0 || !hasActualChanges) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-5 text-muted-foreground" />
              No Changes Generated
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The fix strategies ran but could not produce any improvements.
              {strategiesRun.length > 0 && (
                <>
                  {" "}
                  Strategies attempted: {strategiesRun.map((s) => s.replace(/_/g, " ")).join(", ")}.
                </>
              )}
            </p>
            <p className="text-sm text-muted-foreground">
              This can happen when the existing configuration already has the required content, or
              when the space&apos;s tables lack sufficient metadata for enrichment. Try running
              benchmarks to identify specific gaps, or manually add descriptions and instructions.
            </p>
          </CardContent>
        </Card>
        <Button variant="ghost" onClick={onCancel}>
          <X className="mr-2 size-4" />
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Strategy summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="size-5" />
            Optimization Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {changes.length} suggestion{changes.length !== 1 ? "s" : ""} generated from{" "}
            {strategiesRun.length} strateg{strategiesRun.length !== 1 ? "ies" : "y"}:{" "}
            {strategiesRun.map((s) => s.replace(/_/g, " ")).join(", ")}.
          </p>
          <div className="mt-2 flex gap-3 text-xs">
            {highCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-red-500" />
                {highCount} high priority
              </span>
            )}
            {medCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-amber-500" />
                {medCount} medium priority
              </span>
            )}
            {lowCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-blue-500" />
                {lowCount} low priority
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Suggestions list */}
      <div className="space-y-2">
        {isSelectable && (
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              {selected.size} of {changes.length} selected
            </p>
            <Button variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
          </div>
        )}

        {changes.map((change, idx) => {
          const priority = priorityFromChange(change);
          const isSelected = !isSelectable || selected.has(idx);
          return (
            <Card
              key={idx}
              className={`transition-opacity ${isSelectable ? "cursor-pointer" : ""} ${isSelected ? "" : "opacity-50"}`}
              onClick={isSelectable ? () => toggleItem(idx) : undefined}
            >
              <CardContent className="flex items-start gap-3 p-4">
                {isSelectable && (
                  <Checkbox
                    checked={selected.has(idx)}
                    onCheckedChange={() => toggleItem(idx)}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{change.section}</span>
                    <Badge className={`text-[10px] ${priorityColor(priority)}`}>{priority}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{change.description}</p>
                  <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                    {change.added > 0 && (
                      <span className="text-green-600">+{change.added} added</span>
                    )}
                    {change.modified > 0 && (
                      <span className="text-amber-600">{change.modified} modified</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setShowDiff(true)} disabled={!hasSelection}>
          <Eye className="mr-2 size-4" />
          Preview Changes
        </Button>
        <Button
          variant="outline"
          onClick={handleApply}
          disabled={applying || cloning || creating || !hasSelection}
        >
          {applying ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Check className="mr-2 size-4" />
          )}
          Apply to Space
        </Button>
        <Button
          variant="outline"
          onClick={handleCloneAndApply}
          disabled={applying || cloning || creating || !hasSelection}
        >
          {cloning ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Copy className="mr-2 size-4" />
          )}
          Clone and Apply
        </Button>
        {onCreateNew && (
          <Button
            variant="outline"
            onClick={handleCreateNew}
            disabled={applying || cloning || creating || !hasSelection}
          >
            {creating ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Plus className="mr-2 size-4" />
            )}
            Create New Space
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

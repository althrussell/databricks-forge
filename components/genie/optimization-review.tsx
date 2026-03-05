"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Check,
  Copy,
  Eye,
  Loader2,
  Wrench,
  X,
} from "lucide-react";
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
  applying: boolean;
  cloning: boolean;
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
  applying,
  cloning,
}: OptimizationReviewProps) {
  const [selected, setSelected] = useState<Set<number>>(
    new Set(changes.map((_, i) => i)),
  );
  const [showDiff, setShowDiff] = useState(false);

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

  const highCount = changes.filter((c) => priorityFromChange(c) === "high").length;
  const medCount = changes.filter((c) => priorityFromChange(c) === "medium").length;
  const lowCount = changes.filter((c) => priorityFromChange(c) === "low").length;

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
          <Button onClick={() => onApply(updatedSerializedSpace)} disabled={applying || cloning}>
            {applying ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
            Apply to Space
          </Button>
          <Button
            variant="outline"
            onClick={() => onCloneAndApply(updatedSerializedSpace)}
            disabled={applying || cloning}
          >
            {cloning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Copy className="mr-2 size-4" />}
            Clone and Apply
          </Button>
          <Button variant="ghost" onClick={onCancel}>
            <X className="mr-2 size-4" />
            Cancel
          </Button>
        </div>
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
            {changes.length} suggestion{changes.length !== 1 ? "s" : ""} generated
            from {strategiesRun.length} strateg{strategiesRun.length !== 1 ? "ies" : "y"}:
            {" "}{strategiesRun.map((s) => s.replace(/_/g, " ")).join(", ")}.
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
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">
            {selected.size} of {changes.length} selected
          </p>
          <Button variant="ghost" size="sm" onClick={toggleAll}>
            {selected.size === changes.length ? "Deselect All" : "Select All"}
          </Button>
        </div>

        {changes.map((change, idx) => {
          const priority = priorityFromChange(change);
          return (
            <Card
              key={idx}
              className={`cursor-pointer transition-opacity ${selected.has(idx) ? "" : "opacity-50"}`}
              onClick={() => toggleItem(idx)}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <Checkbox
                  checked={selected.has(idx)}
                  onCheckedChange={() => toggleItem(idx)}
                  onClick={(e) => e.stopPropagation()}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{change.section}</span>
                    <Badge className={`text-[10px] ${priorityColor(priority)}`}>
                      {priority}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{change.description}</p>
                  <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
                    {change.added > 0 && <span className="text-green-600">+{change.added} added</span>}
                    {change.modified > 0 && <span className="text-amber-600">{change.modified} modified</span>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <Button onClick={() => setShowDiff(true)} disabled={selected.size === 0}>
          <Eye className="mr-2 size-4" />
          Preview Changes
        </Button>
        <Button
          variant="outline"
          onClick={() => onApply(updatedSerializedSpace)}
          disabled={applying || cloning || selected.size === 0}
        >
          {applying ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}
          Apply to Space
        </Button>
        <Button
          variant="outline"
          onClick={() => onCloneAndApply(updatedSerializedSpace)}
          disabled={applying || cloning || selected.size === 0}
        >
          {cloning ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Copy className="mr-2 size-4" />}
          Clone and Apply
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Minus, Plus } from "lucide-react";

interface FixChange {
  section: string;
  description: string;
  added: number;
  modified: number;
}

interface SpaceDiffViewerProps {
  currentSerializedSpace: string;
  updatedSerializedSpace: string;
  changes: FixChange[];
}

function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * Computes a simple line-level diff between two strings.
 * Returns arrays of lines with their diff status.
 */
function computeLineDiff(
  oldText: string,
  newText: string,
): { left: DiffLine[]; right: DiffLine[] } {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  const left: DiffLine[] = [];
  const right: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);

  // Simple LCS-based matching isn't needed for a preview;
  // we do a paired walk that highlights changed lines.
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    const ol = oi < oldLines.length ? oldLines[oi] : undefined;
    const nl = ni < newLines.length ? newLines[ni] : undefined;

    if (ol === nl) {
      left.push({ text: ol ?? "", status: "same" });
      right.push({ text: nl ?? "", status: "same" });
      oi++;
      ni++;
    } else if (ol !== undefined && nl !== undefined) {
      // Check if old line appears later in new (added lines before it)
      const newLookAhead = newLines.slice(ni, ni + 5).indexOf(ol);
      const oldLookAhead = oldLines.slice(oi, oi + 5).indexOf(nl!);

      if (newLookAhead > 0 && (oldLookAhead < 0 || newLookAhead <= oldLookAhead)) {
        // Lines were added in new
        for (let i = 0; i < newLookAhead; i++) {
          left.push({ text: "", status: "padding" });
          right.push({ text: newLines[ni + i], status: "added" });
        }
        ni += newLookAhead;
      } else if (oldLookAhead > 0) {
        // Lines were removed from old
        for (let i = 0; i < oldLookAhead; i++) {
          left.push({ text: oldLines[oi + i], status: "removed" });
          right.push({ text: "", status: "padding" });
        }
        oi += oldLookAhead;
      } else {
        // Changed line
        left.push({ text: ol, status: "removed" });
        right.push({ text: nl, status: "added" });
        oi++;
        ni++;
      }
    } else if (ol !== undefined) {
      left.push({ text: ol, status: "removed" });
      right.push({ text: "", status: "padding" });
      oi++;
    } else if (nl !== undefined) {
      left.push({ text: "", status: "padding" });
      right.push({ text: nl, status: "added" });
      ni++;
    } else {
      break;
    }

    if (left.length > maxLen + 500) break;
  }

  return { left, right };
}

interface DiffLine {
  text: string;
  status: "same" | "added" | "removed" | "padding";
}

function lineClass(status: DiffLine["status"]): string {
  switch (status) {
    case "added":
      return "bg-green-50 dark:bg-green-900/20";
    case "removed":
      return "bg-red-50 dark:bg-red-900/20";
    case "padding":
      return "bg-muted/30";
    default:
      return "";
  }
}

export function SpaceDiffViewer({
  currentSerializedSpace,
  updatedSerializedSpace,
  changes,
}: SpaceDiffViewerProps) {
  const { left, right } = useMemo(
    () => computeLineDiff(formatJson(currentSerializedSpace), formatJson(updatedSerializedSpace)),
    [currentSerializedSpace, updatedSerializedSpace],
  );

  const addedCount = right.filter((l) => l.status === "added").length;
  const removedCount = left.filter((l) => l.status === "removed").length;

  return (
    <div className="space-y-4">
      {/* Change summary */}
      {changes.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Changes Applied</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {changes.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <Badge variant="outline" className="text-[10px]">
                    {c.section}
                  </Badge>
                  <span className="text-muted-foreground">{c.description}</span>
                  {c.added > 0 && (
                    <span className="flex items-center gap-0.5 text-green-600">
                      <Plus className="size-3" />
                      {c.added}
                    </span>
                  )}
                  {c.modified > 0 && (
                    <span className="text-amber-600">~{c.modified}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Diff stats */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1 text-green-600">
          <Plus className="size-3" />
          {addedCount} lines added
        </span>
        <span className="flex items-center gap-1 text-red-600">
          <Minus className="size-3" />
          {removedCount} lines removed
        </span>
      </div>

      {/* Side-by-side diff */}
      <div className="grid grid-cols-2 gap-0 overflow-hidden rounded border">
        <div className="border-r">
          <div className="border-b bg-muted/50 px-3 py-1.5 text-xs font-medium">
            Current Configuration
          </div>
          <div className="max-h-[600px] overflow-auto">
            <pre className="text-[11px] leading-5">
              {left.map((line, i) => (
                <div key={i} className={`px-3 ${lineClass(line.status)}`}>
                  {line.text || "\u00A0"}
                </div>
              ))}
            </pre>
          </div>
        </div>
        <div>
          <div className="border-b bg-muted/50 px-3 py-1.5 text-xs font-medium">
            New Configuration
          </div>
          <div className="max-h-[600px] overflow-auto">
            <pre className="text-[11px] leading-5">
              {right.map((line, i) => (
                <div key={i} className={`px-3 ${lineClass(line.status)}`}>
                  {line.text || "\u00A0"}
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

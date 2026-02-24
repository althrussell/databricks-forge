"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  Download,
  FileSpreadsheet,
  Presentation,
  FileText,
  FileCode,
  Braces,
  Briefcase,
  Loader2,
  ExternalLink,
  RotateCcw,
  Rocket,
} from "lucide-react";

interface ExportToolbarProps {
  runId: string;
  businessName: string;
  scanId?: string | null;
}

const EXPORT_FORMATS = [
  { key: "excel", label: "Excel (.xlsx)", icon: FileSpreadsheet },
  { key: "pptx", label: "PowerPoint (.pptx)", icon: Presentation },
  { key: "pdf", label: "PDF", icon: FileText },
  { key: "csv", label: "CSV", icon: FileCode },
  { key: "json", label: "JSON", icon: Braces },
] as const;

export function ExportToolbar({ runId, businessName, scanId }: ExportToolbarProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const [notebookUrl, setNotebookUrl] = useState<string | null>(null);
  const [hasDeployed, setHasDeployed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/runs/${runId}/exports`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data?.exports) return;
        const nb = data.exports.find(
          (e: { format: string; filePath?: string | null }) =>
            e.format === "notebooks" && e.filePath
        );
        if (nb?.filePath) {
          setNotebookUrl(nb.filePath);
          setHasDeployed(true);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [runId]);

  const handleExport = async (format: string) => {
    setExporting(format);
    try {
      if (format === "notebooks") {
        const res = await fetch(`/api/export/${runId}?format=notebooks`);
        if (!res.ok) throw new Error("Export failed");
        const data = await res.json();
        if (data.url) {
          setNotebookUrl(data.url);
          setHasDeployed(true);
        }
        toast.success(`Deployed ${data.count ?? 0} notebooks to workspace`);
        return;
      }

      const res = await fetch(`/api/export/${runId}?format=${format}`);
      if (!res.ok) throw new Error("Export failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const extMap: Record<string, string> = { excel: "xlsx", pptx: "pptx", pdf: "pdf", csv: "csv", json: "json" };
      const ext = extMap[format] ?? format;
      a.download = `forge_${businessName.replace(/\s+/g, "_")}_${runId.substring(0, 8)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${format.toUpperCase()} exported successfully`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : `${format} export failed`
      );
    } finally {
      setExporting(null);
    }
  };

  const handleBriefingExport = async () => {
    if (!scanId) return;
    setExporting("briefing");
    try {
      const url = `/api/export/executive-briefing?scanId=${scanId}&runId=${runId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = `forge_executive_briefing_${businessName.replace(/\s+/g, "_")}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
      toast.success("Executive Briefing exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Executive Briefing export failed");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Export dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={!!exporting}>
            {exporting && exporting !== "notebooks" ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {EXPORT_FORMATS.map(({ key, label, icon: Icon }) => (
            <DropdownMenuItem
              key={key}
              disabled={!!exporting}
              onClick={() => handleExport(key)}
            >
              <Icon className="mr-2 h-4 w-4" />
              {exporting === key ? "Exporting..." : label}
            </DropdownMenuItem>
          ))}
          {scanId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!!exporting}
                onClick={handleBriefingExport}
              >
                <Briefcase className="mr-2 h-4 w-4" />
                {exporting === "briefing" ? "Exporting..." : "Executive Briefing"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deploy actions */}
      {hasDeployed ? (
        <>
          <Button
            size="sm"
            onClick={() => window.open(notebookUrl!, "_blank")}
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            Open Notebooks
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                {exporting === "notebooks" ? "Deploying..." : "Redeploy"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Redeploy notebooks?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will overwrite all previously deployed notebooks in the
                  workspace. Any manual edits made to those notebooks will be
                  lost.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => handleExport("notebooks")}>
                  Redeploy
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : (
        <Button
          size="sm"
          disabled={!!exporting}
          onClick={() => handleExport("notebooks")}
        >
          <Rocket className="mr-1.5 h-3.5 w-3.5" />
          {exporting === "notebooks" ? "Deploying..." : "Deploy Notebooks"}
        </Button>
      )}
    </div>
  );
}

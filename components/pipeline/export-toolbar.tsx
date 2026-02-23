"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
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

interface ExportToolbarProps {
  runId: string;
  businessName: string;
  onGenieClick?: () => void;
}

export function ExportToolbar({ runId, businessName, onGenieClick }: ExportToolbarProps) {
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

      const ext = format === "excel" ? "xlsx" : format;
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

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!!exporting}
        onClick={() => handleExport("excel")}
      >
        {exporting === "excel" ? "Exporting..." : "Excel"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!!exporting}
        onClick={() => handleExport("pptx")}
      >
        {exporting === "pptx" ? "Exporting..." : "PowerPoint"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!!exporting}
        onClick={() => handleExport("pdf")}
      >
        {exporting === "pdf" ? "Exporting..." : "PDF"}
      </Button>
      {onGenieClick && (
        <Button
          variant="outline"
          size="sm"
          disabled={!!exporting}
          onClick={onGenieClick}
        >
          Deploy Genie
        </Button>
      )}
      {hasDeployed ? (
        <>
          <Button
            size="sm"
            onClick={() => window.open(notebookUrl!, "_blank")}
          >
            Open Notebooks
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!!exporting}
              >
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
          {exporting === "notebooks" ? "Deploying..." : "Deploy Notebooks"}
        </Button>
      )}
    </div>
  );
}

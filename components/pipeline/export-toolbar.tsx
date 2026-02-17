"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ExportToolbarProps {
  runId: string;
  businessName: string;
  onGenieClick?: () => void;
}

export function ExportToolbar({ runId, businessName, onGenieClick }: ExportToolbarProps) {
  const [exporting, setExporting] = useState<string | null>(null);

  const handleExportEnvReport = async () => {
    setExporting("environment");
    try {
      // First, find the scan linked to this run
      const scanResp = await fetch(`/api/environment-scan`);
      if (!scanResp.ok) throw new Error("No scans available");
      const scanData = await scanResp.json();
      const linked = scanData.scans?.find((s: { runId?: string }) => s.runId === runId);
      if (!linked) {
        toast.error("No environment scan linked to this run");
        return;
      }
      const resp = await fetch(`/api/environment-scan/${linked.scanId}/export?format=excel`);
      if (!resp.ok) throw new Error("Export failed");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `environment_report_${runId.substring(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Environment report exported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Environment report export failed");
    } finally {
      setExporting(null);
    }
  };

  const handleExport = async (format: string) => {
    setExporting(format);
    try {
      if (format === "notebooks") {
        const res = await fetch(`/api/export/${runId}?format=notebooks`);
        if (!res.ok) throw new Error("Export failed");
        const data = await res.json();
        toast.success(`Deployed ${data.count ?? 0} notebooks to workspace`, {
          duration: 10000,
          action: data.url
            ? {
                label: "Open in Workspace",
                onClick: () => window.open(data.url, "_blank"),
              }
            : undefined,
        });
        return;
      }

      const res = await fetch(`/api/export/${runId}?format=${format}`);
      if (!res.ok) throw new Error("Export failed");

      // Download the file
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const ext = format === "excel" ? "xlsx" : format;
      a.download = `inspire_${businessName.replace(/\s+/g, "_")}_${runId.substring(0, 8)}.${ext}`;
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
      <Button
        size="sm"
        disabled={!!exporting}
        onClick={() => handleExport("notebooks")}
      >
        {exporting === "notebooks"
          ? "Deploying..."
          : "Deploy Notebooks"}
      </Button>
      <Button
        variant="outline"
        size="sm"
        disabled={!!exporting}
        onClick={() => handleExportEnvReport()}
      >
        {exporting === "environment" ? "Exporting..." : "Environment Report"}
      </Button>
    </div>
  );
}

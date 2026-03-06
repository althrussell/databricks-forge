"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, FolderOpen } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { SETTINGS } from "@/lib/help-text";

interface ExportSettingsProps {
  defaultExportFormat: string;
  onDefaultExportFormatChange: (value: string) => void;
  notebookPath: string;
  onNotebookPathChange: (value: string) => void;
}

export function ExportSettings({
  defaultExportFormat,
  onDefaultExportFormatChange,
  notebookPath,
  onNotebookPathChange,
}: ExportSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Export Preferences
        </CardTitle>
        <CardDescription>Default settings for exporting discovery results</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="defaultExport">Default export format</Label>
              <InfoTip tip={SETTINGS.exportFormat} />
            </div>
            <Select value={defaultExportFormat} onValueChange={onDefaultExportFormatChange}>
              <SelectTrigger id="defaultExport" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="pptx">PowerPoint (.pptx)</SelectItem>
                <SelectItem value="notebooks">Databricks Notebooks</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="notebookPath">Notebook deployment path</Label>
              <InfoTip tip={SETTINGS.notebookPath} />
            </div>
            <div className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              <Input
                id="notebookPath"
                value={notebookPath}
                onChange={(e) => onNotebookPathChange(e.target.value)}
                placeholder="./forge_gen/"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

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
import { FileText, FolderOpen, Tag } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { SETTINGS } from "@/lib/help-text";

interface ExportSettingsProps {
  defaultExportFormat: string;
  onDefaultExportFormatChange: (value: string) => void;
  notebookPath: string;
  onNotebookPathChange: (value: string) => void;
  catalogResourcePrefix: string;
  onCatalogResourcePrefixChange: (value: string) => void;
}

export function ExportSettings({
  defaultExportFormat,
  onDefaultExportFormatChange,
  notebookPath,
  onNotebookPathChange,
  catalogResourcePrefix,
  onCatalogResourcePrefixChange,
}: ExportSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Export & Naming
        </CardTitle>
        <CardDescription>
          Default export format, notebook path, and naming prefix for Unity Catalog resources
        </CardDescription>
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

        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="catalogResourcePrefix">Catalog resource prefix</Label>
            <InfoTip tip="Prefix applied to all Unity Catalog resources (views, metric views, tables) created by Forge. Makes it easy to identify Forge-generated objects in your database. Must be lowercase alphanumeric/underscores and end with an underscore." />
          </div>
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <Input
              id="catalogResourcePrefix"
              value={catalogResourcePrefix}
              onChange={(e) => {
                const v = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
                onCatalogResourcePrefixChange(v);
              }}
              placeholder="forge_"
              className="w-48"
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            Example: with prefix{" "}
            <code className="font-mono">{catalogResourcePrefix || "forge_"}</code>, a metric view
            named <code className="font-mono">order_revenue</code> becomes{" "}
            <code className="font-mono">{catalogResourcePrefix || "forge_"}order_revenue</code>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

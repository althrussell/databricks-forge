"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { loadSettings, saveSettings } from "@/lib/settings";
import {
  Shield,
  Database,
  User,
  Globe,
  Trash2,
  Save,
  FileText,
  FolderOpen,
} from "lucide-react";
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

export default function SettingsPage() {
  const [sampleRowsPerTable, setSampleRowsPerTable] = useState(() => {
    if (typeof window === "undefined") return 0;
    return loadSettings().sampleRowsPerTable;
  });
  const [defaultExportFormat, setDefaultExportFormat] = useState(() => {
    if (typeof window === "undefined") return "excel";
    return loadSettings().defaultExportFormat ?? "excel";
  });
  const [notebookPath, setNotebookPath] = useState(() => {
    if (typeof window === "undefined") return "./inspire_gen/";
    return loadSettings().notebookPath ?? "./inspire_gen/";
  });

  // Profile info from API
  const [profile, setProfile] = useState<{
    email: string | null;
    host: string | null;
  } | null>(null);

  const loaded = typeof window !== "undefined";

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((data) => {
        setProfile({
          email: data.userEmail ?? null,
          host: data.host ?? null,
        });
      })
      .catch(() => {});
  }, []);

  const handleSave = () => {
    saveSettings({ sampleRowsPerTable, defaultExportFormat, notebookPath });
    toast.success("Settings saved");
  };

  const handleClearLocalData = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("inspire-ai-settings");
      setSampleRowsPerTable(0);
      setDefaultExportFormat("excel");
      setNotebookPath("./inspire_gen/");
      toast.success("Local settings cleared");
    }
  };

  if (!loaded) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="mt-2 h-5 w-96" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-muted-foreground">
          Configure application-wide defaults and preferences.
        </p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile
          </CardTitle>
          <CardDescription>
            Your workspace identity and connection information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs text-muted-foreground">User Email</Label>
              <p className="mt-0.5 text-sm font-medium">
                {profile?.email ?? "Not available (local dev)"}
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Databricks Workspace
              </Label>
              <p className="mt-0.5 text-sm font-medium font-mono">
                {profile?.host ?? "Not connected"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Sampling */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Sampling
          </CardTitle>
          <CardDescription>
            Control whether sample rows are fetched from tables during SQL
            generation. More rows give the AI richer context to write precise
            queries, at the cost of reading row-level data and longer run times.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sampleRows">Rows per table</Label>
            <Select
              value={String(sampleRowsPerTable)}
              onValueChange={(v) => setSampleRowsPerTable(parseInt(v, 10))}
            >
              <SelectTrigger id="sampleRows" className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Disabled (metadata only)</SelectItem>
                <SelectItem value="5">5 rows per table</SelectItem>
                <SelectItem value="10">10 rows per table</SelectItem>
                <SelectItem value="25">25 rows per table</SelectItem>
                <SelectItem value="50">50 rows per table</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
            <div className="flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 text-amber-500" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-foreground">
                  Privacy &amp; data access
                </p>
                <p className="mt-1">
                  When data sampling is enabled, Inspire AI reads a small number
                  of rows from each table involved in a use case. This data is
                  sent to the AI model alongside the schema to improve SQL
                  accuracy. Sampled data is <strong>not</strong> persisted.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export Preferences
          </CardTitle>
          <CardDescription>
            Default settings for exporting discovery results
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="defaultExport">Default export format</Label>
              <Select
                value={defaultExportFormat}
                onValueChange={setDefaultExportFormat}
              >
                <SelectTrigger id="defaultExport" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="pptx">PowerPoint (.pptx)</SelectItem>
                  <SelectItem value="notebooks">
                    Databricks Notebooks
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notebookPath">
                Notebook deployment path
              </Label>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="notebookPath"
                  value={notebookPath}
                  onChange={(e) => setNotebookPath(e.target.value)}
                  placeholder="./inspire_gen/"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>
            Manage local settings and cached data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">
                Clear local settings
              </p>
              <p className="text-xs text-muted-foreground">
                Reset all preferences to their defaults. This does not affect
                pipeline runs or use cases stored in Lakebase.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear local settings?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will reset all preferences (data sampling, export
                    format, notebook path) to their defaults. Pipeline runs and
                    data are not affected.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearLocalData}>
                    Clear Settings
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg">
          <Save className="mr-2 h-4 w-4" />
          Save Settings
        </Button>
      </div>
    </div>
  );
}

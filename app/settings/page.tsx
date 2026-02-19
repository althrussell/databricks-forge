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
  Trash2,
  Save,
  FileText,
  FolderOpen,
  Target,
  Scale,
  Layers,
} from "lucide-react";
import {
  DISCOVERY_DEPTHS,
  type DiscoveryDepth,
} from "@/lib/domain/types";
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
    if (typeof window === "undefined") return "./forge_gen/";
    return loadSettings().notebookPath ?? "./forge_gen/";
  });
  const [defaultDiscoveryDepth, setDefaultDiscoveryDepth] = useState<DiscoveryDepth>(() => {
    if (typeof window === "undefined") return "balanced";
    return loadSettings().defaultDiscoveryDepth ?? "balanced";
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
    saveSettings({ sampleRowsPerTable, defaultExportFormat, notebookPath, defaultDiscoveryDepth });
    toast.success("Settings saved");
  };

  const handleClearLocalData = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("forge-ai-settings");
      setSampleRowsPerTable(0);
      setDefaultExportFormat("excel");
      setNotebookPath("./forge_gen/");
      setDefaultDiscoveryDepth("balanced");
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
            Control whether sample rows are fetched from tables during use case
            discovery and SQL generation. Real data values help the AI understand
            what each table contains, producing more relevant use cases and
            more accurate SQL queries. Trade-off: reads row-level data and
            increases run time.
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
                When data sampling is enabled, Forge AI reads a small number
                of rows from each table during use case discovery and SQL
                generation. This data is sent to the AI model alongside the
                schema so it can understand real data values, formats, and
                patterns -- producing better use cases and more accurate SQL.
                Sampled data is <strong>not</strong> persisted.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Discovery Depth */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Discovery Depth
          </CardTitle>
          <CardDescription>
            Set the default discovery depth for new pipeline runs. This controls
            the quality/quantity trade-off: how many use cases are generated per
            batch, the minimum quality floor, and the adaptive volume cap.
            You can still override this per-run in the configuration form.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {([
              {
                value: "focused" as DiscoveryDepth,
                label: "Focused",
                icon: Target,
                description: "Fewer, highest-quality use cases. Best for targeted workshops or demos.",
                details: "8-12 per batch · quality floor 0.4 · cap 75",
              },
              {
                value: "balanced" as DiscoveryDepth,
                label: "Balanced",
                icon: Scale,
                description: "Good mix of breadth and quality. Recommended for most discovery runs.",
                details: "12-18 per batch · quality floor 0.3 · cap 150",
              },
              {
                value: "comprehensive" as DiscoveryDepth,
                label: "Comprehensive",
                icon: Layers,
                description: "Maximum coverage across all domains. Longer runs, broader output.",
                details: "15-22 per batch · quality floor 0.2 · cap 250",
              },
            ]).map((opt) => {
              const selected = defaultDiscoveryDepth === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDefaultDiscoveryDepth(opt.value)}
                  className={`flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-colors ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${selected ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-medium ${selected ? "text-primary" : ""}`}>
                      {opt.label}
                    </span>
                    {opt.value === "balanced" && (
                      <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {opt.description}
                  </p>
                  <p className="text-[10px] font-mono text-muted-foreground/70">
                    {opt.details}
                  </p>
                </button>
              );
            })}
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
                  placeholder="./forge_gen/"
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

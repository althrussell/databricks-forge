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
import { loadSettings, saveSettings, type GenieEngineDefaults } from "@/lib/settings";
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
  Sparkles,
} from "lucide-react";
import {
  DISCOVERY_DEPTHS,
  DEFAULT_DEPTH_CONFIGS,
  type DiscoveryDepth,
  type DiscoveryDepthConfig,
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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
  const [depthConfigs, setDepthConfigs] = useState<Record<DiscoveryDepth, DiscoveryDepthConfig>>(() => {
    if (typeof window === "undefined") return { ...DEFAULT_DEPTH_CONFIGS };
    return loadSettings().discoveryDepthConfigs;
  });

  const [genieDefaults, setGenieDefaults] = useState<GenieEngineDefaults>(() => {
    if (typeof window === "undefined") return { engineEnabled: true, maxTablesPerSpace: 25, llmRefinement: true, generateBenchmarks: true, generateMetricViews: true, autoTimePeriods: true, generateTrustedAssets: true, fiscalYearStartMonth: 1, entityMatchingMode: "auto" };
    return loadSettings().genieEngineDefaults;
  });

  const updateDepthParam = (depth: DiscoveryDepth, key: keyof DiscoveryDepthConfig, value: number) => {
    setDepthConfigs((prev) => ({
      ...prev,
      [depth]: { ...prev[depth], [key]: value },
    }));
  };

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
    saveSettings({ sampleRowsPerTable, defaultExportFormat, notebookPath, defaultDiscoveryDepth, discoveryDepthConfigs: depthConfigs, genieEngineDefaults: genieDefaults });
    toast.success("Settings saved");
  };

  const handleClearLocalData = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("forge-ai-settings");
      setSampleRowsPerTable(0);
      setDefaultExportFormat("excel");
      setNotebookPath("./forge_gen/");
      setDefaultDiscoveryDepth("balanced");
      setDepthConfigs({ ...DEFAULT_DEPTH_CONFIGS });
      setGenieDefaults({ engineEnabled: true, maxTablesPerSpace: 25, llmRefinement: true, generateBenchmarks: true, generateMetricViews: true, autoTimePeriods: true, generateTrustedAssets: true, fiscalYearStartMonth: 1, entityMatchingMode: "auto" });
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
            Configure the parameters for each discovery depth level and choose
            the default. Each level controls how many use cases are generated per
            batch, the minimum quality threshold, and the maximum output volume.
            You can still override the depth level per-run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Default depth selector */}
          <div className="space-y-2">
            <Label>Default depth for new runs</Label>
            <div className="flex gap-2">
              {(["focused", "balanced", "comprehensive"] as DiscoveryDepth[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDefaultDiscoveryDepth(d)}
                  className={`rounded-md border-2 px-4 py-2 text-sm font-medium transition-colors ${
                    defaultDiscoveryDepth === d
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  {d.charAt(0).toUpperCase() + d.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Per-depth parameter editors */}
          <div className="grid gap-4 lg:grid-cols-3">
            {([
              { value: "focused" as DiscoveryDepth, label: "Focused", icon: Target, description: "Fewer, highest-quality use cases" },
              { value: "balanced" as DiscoveryDepth, label: "Balanced", icon: Scale, description: "Good mix of breadth and quality" },
              { value: "comprehensive" as DiscoveryDepth, label: "Comprehensive", icon: Layers, description: "Maximum coverage across domains" },
            ]).map((opt) => {
              const cfg = depthConfigs[opt.value];
              const defaults = DEFAULT_DEPTH_CONFIGS[opt.value];
              const Icon = opt.icon;
              const isDefault = defaultDiscoveryDepth === opt.value;
              return (
                <div
                  key={opt.value}
                  className={`rounded-lg border-2 p-4 space-y-4 ${
                    isDefault ? "border-primary/50 bg-primary/5" : "border-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${isDefault ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="text-sm font-semibold">{opt.label}</span>
                    {isDefault && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Batch target (min-max use cases per batch)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={cfg.batchTargetMin}
                          onChange={(e) => updateDepthParam(opt.value, "batchTargetMin", parseInt(e.target.value) || defaults.batchTargetMin)}
                          className="w-20 h-8 text-sm"
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type="number"
                          min={1}
                          max={100}
                          value={cfg.batchTargetMax}
                          onChange={(e) => updateDepthParam(opt.value, "batchTargetMax", parseInt(e.target.value) || defaults.batchTargetMax)}
                          className="w-20 h-8 text-sm"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Quality floor (0-1, minimum overall score)</Label>
                      <Input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={cfg.qualityFloor}
                        onChange={(e) => updateDepthParam(opt.value, "qualityFloor", parseFloat(e.target.value) || defaults.qualityFloor)}
                        className="w-24 h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Adaptive cap (max use cases in output)</Label>
                      <Input
                        type="number"
                        min={10}
                        max={1000}
                        step={5}
                        value={cfg.adaptiveCap}
                        onChange={(e) => updateDepthParam(opt.value, "adaptiveCap", parseInt(e.target.value) || defaults.adaptiveCap)}
                        className="w-24 h-8 text-sm"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Lineage depth (max hops to walk)</Label>
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        value={cfg.lineageDepth}
                        onChange={(e) => updateDepthParam(opt.value, "lineageDepth", parseInt(e.target.value) || defaults.lineageDepth)}
                        className="w-24 h-8 text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDepthConfigs((prev) => ({ ...prev, [opt.value]: { ...defaults } }))}
                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
                  >
                    Reset to defaults
                  </button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Genie Engine Defaults */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Genie Engine
          </CardTitle>
          <CardDescription>
            Global defaults for Genie Space generation. These apply to all new
            runs. Per-run configuration (glossary, custom SQL, column overrides,
            benchmarks, instructions) is still editable within each run.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master enable/disable */}
          <div
            className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
              genieDefaults.engineEnabled
                ? "border-violet-500/50 bg-violet-500/5"
                : "border-muted"
            }`}
          >
            <div>
              <p className="text-sm font-medium">Genie Engine</p>
              <p className="text-xs text-muted-foreground">
                {genieDefaults.engineEnabled
                  ? "Enabled — LLM-powered Genie Space generation is active for all runs"
                  : "Disabled — Engine config will be read-only in runs; only legacy generation available"}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setGenieDefaults((prev) => ({
                  ...prev,
                  engineEnabled: !prev.engineEnabled,
                }))
              }
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                genieDefaults.engineEnabled ? "bg-violet-500" : "bg-muted"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  genieDefaults.engineEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className={genieDefaults.engineEnabled ? "" : "pointer-events-none opacity-50"}>
            {/* Max tables + Fiscal year */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="maxTables">Max tables per space</Label>
                <div className="flex items-center gap-3">
                  <Input
                    id="maxTables"
                    type="number"
                    min={1}
                    max={30}
                    value={genieDefaults.maxTablesPerSpace}
                    onChange={(e) =>
                      setGenieDefaults((prev) => ({
                        ...prev,
                        maxTablesPerSpace: Math.min(30, Math.max(1, parseInt(e.target.value) || 25)),
                      }))
                    }
                    className="w-24"
                  />
                  <span className="text-xs text-muted-foreground">
                    Up to 30 tables per space
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiscalMonth">Fiscal year start month</Label>
                <Select
                  value={String(genieDefaults.fiscalYearStartMonth)}
                  onValueChange={(v) =>
                    setGenieDefaults((prev) => ({
                      ...prev,
                      fiscalYearStartMonth: parseInt(v),
                    }))
                  }
                >
                  <SelectTrigger id="fiscalMonth" className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, idx) => (
                      <SelectItem key={idx + 1} value={String(idx + 1)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Entity matching */}
            <div className="mt-4 space-y-2">
              <Label>Entity Matching</Label>
              <div className="flex gap-2">
                {([
                  { value: "auto" as const, label: "Auto (from sample data)" },
                  { value: "manual" as const, label: "Manual only" },
                  { value: "off" as const, label: "Disabled" },
                ]).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() =>
                      setGenieDefaults((prev) => ({
                        ...prev,
                        entityMatchingMode: opt.value,
                      }))
                    }
                    className={`rounded-md border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                      genieDefaults.entityMatchingMode === opt.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Auto uses sample data to detect value aliases (e.g. &quot;Florida&quot; &rarr; &quot;FL&quot;)
              </p>
            </div>

            <Separator className="my-4" />

            {/* Feature toggles */}
            <div className="grid gap-3 md:grid-cols-2">
              <GenieToggle
                label="LLM Refinement"
                description="Use AI to generate semantic expressions, instructions, and trusted assets"
                checked={genieDefaults.llmRefinement}
                onToggle={(v) => setGenieDefaults((prev) => ({ ...prev, llmRefinement: v }))}
              />
              <GenieToggle
                label="Trusted Assets"
                description="Generate parameterized SQL queries and UDF definitions"
                checked={genieDefaults.generateTrustedAssets}
                onToggle={(v) => setGenieDefaults((prev) => ({ ...prev, generateTrustedAssets: v }))}
              />
              <GenieToggle
                label="Auto Benchmarks"
                description="Generate test questions with expected SQL to evaluate Genie accuracy"
                checked={genieDefaults.generateBenchmarks}
                onToggle={(v) => setGenieDefaults((prev) => ({ ...prev, generateBenchmarks: v }))}
              />
              <GenieToggle
                label="Metric Views"
                description="Propose metric view definitions (KPIs, dimensions, measures)"
                checked={genieDefaults.generateMetricViews}
                onToggle={(v) => setGenieDefaults((prev) => ({ ...prev, generateMetricViews: v }))}
              />
              <GenieToggle
                label="Auto Time Periods"
                description="Generate standard date filters and dimensions (last week, last month, fiscal quarters)"
                checked={genieDefaults.autoTimePeriods}
                onToggle={(v) => setGenieDefaults((prev) => ({ ...prev, autoTimePeriods: v }))}
              />
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

function GenieToggle({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onToggle(!checked)}
      className={`rounded-lg border-2 p-4 text-left transition-colors ${
        checked
          ? "border-violet-500/50 bg-violet-500/5"
          : "border-muted text-muted-foreground"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div
          className={`h-4 w-4 rounded-full ${checked ? "bg-violet-500" : "bg-muted"}`}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

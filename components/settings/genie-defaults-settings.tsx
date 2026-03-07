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
import { Separator } from "@/components/ui/separator";
import { Sparkles } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { SETTINGS } from "@/lib/help-text";
import type {
  GenieEngineDefaults,
  GenieAuthMode,
  QuestionComplexity,
  QuestionComplexitySettings,
} from "@/lib/settings";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

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
        checked ? "border-violet-500/50 bg-violet-500/5" : "border-muted text-muted-foreground"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className={`h-4 w-4 rounded-full ${checked ? "bg-violet-500" : "bg-muted"}`} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

interface GenieDefaultsSettingsProps {
  genieDefaults: GenieEngineDefaults;
  onGenieDefaultsChange: (
    value: GenieEngineDefaults | ((prev: GenieEngineDefaults) => GenieEngineDefaults),
  ) => void;
  genieDeployAuthMode: GenieAuthMode;
  onGenieDeployAuthModeChange: (value: GenieAuthMode) => void;
  questionComplexity: QuestionComplexitySettings;
  onQuestionComplexityChange: (
    value:
      | QuestionComplexitySettings
      | ((prev: QuestionComplexitySettings) => QuestionComplexitySettings),
  ) => void;
  metricViewsServerEnabled: boolean;
}

export function GenieDefaultsSettings({
  genieDefaults,
  onGenieDefaultsChange,
  genieDeployAuthMode,
  onGenieDeployAuthModeChange,
  questionComplexity,
  onQuestionComplexityChange,
  metricViewsServerEnabled,
}: GenieDefaultsSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Genie Engine
          <InfoTip tip={SETTINGS.genieEngine} />
        </CardTitle>
        <CardDescription>
          Global defaults for Genie Space generation. These apply to all new runs. Per-run
          configuration (glossary, custom SQL, column overrides, benchmarks, instructions) is still
          editable within each run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div
          className={`flex items-center justify-between rounded-lg border-2 p-4 transition-colors ${
            genieDefaults.engineEnabled ? "border-violet-500/50 bg-violet-500/5" : "border-muted"
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
              onGenieDefaultsChange((prev) => ({
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
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="maxTables">Max tables per space</Label>
                <InfoTip tip={SETTINGS.maxTables} />
              </div>
              <div className="flex items-center gap-3">
                <Input
                  id="maxTables"
                  type="number"
                  min={1}
                  max={30}
                  value={genieDefaults.maxTablesPerSpace}
                  onChange={(e) =>
                    onGenieDefaultsChange((prev) => ({
                      ...prev,
                      maxTablesPerSpace: Math.min(30, Math.max(1, parseInt(e.target.value) || 25)),
                    }))
                  }
                  className="w-24"
                />
                <span className="text-xs text-muted-foreground">Up to 30 tables per space</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="fiscalMonth">Fiscal year start month</Label>
                <InfoTip tip={SETTINGS.fiscalYear} />
              </div>
              <Select
                value={String(genieDefaults.fiscalYearStartMonth)}
                onValueChange={(v) =>
                  onGenieDefaultsChange((prev) => ({
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

          <div className="mt-4 space-y-2">
            <Label htmlFor="maxAutoSpaces">Max spaces to auto-analyse</Label>
            <div className="flex items-center gap-3">
              <Input
                id="maxAutoSpaces"
                type="number"
                min={0}
                max={50}
                value={genieDefaults.maxAutoSpaces}
                onChange={(e) =>
                  onGenieDefaultsChange((prev) => ({
                    ...prev,
                    maxAutoSpaces: Math.min(50, Math.max(0, parseInt(e.target.value) || 0)),
                  }))
                }
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">
                0 = all domains (default). Limits auto-generation; you can always regenerate more
                from the Genie Workbench.
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Entity Matching</Label>
              <InfoTip tip={SETTINGS.entityMatching} />
            </div>
            <div className="flex gap-2">
              {[
                { value: "auto" as const, label: "Auto (from sample data)" },
                { value: "manual" as const, label: "Manual only" },
                { value: "off" as const, label: "Disabled" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    onGenieDefaultsChange((prev) => ({
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
              Auto uses sample data to detect value aliases (e.g. &quot;Florida&quot; &rarr;
              &quot;FL&quot;)
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-center gap-1.5">
              <Label>Question Complexity</Label>
              <InfoTip tip="Controls the language style of sample questions generated for Genie Spaces. Simple: short plain-English questions. Medium: slightly more specific with business concepts. Complex: analytical language with trends, correlations, and technical terms." />
            </div>
            {[
              { key: "genieEngine" as const, label: "Genie Engine" },
              { key: "adhocGenie" as const, label: "Adhoc Genie" },
              { key: "metadataGenie" as const, label: "Metadata Genie" },
            ].map((surface) => (
              <div key={surface.key} className="flex items-center gap-3">
                <span className="w-32 text-xs text-muted-foreground">{surface.label}</span>
                <div className="flex gap-1.5">
                  {[
                    { value: "simple" as QuestionComplexity, label: "Simple" },
                    { value: "medium" as QuestionComplexity, label: "Medium" },
                    { value: "complex" as QuestionComplexity, label: "Complex" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        onQuestionComplexityChange((prev) => ({
                          ...prev,
                          [surface.key]: opt.value,
                        }))
                      }
                      className={`rounded-md border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                        questionComplexity[surface.key] === opt.value
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">
              Simple produces short, everyday questions. Medium adds business context. Complex uses
              analytical language.
            </p>
          </div>

          <Separator className="my-4" />

          <div className="grid gap-3 md:grid-cols-2">
            <GenieToggle
              label="LLM Refinement"
              description="Use AI to generate semantic expressions, instructions, and trusted assets"
              checked={genieDefaults.llmRefinement}
              onToggle={(v) => onGenieDefaultsChange((prev) => ({ ...prev, llmRefinement: v }))}
            />
            <GenieToggle
              label="Trusted Assets"
              description="Generate parameterized SQL queries and UDF definitions"
              checked={genieDefaults.generateTrustedAssets}
              onToggle={(v) =>
                onGenieDefaultsChange((prev) => ({ ...prev, generateTrustedAssets: v }))
              }
            />
            <GenieToggle
              label="Auto Benchmarks"
              description="Generate test questions with expected SQL to evaluate Genie accuracy"
              checked={genieDefaults.generateBenchmarks}
              onToggle={(v) =>
                onGenieDefaultsChange((prev) => ({ ...prev, generateBenchmarks: v }))
              }
            />
            {metricViewsServerEnabled && (
              <GenieToggle
                label="Metric Views"
                description="Propose metric view definitions (KPIs, dimensions, measures)"
                checked={genieDefaults.generateMetricViews}
                onToggle={(v) =>
                  onGenieDefaultsChange((prev) => ({ ...prev, generateMetricViews: v }))
                }
              />
            )}
            <GenieToggle
              label="Auto Time Periods"
              description="Generate standard date filters and dimensions (last week, last month, fiscal quarters)"
              checked={genieDefaults.autoTimePeriods}
              onToggle={(v) => onGenieDefaultsChange((prev) => ({ ...prev, autoTimePeriods: v }))}
            />
          </div>

          <Separator className="my-4" />

          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label>Deploy Authentication</Label>
              <InfoTip tip="Controls which identity is used when creating, updating, or deleting Genie Spaces in Databricks. User (OBO) uses the logged-in user's credentials; Service Principal uses the app's service principal." />
            </div>
            <div className="flex gap-2">
              {(
                [
                  { value: "obo" as const, label: "User (recommended)" },
                  { value: "sp" as const, label: "Service Principal" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onGenieDeployAuthModeChange(opt.value)}
                  className={`rounded-md border-2 px-3 py-1.5 text-xs font-medium transition-colors ${
                    genieDeployAuthMode === opt.value
                      ? "border-primary bg-primary/5 text-primary"
                      : "border-muted text-muted-foreground hover:border-muted-foreground/30"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {genieDeployAuthMode === "obo"
                ? "Spaces are created under your identity. You must have access to the referenced tables."
                : "Spaces are created under the app\u2019s service principal. The SP must have SELECT access to the referenced tables."}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

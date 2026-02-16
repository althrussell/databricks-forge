"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { loadSettings, saveSettings } from "@/lib/settings";
import { Shield, Database } from "lucide-react";

export default function SettingsPage() {
  const [sampleRowsPerTable, setSampleRowsPerTable] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const s = loadSettings();
    setSampleRowsPerTable(s.sampleRowsPerTable);
    setLoaded(true);
  }, []);

  const handleSave = () => {
    saveSettings({ sampleRowsPerTable });
    toast.success("Settings saved");
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
          Configure application-wide defaults. These apply to every new
          discovery run.
        </p>
      </div>

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
                  accuracy. Sampled data is <strong>not</strong> persisted -- it
                  is used only during the generation step and discarded.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end">
        <Button onClick={handleSave} size="lg">
          Save Settings
        </Button>
      </div>
    </div>
  );
}

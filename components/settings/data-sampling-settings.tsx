"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Shield } from "lucide-react";
import { InfoTip } from "@/components/ui/info-tip";
import { SETTINGS } from "@/lib/help-text";

interface DataSamplingSettingsProps {
  sampleRowsPerTable: number;
  onSampleRowsPerTableChange: (value: number) => void;
}

export function DataSamplingSettings({
  sampleRowsPerTable,
  onSampleRowsPerTableChange,
}: DataSamplingSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          Data Sampling
        </CardTitle>
        <CardDescription>
          Control whether sample rows are fetched from tables during use case discovery and SQL
          generation. Real data values help the AI understand what each table contains, producing
          more relevant use cases and more accurate SQL queries. Trade-off: reads row-level data and
          increases run time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="sampleRows">Rows per table</Label>
            <InfoTip tip={SETTINGS.sampleRows} />
          </div>
          <Select
            value={String(sampleRowsPerTable)}
            onValueChange={(v) => onSampleRowsPerTableChange(parseInt(v, 10))}
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
              <p className="font-medium text-foreground">Privacy &amp; data access</p>
              <p className="mt-1">
                When data sampling is enabled, Forge AI reads a small number of rows from each table
                during use case discovery and SQL generation. This data is sent to the AI model
                alongside the schema so it can understand real data values, formats, and patterns --
                producing better use cases and more accurate SQL. Sampled data is{" "}
                <strong>not</strong> persisted.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

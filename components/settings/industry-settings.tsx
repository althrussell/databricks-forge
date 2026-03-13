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
import { Building2 } from "lucide-react";
import { useIndustryOutcomes } from "@/lib/hooks/use-industry-outcomes";

interface IndustrySettingsProps {
  industry: string;
  onIndustryChange: (value: string) => void;
}

export function IndustrySettings({ industry, onIndustryChange }: IndustrySettingsProps) {
  const { getOptions, loading } = useIndustryOutcomes();
  const options = getOptions();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Industry
        </CardTitle>
        <CardDescription>
          Set your organisation&apos;s industry once here and it will be applied automatically to all
          new pipeline runs, AI comment jobs, and other kickoff flows. Per-job industry dropdowns are
          hidden when this is set.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="globalIndustry">Industry</Label>
          <Select
            value={industry || "__none__"}
            onValueChange={(v) => onIndustryChange(v === "__none__" ? "" : v)}
            disabled={loading}
          >
            <SelectTrigger id="globalIndustry" className="w-80">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Select an industry..." />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Not set</SelectItem>
              {options.map((opt) => (
                <SelectItem key={opt.id} value={opt.id}>
                  {opt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {industry
              ? "All new jobs will use this industry. You can still change it per-run from the run detail page."
              : "When not set, each job kickoff will show an industry dropdown for per-run selection."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

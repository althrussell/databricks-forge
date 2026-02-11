"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";
import {
  BUSINESS_PRIORITIES,
  SUPPORTED_LANGUAGES,
  type BusinessPriority,
  type SupportedLanguage,
} from "@/lib/domain/types";

const AI_MODELS = [
  "databricks-claude-sonnet-4-5",
  "databricks-gpt-oss-120b",
  "databricks-meta-llama-3.3-70b-instruct",
  "databricks-dbrx-instruct",
];

export function ConfigForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [ucMetadata, setUcMetadata] = useState("");
  const [businessDomains, setBusinessDomains] = useState("");
  const [selectedPriorities, setSelectedPriorities] = useState<
    BusinessPriority[]
  >(["Increase Revenue"]);
  const [strategicGoals, setStrategicGoals] = useState("");
  const [aiModel, setAiModel] = useState(AI_MODELS[0]);
  const [selectedLanguages, setSelectedLanguages] = useState<
    SupportedLanguage[]
  >(["English"]);

  const togglePriority = (priority: BusinessPriority) => {
    setSelectedPriorities((prev) =>
      prev.includes(priority)
        ? prev.filter((p) => p !== priority)
        : [...prev, priority]
    );
  };

  const toggleLanguage = (lang: SupportedLanguage) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang)
        ? prev.filter((l) => l !== lang)
        : [...prev, lang]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!businessName.trim()) {
      toast.error("Business Name is required");
      return;
    }
    if (!ucMetadata.trim()) {
      toast.error("UC Metadata path is required");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create the run
      const createRes = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          ucMetadata: ucMetadata.trim(),
          businessDomains: businessDomains.trim(),
          businessPriorities: selectedPriorities,
          strategicGoals: strategicGoals.trim(),
          aiModel,
          languages: selectedLanguages,
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.json();
        throw new Error(err.error ?? "Failed to create run");
      }

      const { runId } = await createRes.json();

      // Start execution
      const execRes = await fetch(`/api/runs/${runId}/execute`, {
        method: "POST",
      });

      if (!execRes.ok) {
        const err = await execRes.json();
        throw new Error(err.error ?? "Failed to start pipeline");
      }

      toast.success("Pipeline started! Redirecting to run details...");
      router.push(`/runs/${runId}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Something went wrong"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Required Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Required Configuration</CardTitle>
          <CardDescription>
            These fields are needed to start a discovery run
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessName">Business Name</Label>
            <Input
              id="businessName"
              placeholder="e.g. Acme Financial Services"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Your organisation or project name
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ucMetadata">UC Metadata</Label>
            <Input
              id="ucMetadata"
              placeholder="e.g. main.finance or catalog1, catalog2"
              value={ucMetadata}
              onChange={(e) => setUcMetadata(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Unity Catalog path: catalog, catalog.schema, or comma-separated
              list
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Business Priorities */}
      <Card>
        <CardHeader>
          <CardTitle>Business Priorities</CardTitle>
          <CardDescription>
            Select the priorities that matter most to your organisation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {BUSINESS_PRIORITIES.map((priority) => (
              <label
                key={priority}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  checked={selectedPriorities.includes(priority)}
                  onCheckedChange={() => togglePriority(priority)}
                />
                {priority}
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Optional Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Advanced Configuration</CardTitle>
          <CardDescription>
            Optional settings -- defaults are auto-detected
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="businessDomains">
              Business Domains (optional)
            </Label>
            <Input
              id="businessDomains"
              placeholder="e.g. Risk, Finance, Marketing"
              value={businessDomains}
              onChange={(e) => setBusinessDomains(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Focus domains -- leave blank for auto-detection
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="strategicGoals">
              Strategic Goals (optional)
            </Label>
            <Textarea
              id="strategicGoals"
              placeholder="Custom strategic goals for use case prioritisation..."
              value={strategicGoals}
              onChange={(e) => setStrategicGoals(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for AI-generated goals
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="aiModel">AI Model</Label>
            <Select value={aiModel} onValueChange={setAiModel}>
              <SelectTrigger id="aiModel">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Document Languages</Label>
            <div className="flex flex-wrap gap-2">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <label
                  key={lang}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <Checkbox
                    checked={selectedLanguages.includes(lang)}
                    onCheckedChange={() => toggleLanguage(lang)}
                  />
                  {lang}
                </label>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Starting Discovery..." : "Start Discovery"}
        </Button>
      </div>
    </form>
  );
}

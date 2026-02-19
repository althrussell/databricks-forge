"use client";

import { useState, useEffect } from "react";
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
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Keyboard, X, Plus, Building2, Target, Scale, Layers } from "lucide-react";
import { CatalogBrowser } from "@/components/pipeline/catalog-browser";
import {
  BUSINESS_PRIORITIES,
  SUPPORTED_LANGUAGES,
  DISCOVERY_DEPTHS,
  type BusinessPriority,
  type SupportedLanguage,
  type DiscoveryDepth,
} from "@/lib/domain/types";

const DEPTH_OPTIONS: Array<{
  value: DiscoveryDepth;
  label: string;
  description: string;
  icon: typeof Target;
}> = [
  {
    value: "focused",
    label: "Focused",
    description: "Fewer, highest-quality use cases. Best for targeted workshops or demos.",
    icon: Target,
  },
  {
    value: "balanced",
    label: "Balanced",
    description: "Good mix of breadth and quality. Recommended for most discovery runs.",
    icon: Scale,
  },
  {
    value: "comprehensive",
    label: "Comprehensive",
    description: "Maximum coverage across your data estate. Best for large-scale assessments.",
    icon: Layers,
  },
];
import { loadSettings } from "@/lib/settings";
import { useIndustryOutcomes } from "@/lib/hooks/use-industry-outcomes";

const SUGGESTED_DOMAINS = [
  "Finance",
  "Risk & Compliance",
  "Marketing",
  "Sales",
  "Operations",
  "Supply Chain",
  "Human Resources",
  "Customer Experience",
  "Healthcare",
  "Manufacturing",
  "Retail",
  "Insurance",
  "Cybersecurity",
  "Sustainability",
];


export function ConfigForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [discoveryDepth, setDiscoveryDepth] = useState<DiscoveryDepth>(() => {
    if (typeof window === "undefined") return "balanced";
    return loadSettings().defaultDiscoveryDepth ?? "balanced";
  });
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualInput, setManualInput] = useState("");
  const [businessDomains, setBusinessDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");

  const { getOptions: getIndustryOptions, getOutcome: getIndustryOutcome } =
    useIndustryOutcomes();
  const industryOptions = getIndustryOptions();

  const handleIndustryChange = (value: string) => {
    const newIndustry = value === "__none__" ? "" : value;
    setIndustry(newIndustry);

    if (newIndustry) {
      const outcome = getIndustryOutcome(newIndustry);
      if (outcome) {
        // Auto-suggest domains from the industry outcome map
        if (businessDomains.length === 0) {
          setBusinessDomains(outcome.suggestedDomains);
        }
        // Auto-suggest priorities from the industry outcome map
        if (
          selectedPriorities.length <= 1 &&
          selectedPriorities[0] === "Increase Revenue"
        ) {
          const mapped = outcome.suggestedPriorities.filter((p) =>
            (BUSINESS_PRIORITIES as readonly string[]).includes(p)
          ) as BusinessPriority[];
          if (mapped.length > 0) {
            setSelectedPriorities(mapped);
          }
        }
      }
    }
  };

  // Derive ucMetadata from browser selection or manual input
  const ucMetadata = manualMode
    ? manualInput.trim()
    : selectedSources.join(", ");
  const [selectedPriorities, setSelectedPriorities] = useState<
    BusinessPriority[]
  >(["Increase Revenue"]);
  const [strategicGoals, setStrategicGoals] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<
    SupportedLanguage[]
  >(["English"]);

  // Hydrate from sessionStorage (for "Duplicate Config" flow)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("forge:duplicate-config");
      if (!raw) return;
      sessionStorage.removeItem("forge:duplicate-config");
      const cfg = JSON.parse(raw);
      if (cfg.discoveryDepth && DISCOVERY_DEPTHS.includes(cfg.discoveryDepth)) setDiscoveryDepth(cfg.discoveryDepth);
      if (cfg.businessName) setBusinessName(cfg.businessName);
      if (cfg.industry) setIndustry(cfg.industry);
      if (cfg.ucMetadata) {
        setManualMode(true);
        setManualInput(cfg.ucMetadata);
      }
      if (cfg.businessDomains?.length) setBusinessDomains(cfg.businessDomains);
      if (cfg.businessPriorities?.length) setSelectedPriorities(cfg.businessPriorities);
      if (cfg.strategicGoals) setStrategicGoals(cfg.strategicGoals);
      if (cfg.languages?.length) setSelectedLanguages(cfg.languages);
    } catch {
      // Ignore malformed data
    }
  }, []);

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
    if (!ucMetadata) {
      toast.error("Select at least one catalog or schema from Unity Catalog");
      return;
    }

    setIsSubmitting(true);

    try {
      // Read app-wide settings (configured in Settings page)
      const appSettings = loadSettings();

      // Create the run
      const createRes = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          ucMetadata,
          industry,
          businessDomains: businessDomains.join(", "),
          businessPriorities: selectedPriorities,
          strategicGoals: strategicGoals.trim(),
          languages: selectedLanguages,
          sampleRowsPerTable: appSettings.sampleRowsPerTable,
          discoveryDepth,
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
      {/* Discovery Depth */}
      <Card>
        <CardHeader>
          <CardTitle>Discovery Depth</CardTitle>
          <CardDescription>
            Choose how broadly to search for use cases. This affects how many
            use cases are generated and the quality threshold applied.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3">
            {DEPTH_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = discoveryDepth === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDiscoveryDepth(opt.value)}
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
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        Recommended
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Required Fields */}
      <Card>
        <CardHeader>
          <CardTitle>Required Configuration</CardTitle>
          <CardDescription>
            These fields are needed to start a discovery run. The AI uses your
            business name to generate industry context and tailor use case
            recommendations.
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
              Your organisation or project name -- the AI derives industry
              context, value chain, and revenue model from this.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="industry">Industry (optional)</Label>
            <Select
              value={industry || "__none__"}
              onValueChange={handleIndustryChange}
            >
              <SelectTrigger id="industry">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Select an industry..." />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Not specified</SelectItem>
                {industryOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {industry ? (
                <span className="text-primary">
                  Industry context will be injected into prompts with curated
                  use cases, KPIs, and strategic context.
                </span>
              ) : (
                <>
                  If left empty, the system will auto-detect the best matching
                  industry from the business context generated in Step 1.
                </>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label>UC Metadata Sources</Label>
            {manualMode ? (
              <>
                <Input
                  id="ucMetadata"
                  placeholder="e.g. main.finance or catalog1, catalog2"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Comma-separated list: catalog, catalog.schema, or mix
                </p>
                <button
                  type="button"
                  onClick={() => setManualMode(false)}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <Keyboard className="h-3 w-3" />
                  Switch to catalog browser
                </button>
              </>
            ) : (
              <>
                <CatalogBrowser
                  selectedSources={selectedSources}
                  onSelectionChange={setSelectedSources}
                />
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(true);
                    setManualInput(selectedSources.join(", "));
                  }}
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  <Keyboard className="h-3 w-3" />
                  Or type manually
                </button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Business Priorities */}
      <Card>
        <CardHeader>
          <CardTitle>Business Priorities</CardTitle>
          <CardDescription>
            Select the priorities that matter most to your organisation. These
            directly influence how use cases are scored -- higher weight is given
            to use cases aligned with your selected priorities.
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
            Optional settings -- defaults are auto-detected by the AI. Only
            override these if you want to constrain the analysis to specific
            business domains or use a particular AI model.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <Label>Business Domains (optional)</Label>

            {/* Selected domains */}
            {businessDomains.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {businessDomains.map((domain) => (
                  <Badge
                    key={domain}
                    variant="secondary"
                    className="gap-1 pr-1"
                  >
                    {domain}
                    <button
                      type="button"
                      onClick={() =>
                        setBusinessDomains((prev) =>
                          prev.filter((d) => d !== domain)
                        )
                      }
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted-foreground/20"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Quick-add suggestions */}
            <div>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Quick add:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SUGGESTED_DOMAINS.filter(
                  (d) => !businessDomains.includes(d)
                ).map((domain) => (
                  <button
                    key={domain}
                    type="button"
                    onClick={() =>
                      setBusinessDomains((prev) => [...prev, domain])
                    }
                    className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    {domain}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom domain input */}
            <div className="flex gap-2">
              <Input
                id="businessDomains"
                placeholder="Add a custom domain..."
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && domainInput.trim()) {
                    e.preventDefault();
                    const val = domainInput.trim();
                    if (!businessDomains.includes(val)) {
                      setBusinessDomains((prev) => [...prev, val]);
                    }
                    setDomainInput("");
                  }
                }}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!domainInput.trim()}
                onClick={() => {
                  const val = domainInput.trim();
                  if (val && !businessDomains.includes(val)) {
                    setBusinessDomains((prev) => [...prev, val]);
                  }
                  setDomainInput("");
                }}
              >
                Add
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              Leave empty for AI auto-detection
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

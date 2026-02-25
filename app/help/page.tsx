"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronDown,
  Lightbulb,
  Rocket,
  BarChart3,
  Database,
  Settings2,
  FileText,
  Sparkles,
  HelpCircle,
} from "lucide-react";

const QUICK_START = [
  {
    step: 1,
    title: "Configure a Discovery Run",
    description:
      'Navigate to "New Discovery" in the sidebar. Enter your business name, select catalogs/schemas from your Unity Catalog, and choose a discovery depth.',
    icon: Settings2,
  },
  {
    step: 2,
    title: "Wait for the Pipeline",
    description:
      "The 7-step pipeline runs automatically: business context, metadata extraction, table filtering, use case generation, domain clustering, scoring, and SQL generation.",
    icon: Rocket,
  },
  {
    step: 3,
    title: "Review Use Cases",
    description:
      "Browse generated use cases in the Use Cases tab. Filter by domain, type, or score. Edit titles and descriptions. Mark favourites.",
    icon: Lightbulb,
  },
  {
    step: 4,
    title: "Export and Deploy",
    description:
      "Export to Excel, PDF, PowerPoint, CSV, or JSON. Deploy SQL notebooks directly to your workspace. Generate Genie Spaces for natural language SQL access.",
    icon: FileText,
  },
];

const FAQ = [
  {
    question: "What data does Forge AI access?",
    answer:
      "Forge AI only reads metadata (table names, column names, data types, foreign keys) from your Unity Catalog information_schema. No row-level data is accessed unless you enable data sampling in Settings, which reads a small number of sample rows for column profiling.",
  },
  {
    question: "What happens if the pipeline fails?",
    answer:
      'If a pipeline fails mid-run, you can click "Resume Pipeline" on the run detail page to restart from the last successful step. All previously completed steps are preserved.',
  },
  {
    question: "What is an Estate Scan?",
    answer:
      "An estate scan runs 8 LLM intelligence passes over your metadata: domain classification, PII detection, redundancy analysis, relationship discovery, data tier assignment, data product identification, governance scoring, and table descriptions. Results appear on the Estate page.",
  },
  {
    question: "What are Genie Spaces?",
    answer:
      "Genie Spaces are Databricks workspaces where business users can ask natural language questions that are translated into SQL. Forge AI generates pre-configured Genie Spaces with semantic expressions, filters, and benchmark queries based on your use cases.",
  },
  {
    question: "What are Industry Outcome Maps?",
    answer:
      "Outcome maps are curated reference frameworks for specific industries (e.g., Financial Services, Healthcare). They define KPIs, strategic use cases, and domain priorities. When selected, they enrich the LLM prompts for more targeted recommendations.",
  },
  {
    question: "How does scoring work?",
    answer:
      "Each use case is scored on 4 dimensions: Feasibility (how implementable), Business Value (potential impact), Innovation (novelty), and Data Readiness (metadata quality). The composite score is a weighted average. Business priorities boost aligned use case scores.",
  },
  {
    question: "Can I compare multiple runs?",
    answer:
      'Yes. Navigate to "Compare" in the sidebar, select two runs, and view side-by-side metrics, use case overlap, configuration differences, and step-level timing.',
  },
  {
    question: "Where are my settings saved?",
    answer:
      "Application settings (discovery depth, Genie defaults, export preferences) are stored in your browser's localStorage. They persist across sessions but are local to your browser. Pipeline runs and use cases are stored in Lakebase (server-side).",
  },
];

const TIPS = [
  "Start with a Focused depth for your first run to get a quick feel for the tool, then switch to Balanced or Comprehensive.",
  "Selecting an industry pre-loads curated KPIs and strategic context, significantly improving use case quality.",
  "Use the Catalog Browser to precisely scope your metadata. Scanning fewer schemas produces more focused results.",
  "Business Domains are auto-detected by default. Only override them if you want to constrain the analysis.",
  "Enable Estate Scan on your first run for a comprehensive view of your data health and governance.",
  "Export as Executive Briefing (PPTX) for stakeholder presentations -- it combines estate intelligence with use case findings.",
  "The Compare page is useful for A/B testing different configurations on the same metadata scope.",
];

export default function HelpPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Help</h1>
        <p className="mt-1 text-muted-foreground">
          Learn how to get the most from Forge AI.
        </p>
      </div>

      {/* Quick Start */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5" />
            Quick Start
          </CardTitle>
          <CardDescription>
            Get from zero to actionable use cases in four steps.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            {QUICK_START.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.step}
                  className="flex gap-3 rounded-lg border p-4"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      <Badge variant="secondary" className="mr-2 text-[10px]">
                        Step {item.step}
                      </Badge>
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Tips and Best Practices
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                <span className="text-muted-foreground">{tip}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5" />
            Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {FAQ.map((item, i) => (
            <Collapsible key={i}>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm font-medium hover:bg-muted transition-colors text-left">
                {item.question}
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <p className="px-3 pb-3 text-sm text-muted-foreground">
                  {item.answer}
                </p>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </CardContent>
      </Card>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Pipeline Steps
          </CardTitle>
          <CardDescription>
            The discovery pipeline runs these 7 steps sequentially.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              {
                step: 1,
                name: "Business Context",
                desc: "Generates industry context, value chain, and revenue model from your business name.",
              },
              {
                step: 2,
                name: "Metadata Extraction",
                desc: "Queries information_schema to discover tables, columns, and foreign keys.",
              },
              {
                step: 3,
                name: "Table Filtering",
                desc: "Classifies each table as business-relevant or technical/system.",
              },
              {
                step: 4,
                name: "Use Case Generation",
                desc: "Generates use cases in parallel batches, grounded in your metadata.",
              },
              {
                step: 5,
                name: "Domain Clustering",
                desc: "Assigns business domains and subdomains to each use case.",
              },
              {
                step: 6,
                name: "Scoring and Dedup",
                desc: "Scores on 4 dimensions, deduplicates, and applies quality calibration.",
              },
              {
                step: 7,
                name: "SQL Generation",
                desc: "Generates bespoke SQL for each use case, validated against schemas.",
              },
            ].map((s) => (
              <div key={s.step} className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-primary/30 text-[10px] font-bold text-primary">
                  {s.step}
                </div>
                <div>
                  <p className="text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-muted-foreground">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Privacy Note */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Privacy and Security
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Forge AI reads only metadata (table and column names, data types,
            foreign keys) from your Unity Catalog. No row-level data is accessed
            unless data sampling is explicitly enabled. All LLM calls go through
            your workspace&apos;s Model Serving endpoint. Authentication is handled
            automatically by the Databricks Apps platform.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

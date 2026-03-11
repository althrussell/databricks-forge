"use client";

import { useState } from "react";
import { ConfigForm } from "@/components/pipeline/config-form";
import { SuggestionPanel } from "@/components/pipeline/suggestion-panel";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";

export default function ConfigurePage() {
  const [businessName, setBusinessName] = useState("");

  return (
    <div className="mx-auto max-w-[1400px] space-y-8">
      <PageHeader
        title="New Discovery Run"
        subtitle="Configure your business context and Unity Catalog scope, then let Forge discover use cases."
      />

      <Card className="border-chart-2/20 bg-chart-2/[0.03] dark:border-chart-2/15 dark:bg-chart-2/[0.04]">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-chart-2" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Tips for best results</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                <li>
                  Use your full company name (e.g. &ldquo;Contoso Financial Services&rdquo;) for
                  more accurate industry context.
                </li>
                <li>
                  Start with a single catalog or schema to get results faster, then expand scope in
                  subsequent runs.
                </li>
                <li>
                  Select 2-3 business priorities that align with your current strategic focus.
                </li>
                <li>
                  The default AI model works well for most use cases. Use a larger model for more
                  creative or nuanced results.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <SuggestionPanel businessName={businessName} />

      <ConfigForm onBusinessNameChange={setBusinessName} />
    </div>
  );
}

import { ConfigForm } from "@/components/pipeline/config-form";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Lightbulb } from "lucide-react";

export default function ConfigurePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          New Discovery Run
        </h1>
        <p className="mt-1 text-muted-foreground">
          Configure your business context and Unity Catalog scope, then let
          Forge AI discover use cases.
        </p>
      </div>

      {/* Quick Tips */}
      <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
        <CardContent className="pt-4">
          <div className="flex gap-3">
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Tips for best results</p>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                <li>
                  Use your full company name (e.g. &ldquo;Contoso
                  Financial Services&rdquo;) for more accurate industry context.
                </li>
                <li>
                  Start with a single catalog or schema to get results faster,
                  then expand scope in subsequent runs.
                </li>
                <li>
                  Select 2-3 business priorities that align with your current
                  strategic focus.
                </li>
                <li>
                  The default AI model works well for most use cases. Use a
                  larger model for more creative or nuanced results.
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfigForm />
    </div>
  );
}

"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";
import packageJson from "@/package.json";

interface AboutSettingsProps {
  profile: {
    email: string | null;
    host: string | null;
  } | null;
}

export function AboutSettings({ profile }: AboutSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="h-5 w-5" />
          About
        </CardTitle>
        <CardDescription>
          Application version and build information
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <Label className="text-xs text-muted-foreground">Version</Label>
            <p className="mt-0.5 text-sm font-medium font-mono">
              v{packageJson.version}
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Application</Label>
            <p className="mt-0.5 text-sm font-medium">
              Databricks Forge AI
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Runtime</Label>
            <p className="mt-0.5 text-sm font-medium font-mono">
              Next.js {profile ? "/ Databricks Apps" : "/ Local Dev"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { User } from "lucide-react";

interface ProfileSettingsProps {
  profile: {
    email: string | null;
    host: string | null;
  } | null;
}

export function ProfileSettings({ profile }: ProfileSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <User className="h-5 w-5" />
          Profile
        </CardTitle>
        <CardDescription>Your workspace identity and connection information</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs text-muted-foreground">User Email</Label>
            <p className="mt-0.5 text-sm font-medium">
              {profile?.email ?? "Not available (local dev)"}
            </p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Databricks Workspace</Label>
            <p className="mt-0.5 text-sm font-medium font-mono">
              {profile?.host ?? "Not connected"}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

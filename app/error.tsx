"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error-boundary]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <Card className="w-full max-w-lg border-destructive/50">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. You can try again or go back to the
            dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-sm font-mono text-muted-foreground">
            {error.message || "Unknown error"}
            {error.digest && (
              <span className="block mt-1 text-xs opacity-60">
                Error ID: {error.digest}
              </span>
            )}
          </div>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => window.location.href = "/"}>
              Dashboard
            </Button>
            <Button onClick={() => reset()}>Try Again</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

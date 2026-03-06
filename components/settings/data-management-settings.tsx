"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface DataManagementSettingsProps {
  onClearLocalData: () => void;
  onDeleteAllData: () => void;
  deleting: boolean;
}

export function DataManagementSettings({
  onClearLocalData,
  onDeleteAllData,
  deleting,
}: DataManagementSettingsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Data Management
        </CardTitle>
        <CardDescription>
          Manage local settings and cached data
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">
              Clear local settings
            </p>
            <p className="text-xs text-muted-foreground">
              Reset all preferences to their defaults. This does not affect
              pipeline runs or use cases stored in Lakebase.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm">
                Clear
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear local settings?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will reset all preferences (data sampling, export
                  format, notebook path) to their defaults. Pipeline runs and
                  data are not affected.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={onClearLocalData}>
                  Clear Settings
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <Separator />

        <div className="flex items-center justify-between rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <div>
            <p className="text-sm font-medium text-destructive">
              Delete all data
            </p>
            <p className="text-xs text-muted-foreground">
              Permanently delete all pipeline runs, use cases, environment
              scans, Genie spaces, conversations, exports, and cached data. This cannot be
              undone.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                {deleting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <AlertTriangle className="mr-2 h-4 w-4" />
                )}
                {deleting ? "Deleting…" : "Delete All"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all application data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all pipeline runs, use cases,
                  environment scans, Genie recommendations, dashboards,
                  exports, prompt logs, and cached metadata. Local settings
                  will also be reset. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDeleteAllData}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

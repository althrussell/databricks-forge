"use client";

import { useState, useEffect } from "react";
import { Wand2, Trash2, Loader2, Clock } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { toast } from "sonner";
import { DemoWizard } from "./demo-wizard";
import type { DemoSessionSummary } from "@/lib/demo/types";

export function DemoModeSettings() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [sessions, setSessions] = useState<DemoSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      const resp = await fetch("/api/demo/sessions");
      if (resp.ok) {
        const data = await resp.json();
        setSessions(data);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (sessionId: string) => {
    setDeletingId(sessionId);
    try {
      const resp = await fetch(`/api/demo/sessions/${sessionId}`, {
        method: "DELETE",
      });
      if (resp.ok) {
        const result = await resp.json();
        toast.success(`Cleaned up: ${result.tablesDropped} tables dropped`);
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
      } else {
        toast.error("Failed to delete demo session");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Demo Mode
          </CardTitle>
          <CardDescription>
            Generate custom synthetic demo datasets for customer engagements.
            Research a company, design tables, and write directly to Unity Catalog.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={() => setWizardOpen(true)}>
            <Wand2 className="mr-2 h-4 w-4" />
            Launch Demo Wizard
          </Button>

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading sessions...
            </div>
          ) : sessions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Previous Sessions</p>
              {sessions.map((session) => (
                <div
                  key={session.sessionId}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{session.customerName}</span>
                      <Badge variant="outline">{session.industryId}</Badge>
                      <Badge
                        variant={
                          session.status === "completed"
                            ? "secondary"
                            : session.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                      >
                        {session.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>
                        {session.catalogName}.{session.schemaName}
                      </span>
                      {session.tablesCreated > 0 && (
                        <span>{session.tablesCreated} tables</span>
                      )}
                      {session.totalRows > 0 && (
                        <span>{session.totalRows.toLocaleString()} rows</span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={deletingId === session.sessionId}
                      >
                        {deletingId === session.sessionId ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-destructive" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete demo data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will DROP all tables created in{" "}
                          <code>
                            {session.catalogName}.{session.schemaName}
                          </code>{" "}
                          and remove the session record. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(session.sessionId)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No demo sessions yet. Launch the wizard to create your first demo.
            </p>
          )}
        </CardContent>
      </Card>

      <DemoWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </>
  );
}

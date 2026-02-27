"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Play,
  Copy,
  Check,
  Download,
  AlertCircle,
  Clock,
  Loader2,
  BookOpen,
  Pencil,
} from "lucide-react";

interface SqlColumn {
  name: string;
  typeName: string;
}

interface SqlExecutionResult {
  success: boolean;
  result?: { columns: SqlColumn[]; rows: string[][]; totalRowCount: number };
  error?: string;
  durationMs: number;
}

interface SqlDialogProps {
  open: boolean;
  sql: string;
  onOpenChange: (open: boolean) => void;
  onRequestFix?: (sql: string, error: string) => void;
  onDeployNotebook?: (sql: string) => void;
}

export function SqlDialog({ open, sql, onOpenChange, onRequestFix, onDeployNotebook }: SqlDialogProps) {
  const [currentSql, setCurrentSql] = React.useState(sql);
  const [editing, setEditing] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<SqlExecutionResult | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setCurrentSql(sql);
      setEditing(false);
      setResult(null);
    }
  }, [sql, open]);

  const handleRun = async () => {
    setRunning(true);
    setResult(null);
    try {
      const resp = await fetch("/api/sql/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: currentSql }),
      });
      const data = await resp.json();
      setResult(data);
    } catch {
      setResult({ success: false, error: "Network error", durationMs: 0 });
    } finally {
      setRunning(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentSql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    if (!result?.result) return;
    const { columns, rows } = result.result;
    const header = columns.map((c) => c.name).join(",");
    const body = rows.map((row) => row.map((cell) => `"${(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "forge_query_results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            SQL Query
            <Badge variant="secondary" className="text-[10px]">Executable</Badge>
          </DialogTitle>
          <DialogDescription>
            Review, edit, and execute this SQL against your warehouse.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b pb-3">
          <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleRun} disabled={running}>
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
            {running ? "Running..." : "Run Query"}
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleCopy}>
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={() => setEditing(!editing)}
          >
            <Pencil className="size-3.5" />
            {editing ? "Done Editing" : "Edit"}
          </Button>
          {onDeployNotebook && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto h-8 gap-1.5 text-xs"
              onClick={() => onDeployNotebook(currentSql)}
            >
              <BookOpen className="size-3.5" />
              Deploy as Notebook
            </Button>
          )}
        </div>

        {/* SQL Editor / Preview */}
        <div className="min-h-0 flex-1 overflow-auto">
          {editing ? (
            <textarea
              value={currentSql}
              onChange={(e) => setCurrentSql(e.target.value)}
              className="h-full min-h-[200px] w-full resize-none rounded-md border bg-muted p-4 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              spellCheck={false}
            />
          ) : (
            <pre className="max-h-[300px] overflow-auto rounded-md bg-muted p-4 text-sm">
              <code>{currentSql}</code>
            </pre>
          )}

          {/* Error */}
          {result && !result.success && result.error && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-destructive">Execution Error</p>
                <p className="mt-1 break-words text-xs text-muted-foreground">{result.error}</p>
                {onRequestFix && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 h-7 text-xs"
                    onClick={() => {
                      onRequestFix(currentSql, result.error!);
                      onOpenChange(false);
                    }}
                  >
                    Ask Forge to fix
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Results */}
          {result?.success && result.result && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 text-xs">
                  <Clock className="size-3" />
                  {result.durationMs}ms
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {result.result.totalRowCount} row{result.result.totalRowCount !== 1 ? "s" : ""}
                </Badge>
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-xs" onClick={handleExportCsv}>
                  <Download className="size-3" />
                  Export CSV
                </Button>
              </div>

              <div className="max-h-[350px] overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {result.result.columns.map((col) => (
                        <TableHead key={col.name} className="whitespace-nowrap text-xs">
                          <div>
                            {col.name}
                            <span className="ml-1 text-[10px] text-muted-foreground">{col.typeName}</span>
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.result.rows.slice(0, 100).map((row, i) => (
                      <TableRow key={i}>
                        {row.map((cell, j) => (
                          <TableCell key={j} className="max-w-[250px] truncate text-xs">
                            {cell ?? <span className="text-muted-foreground italic">null</span>}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {result.result.totalRowCount > 100 && (
                      <TableRow>
                        <TableCell colSpan={result.result.columns.length} className="text-center text-xs text-muted-foreground">
                          Showing first 100 of {result.result.totalRowCount} rows
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import * as React from "react";
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

interface SqlRunnerProps {
  sql: string;
  onRequestFix?: (sql: string, error: string) => void;
}

export function SqlRunner({ sql, onRequestFix }: SqlRunnerProps) {
  const [currentSql, setCurrentSql] = React.useState(sql);
  const [editing, setEditing] = React.useState(false);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<SqlExecutionResult | null>(null);
  const [copied, setCopied] = React.useState(false);

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
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">SQL Query</p>
        <div className="flex gap-1.5">
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={handleCopy}>
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setEditing(!editing)}>
            {editing ? "Done" : "Edit"}
          </Button>
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={handleRun} disabled={running}>
            {running ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
            {running ? "Running…" : "Run"}
          </Button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={currentSql}
          onChange={(e) => setCurrentSql(e.target.value)}
          className="w-full rounded-md border bg-muted p-3 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          rows={Math.min(20, currentSql.split("\n").length + 2)}
        />
      ) : (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
          <code>{currentSql}</code>
        </pre>
      )}

      {result && !result.success && result.error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-destructive">Execution Error</p>
            <p className="mt-1 break-words text-xs text-muted-foreground">{result.error}</p>
            {onRequestFix && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 h-7 text-xs"
                onClick={() => onRequestFix(currentSql, result.error!)}
              >
                Ask Forge to fix
              </Button>
            )}
          </div>
        </div>
      )}

      {result?.success && result.result && (
        <div className="space-y-2">
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
              CSV
            </Button>
          </div>

          <div className="max-h-[300px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {result.result.columns.map((col) => (
                    <TableHead key={col.name} className="whitespace-nowrap text-xs">
                      {col.name}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.result.rows.slice(0, 100).map((row, i) => (
                  <TableRow key={i}>
                    {row.map((cell, j) => (
                      <TableCell key={j} className="max-w-[200px] truncate text-xs">
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
  );
}

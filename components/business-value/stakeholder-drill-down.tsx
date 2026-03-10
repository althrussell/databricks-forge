"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { Users, Building2, Crown, Check } from "lucide-react";

type ProfileData = {
  id: string;
  role: string;
  department: string;
  useCaseCount: number;
  totalValue: number;
  domains: string[];
  useCaseTypes: Record<string, number>;
  changeComplexity: "low" | "medium" | "high" | null;
  isChampion: boolean;
  isSponsor: boolean;
};

type GroupMode = "role" | "department";

const COMPLEXITY_CONFIG: Record<string, { label: string; className: string }> = {
  low: {
    label: "Low",
    className: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",
  },
  medium: {
    label: "Medium",
    className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30",
  },
  high: {
    label: "High",
    className: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",
  },
};

export function StakeholderDrillDown({ profiles }: { profiles: ProfileData[] }) {
  const [mode, setMode] = useState<GroupMode>("role");

  const sorted = useMemo(() => {
    return [...profiles].sort(
      (a, b) => b.totalValue - a.totalValue || b.useCaseCount - a.useCaseCount,
    );
  }, [profiles]);

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Users className="h-4 w-4 text-primary" />
          Full Stakeholder View
        </h2>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <Button
            variant={mode === "role" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("role")}
          >
            <Users className="mr-1 h-3 w-3" />
            By Role
          </Button>
          <Button
            variant={mode === "department" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("department")}
          >
            <Building2 className="mr-1 h-3 w-3" />
            By Department
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{mode === "role" ? "Role" : "Department"}</TableHead>
                <TableHead>{mode === "role" ? "Department" : "Role"}</TableHead>
                <TableHead className="text-right">Use Cases</TableHead>
                <TableHead className="text-right">Est. Value</TableHead>
                <TableHead>Domains</TableHead>
                <TableHead>Complexity</TableHead>
                <TableHead className="w-20">Champion</TableHead>
                <TableHead className="w-20">Sponsor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    {mode === "role" ? p.role : p.department}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {mode === "role" ? p.department : p.role}
                  </TableCell>
                  <TableCell className="text-right">{p.useCaseCount}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(p.totalValue)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.domains.slice(0, 3).map((d) => (
                        <Badge key={d} variant="secondary" className="text-[10px]">
                          {d}
                        </Badge>
                      ))}
                      {p.domains.length > 3 && (
                        <Badge variant="secondary" className="text-[10px]">
                          +{p.domains.length - 3}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {p.changeComplexity ? (
                      <Badge
                        variant="outline"
                        className={COMPLEXITY_CONFIG[p.changeComplexity]?.className ?? ""}
                      >
                        {COMPLEXITY_CONFIG[p.changeComplexity]?.label ?? p.changeComplexity}
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.isChampion ? (
                      <Crown className="h-4 w-4 text-amber-500" />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.isSponsor ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fadeInUp } from "@/lib/motion";
import { ArrowRight, ClipboardCheck, FlaskConical, ListChecks, Play } from "lucide-react";

interface SpaceBenchmarksTabProps {
  spaceId: string;
  benchmarkCount: number;
}

function StepTile({
  step,
  title,
  description,
  icon: Icon,
}: {
  step: number;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="relative flex items-start gap-3 rounded-xl border bg-card p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary">
        {step}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-semibold">{title}</p>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export function SpaceBenchmarksTab({ spaceId, benchmarkCount }: SpaceBenchmarksTabProps) {
  const hasBenchmarks = benchmarkCount > 0;

  return (
    <motion.div variants={fadeInUp} initial="hidden" animate="visible" className="space-y-6">
      <Card>
        <CardContent className="py-10">
          <div className="mx-auto max-w-xl space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
              <FlaskConical className="size-8 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Benchmark Test Runner</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {hasBenchmarks
                  ? `${benchmarkCount} benchmark question${benchmarkCount !== 1 ? "s" : ""} configured. Run them against Genie to measure accuracy, then iterate to improve results.`
                  : "Add benchmark questions to your Space, run them against Genie, and track accuracy over time."}
              </p>
            </div>

            {!hasBenchmarks && (
              <div className="grid gap-3 text-left md:grid-cols-3">
                <StepTile
                  step={1}
                  icon={ListChecks}
                  title="Add Questions"
                  description="Define test questions with expected answers in your Space configuration."
                />
                <StepTile
                  step={2}
                  icon={Play}
                  title="Run Benchmarks"
                  description="Execute questions against Genie and compare responses to expected answers."
                />
                <StepTile
                  step={3}
                  icon={ClipboardCheck}
                  title="Review Accuracy"
                  description="Analyse pass rates, identify weak spots, and refine your Space to improve results."
                />
              </div>
            )}

            <Button size="lg" asChild>
              <Link href={`/genie/${spaceId}/benchmarks`}>
                <FlaskConical className="mr-2 size-4" />
                Open Test Runner
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

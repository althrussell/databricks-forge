"use client";

import { cn } from "@/lib/utils";
import { PipelineStep, type RunStatus } from "@/lib/domain/types";

const STEPS = [
  { key: PipelineStep.BusinessContext, label: "Business Context", pct: 15 },
  { key: PipelineStep.MetadataExtraction, label: "Metadata Extraction", pct: 30 },
  { key: PipelineStep.TableFiltering, label: "Table Filtering", pct: 45 },
  { key: PipelineStep.UsecaseGeneration, label: "Use Case Generation", pct: 65 },
  { key: PipelineStep.DomainClustering, label: "Domain Clustering", pct: 80 },
  { key: PipelineStep.Scoring, label: "Scoring & Dedup", pct: 100 },
];

interface RunProgressProps {
  currentStep: PipelineStep | null;
  progressPct: number;
  status: RunStatus;
}

export function RunProgress({
  currentStep,
  progressPct,
  status,
}: RunProgressProps) {
  const currentIdx = currentStep
    ? STEPS.findIndex((s) => s.key === currentStep)
    : -1;

  return (
    <div className="space-y-3">
      {STEPS.map((step, idx) => {
        const isCompleted =
          status === "completed" ||
          (currentIdx >= 0 && idx < currentIdx) ||
          (idx === currentIdx && progressPct >= step.pct);
        const isActive = idx === currentIdx && status === "running" && progressPct < step.pct;
        const isFailed = status === "failed" && idx === currentIdx;
        const isPending = !isCompleted && !isActive && !isFailed;

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                isCompleted &&
                  "border-green-500 bg-green-500 text-white",
                isActive &&
                  "border-blue-500 bg-blue-50 text-blue-600 animate-pulse",
                isFailed &&
                  "border-red-500 bg-red-50 text-red-600",
                isPending &&
                  "border-muted-foreground/30 text-muted-foreground/50"
              )}
            >
              {isCompleted ? (
                <CheckIcon />
              ) : isFailed ? (
                <XIcon />
              ) : (
                idx + 1
              )}
            </div>
            <div className="flex-1">
              <p
                className={cn(
                  "text-sm font-medium",
                  isPending && "text-muted-foreground/50",
                  isActive && "text-blue-600",
                  isFailed && "text-red-600"
                )}
              >
                {step.label}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

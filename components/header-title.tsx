"use client";

import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/configure": "New Discovery",
  "/runs": "Pipeline Runs",
  "/runs/compare": "Compare Runs",
  "/environment": "Estate Overview",
  "/benchmarks": "Benchmark Catalog",
  "/outcomes": "Outcome Maps",
  "/outcomes/ingest": "Ingest Outcome Map",
  "/genie": "Genie Spaces",
  "/metadata-genie": "Meta Data Genie",
  "/settings": "Settings",
  "/help": "Help",
};

export function HeaderPageTitle() {
  const pathname = usePathname();

  const title = PAGE_TITLES[pathname] ?? (pathname.startsWith("/runs/") ? "Run Detail" : null);

  if (!title) return null;

  return <span className="hidden text-sm font-semibold text-foreground/80 md:block">{title}</span>;
}

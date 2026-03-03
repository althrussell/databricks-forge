import { listBenchmarkRecords } from "@/lib/lakebase/benchmarks";

interface BenchmarkPack {
  kpis: string[];
  benchmarks: string[];
  advisoryThemes: string[];
  platformBestPractices: string[];
}

const DEFAULT_PACK: BenchmarkPack = {
  kpis: [
    "Value realization speed (time-to-impact)",
    "Adoption rate among target business users",
    "Decision quality uplift from analytics",
  ],
  benchmarks: [
    "Prioritize use cases with explicit measurable outcomes and clear owners.",
    "Prefer modular data products that can support multiple downstream decisions.",
  ],
  advisoryThemes: [
    "Tie each recommendation to executive priorities and operating model constraints.",
    "Avoid generic initiatives without quantified value or implementation path.",
  ],
  platformBestPractices: [
    "Treat customer Unity Catalog metadata as source-of-truth evidence.",
    "Separate factual claims from benchmark priors and label each source explicitly.",
  ],
};

function parseMaturityGuidance(customerMaturity: "nascent" | "developing" | "advanced"): string {
  if (customerMaturity === "nascent") {
    return "Favor low-complexity, fast time-to-value use cases.";
  }
  if (customerMaturity === "advanced") {
    return "Favor scalable, platform-level use cases with reusable assets.";
  }
  return "Balance near-term value with medium-term platform capability.";
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

export async function buildBenchmarkContextPrompt(
  industryId: string | undefined,
  customerMaturity: "nascent" | "developing" | "advanced",
): Promise<string> {
  let records = [] as Awaited<ReturnType<typeof listBenchmarkRecords>>;
  try {
    records = await listBenchmarkRecords({
      lifecycleStatus: "published",
      industry: industryId,
      includeExpired: false,
      limit: 250,
    });
  } catch {
    records = [];
  }

  const pack: BenchmarkPack = {
    kpis: dedupe(records.filter((r) => r.kind === "kpi").map((r) => r.title)).slice(0, 25),
    benchmarks: dedupe(records.filter((r) => r.kind === "benchmark_principle").map((r) => r.summary)).slice(0, 20),
    advisoryThemes: dedupe(records.filter((r) => r.kind === "advisory_theme").map((r) => r.summary)).slice(0, 20),
    platformBestPractices: dedupe(records.filter((r) => r.kind === "platform_best_practice").map((r) => r.summary)).slice(0, 12),
  };

  const effective = {
    kpis: pack.kpis.length > 0 ? pack.kpis : DEFAULT_PACK.kpis,
    benchmarks: pack.benchmarks.length > 0 ? pack.benchmarks : DEFAULT_PACK.benchmarks,
    advisoryThemes: pack.advisoryThemes.length > 0 ? pack.advisoryThemes : DEFAULT_PACK.advisoryThemes,
    platformBestPractices:
      pack.platformBestPractices.length > 0
        ? pack.platformBestPractices
        : DEFAULT_PACK.platformBestPractices,
  };

  return [
    "### BENCHMARK CONTEXT",
    "",
    "Benchmark priors are advisory only; customer metadata remains factual source-of-truth.",
    `Customer maturity: ${customerMaturity}. ${parseMaturityGuidance(customerMaturity)}`,
    "",
    "**Reference KPI lens:**",
    ...effective.kpis.map((k) => `- ${k}`),
    "",
    "**Platform best-practice priorities:**",
    ...effective.platformBestPractices.map((p) => `- ${p}`),
    "",
    "**Advisory benchmark principles:**",
    ...effective.benchmarks.map((b) => `- ${b}`),
    "",
    "**Consulting guidance:**",
    ...effective.advisoryThemes.map((t) => `- ${t}`),
  ].join("\n");
}

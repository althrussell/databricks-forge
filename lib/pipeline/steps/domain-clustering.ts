/**
 * Pipeline Step 5: Domain Clustering
 *
 * Assigns each use case to a business domain and subdomain using ai_query.
 * Optionally merges small domains.
 */

import { executeAIQuery, parseCSVResponse, parseJSONResponse } from "@/lib/ai/agent";
import { updateRunMessage } from "@/lib/lakebase/runs";
import type { PipelineContext, UseCase } from "@/lib/domain/types";

const MIN_CASES_PER_DOMAIN = 3;

export async function runDomainClustering(
  ctx: PipelineContext,
  runId?: string
): Promise<UseCase[]> {
  const { run, useCases } = ctx;
  if (!run.businessContext) throw new Error("Business context not available");
  if (useCases.length === 0) return [];

  const bc = run.businessContext;
  const updatedCases = [...useCases];

  // Step 5a: Assign domains
  if (runId) await updateRunMessage(runId, `Assigning domains to ${updatedCases.length} use cases...`);
  try {
    await assignDomains(updatedCases, run.config.businessName, bc, run.config.aiModel);
  } catch (error) {
    console.error("[domain-clustering] Domain assignment failed:", error);
    // Fallback: assign all to "General"
    updatedCases.forEach((uc) => {
      uc.domain = "General";
    });
  }

  // Step 5b: Assign subdomains per domain
  const domains = [...new Set(updatedCases.map((uc) => uc.domain))];
  for (let di = 0; di < domains.length; di++) {
    const domain = domains[di];
    const domainCases = updatedCases.filter((uc) => uc.domain === domain);
    if (domainCases.length < 2) continue;

    if (runId) await updateRunMessage(runId, `Assigning subdomains for domain: ${domain} (${di + 1}/${domains.length})...`);
    try {
      await assignSubdomains(domainCases, domain, run.config.businessName, bc, run.config.aiModel);
    } catch (error) {
      console.warn(
        `[domain-clustering] Subdomain assignment failed for ${domain}:`,
        error
      );
      domainCases.forEach((uc) => {
        uc.subdomain = "General";
      });
    }
  }

  // Step 5c: Merge small domains
  const smallDomainCount = Object.entries(
    updatedCases.reduce<Record<string, number>>((acc, uc) => {
      acc[uc.domain] = (acc[uc.domain] ?? 0) + 1;
      return acc;
    }, {})
  ).filter(([, count]) => count < MIN_CASES_PER_DOMAIN).length;

  if (smallDomainCount > 0 && runId) {
    await updateRunMessage(runId, `Merging ${smallDomainCount} small domains...`);
  }
  try {
    await mergeSmallDomains(updatedCases, run.config.aiModel);
  } catch (error) {
    console.warn("[domain-clustering] Domain merge failed:", error);
  }

  const finalDomainCount = [...new Set(updatedCases.map((uc) => uc.domain))].length;
  if (runId) await updateRunMessage(runId, `Organised into ${finalDomainCount} domains`);

  console.log(
    `[domain-clustering] Assigned ${finalDomainCount} domains`
  );

  return updatedCases;
}

async function assignDomains(
  useCases: UseCase[],
  businessName: string,
  businessContext: { industries: string },
  aiModel: string
): Promise<void> {
  const useCasesCsv = useCases
    .map(
      (uc) =>
        `${uc.useCaseNo}, "${uc.name}", "${uc.type}", "${uc.statement}"`
    )
    .join("\n");

  const result = await executeAIQuery({
    promptKey: "DOMAIN_FINDER_PROMPT",
    variables: {
      business_name: businessName,
      industries: businessContext.industries,
      business_context: JSON.stringify(businessContext),
      use_cases_csv: useCasesCsv,
      previous_violations: "None",
      output_language: "English",
    },
    modelEndpoint: aiModel,
    maxTokens: 4096,
  });

  // CSV: No, Domain
  const rows = parseCSVResponse(result.rawResponse, 2);
  const domainMap = new Map<number, string>();
  for (const row of rows) {
    const no = parseInt(row[0], 10);
    const domain = row[1]?.trim();
    if (!isNaN(no) && domain) {
      domainMap.set(no, domain);
    }
  }

  for (const uc of useCases) {
    uc.domain = domainMap.get(uc.useCaseNo) ?? "General";
  }
}

async function assignSubdomains(
  domainCases: UseCase[],
  domainName: string,
  businessName: string,
  businessContext: { industries: string },
  aiModel: string
): Promise<void> {
  const useCasesCsv = domainCases
    .map(
      (uc) =>
        `${uc.useCaseNo}, "${uc.name}", "${uc.type}", "${uc.statement}"`
    )
    .join("\n");

  const result = await executeAIQuery({
    promptKey: "SUBDOMAIN_DETECTOR_PROMPT",
    variables: {
      domain_name: domainName,
      business_name: businessName,
      industries: businessContext.industries,
      business_context: JSON.stringify(businessContext),
      use_cases_csv: useCasesCsv,
      previous_violations: "None",
      output_language: "English",
    },
    modelEndpoint: aiModel,
    maxTokens: 4096,
  });

  // CSV: No, Subdomain
  const rows = parseCSVResponse(result.rawResponse, 2);
  const subdomainMap = new Map<number, string>();
  for (const row of rows) {
    const no = parseInt(row[0], 10);
    const subdomain = row[1]?.trim();
    if (!isNaN(no) && subdomain) {
      subdomainMap.set(no, subdomain);
    }
  }

  for (const uc of domainCases) {
    uc.subdomain = subdomainMap.get(uc.useCaseNo) ?? "General";
  }
}

async function mergeSmallDomains(
  useCases: UseCase[],
  aiModel: string
): Promise<void> {
  const domainCounts: Record<string, number> = {};
  for (const uc of useCases) {
    domainCounts[uc.domain] = (domainCounts[uc.domain] ?? 0) + 1;
  }

  const smallDomains = Object.entries(domainCounts)
    .filter(([, count]) => count < MIN_CASES_PER_DOMAIN)
    .map(([name]) => name);

  if (smallDomains.length === 0) return;

  const domainInfoStr = Object.entries(domainCounts)
    .map(([name, count]) => `${name}: ${count} use cases`)
    .join("\n");

  try {
    const result = await executeAIQuery({
      promptKey: "DOMAINS_MERGER_PROMPT",
      variables: {
        min_cases_per_domain: String(MIN_CASES_PER_DOMAIN),
        domain_info_str: domainInfoStr,
      },
      modelEndpoint: aiModel,
      maxTokens: 2048,
    });

    const mergeMap = parseJSONResponse<Record<string, string>>(
      result.rawResponse
    );

    for (const uc of useCases) {
      if (mergeMap[uc.domain]) {
        uc.domain = mergeMap[uc.domain];
      }
    }
  } catch (error) {
    console.warn("[domain-clustering] Merge parsing failed:", error);
  }
}

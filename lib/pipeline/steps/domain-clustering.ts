/**
 * Pipeline Step 5: Domain Clustering
 *
 * Assigns each use case to a business domain and subdomain using Model
 * Serving (JSON mode). Optionally merges small domains.
 */

import { executeAIQuery, parseJSONResponse } from "@/lib/ai/agent";
import { updateRunMessage } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";
import {
  DomainAssignmentSchema,
  SubdomainAssignmentSchema,
  validateLLMArray,
} from "@/lib/validation";
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
    await assignDomains(updatedCases, run.config.businessName, bc, run.config.aiModel, runId);
  } catch (error) {
    logger.error("Domain assignment failed", { error: error instanceof Error ? error.message : String(error) });
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
      await assignSubdomains(domainCases, domain, run.config.businessName, bc, run.config.aiModel, runId);
    } catch (error) {
      logger.warn("Subdomain assignment failed", { domain, error: error instanceof Error ? error.message : String(error) });
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
    await mergeSmallDomains(updatedCases, run.config.aiModel, runId);
  } catch (error) {
    logger.warn("Domain merge failed", { error: error instanceof Error ? error.message : String(error) });
  }

  const finalDomainCount = [...new Set(updatedCases.map((uc) => uc.domain))].length;
  if (runId) await updateRunMessage(runId, `Organised into ${finalDomainCount} domains`);

  logger.info("Domain clustering complete", { domainCount: finalDomainCount });

  return updatedCases;
}

async function assignDomains(
  useCases: UseCase[],
  businessName: string,
  businessContext: { industries: string },
  aiModel: string,
  runId?: string
): Promise<void> {
  const useCasesCsv = useCases
    .map(
      (uc) =>
        `${uc.useCaseNo}, "${uc.name}", "${uc.type}", "${uc.statement}"`
    )
    .join("\n");

  const targetDomainCount = Math.max(3, Math.min(25, Math.round(useCases.length / 10)));

  const result = await executeAIQuery({
    promptKey: "DOMAIN_FINDER_PROMPT",
    variables: {
      business_name: businessName,
      industries: businessContext.industries,
      business_context: JSON.stringify(businessContext),
      use_cases_csv: useCasesCsv,
      previous_violations: "None",
      output_language: "English",
      target_domain_count: String(targetDomainCount),
    },
    modelEndpoint: aiModel,
    responseFormat: "json_object",
    runId,
    step: "domain-clustering",
  });

  let rawItems: unknown[];
  try {
    rawItems = parseJSONResponse<unknown[]>(result.rawResponse);
  } catch (parseErr) {
    logger.warn("Failed to parse domain assignment JSON", {
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    useCases.forEach((uc) => { uc.domain = "General"; });
    return;
  }

  const items = validateLLMArray(rawItems, DomainAssignmentSchema, "assignDomains");
  const domainMap = new Map<number, string>();
  for (const item of items) {
    if (!isNaN(item.no) && item.domain) {
      domainMap.set(item.no, item.domain.trim());
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
  aiModel: string,
  runId?: string
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
    responseFormat: "json_object",
    runId,
    step: "domain-clustering",
  });

  let rawItems: unknown[];
  try {
    rawItems = parseJSONResponse<unknown[]>(result.rawResponse);
  } catch (parseErr) {
    logger.warn("Failed to parse subdomain assignment JSON", {
      domain: domainName,
      error: parseErr instanceof Error ? parseErr.message : String(parseErr),
    });
    domainCases.forEach((uc) => { uc.subdomain = "General"; });
    return;
  }

  const items = validateLLMArray(rawItems, SubdomainAssignmentSchema, "assignSubdomains");
  const subdomainMap = new Map<number, string>();
  for (const item of items) {
    if (!isNaN(item.no) && item.subdomain) {
      subdomainMap.set(item.no, item.subdomain.trim());
    }
  }

  // Post-processing: merge single-item subdomains into nearest sibling
  const subdomainCounts = new Map<string, number>();
  for (const sd of subdomainMap.values()) {
    subdomainCounts.set(sd, (subdomainCounts.get(sd) ?? 0) + 1);
  }

  const singleItemSubdomains = new Set(
    [...subdomainCounts.entries()]
      .filter(([, count]) => count < 2)
      .map(([name]) => name)
  );

  if (singleItemSubdomains.size > 0) {
    // Find the largest subdomain as the merge target
    const largestSubdomain = [...subdomainCounts.entries()]
      .filter(([name]) => !singleItemSubdomains.has(name))
      .sort(([, a], [, b]) => b - a)[0]?.[0] ?? "General";

    for (const [no, sd] of subdomainMap.entries()) {
      if (singleItemSubdomains.has(sd)) {
        subdomainMap.set(no, largestSubdomain);
      }
    }
  }

  for (const uc of domainCases) {
    uc.subdomain = subdomainMap.get(uc.useCaseNo) ?? "General";
  }
}

async function mergeSmallDomains(
  useCases: UseCase[],
  aiModel: string,
  runId?: string
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
      responseFormat: "json_object",
      runId,
      step: "domain-clustering",
    });

    let mergeMap: Record<string, string>;
    try {
      mergeMap = parseJSONResponse<Record<string, string>>(result.rawResponse);
    } catch (parseErr) {
      logger.warn("Failed to parse domain merge JSON", {
        error: parseErr instanceof Error ? parseErr.message : String(parseErr),
      });
      return;
    }

    for (const uc of useCases) {
      if (mergeMap[uc.domain]) {
        uc.domain = mergeMap[uc.domain];
      }
    }
  } catch (error) {
    logger.warn("Domain merge failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

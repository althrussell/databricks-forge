/**
 * Metric View dependency validation for Genie space and dashboard deployment.
 *
 * Before deploying a Genie space or dashboard that references metric views,
 * this module checks whether all required metric views are deployed in Unity
 * Catalog. If any are missing but have proposals in the ForgeMetricViewProposal
 * table, it can auto-deploy them.
 */

import { executeSQL } from "@/lib/dbx/sql";
import {
  findMetricViewProposalsByFqn,
  updateDeploymentStatus,
} from "@/lib/lakebase/metric-view-proposals";
import { deployAsset } from "./deploy";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DependencyCheckResult {
  allDeployed: boolean;
  missing: Array<{
    name: string;
    fqn: string;
    proposalId?: string;
    ddl?: string;
  }>;
  deployed: string[];
}

export interface DeployDependenciesResult {
  deployed: string[];
  failed: Array<{ fqn: string; error: string }>;
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

/**
 * Check whether the required metric view FQNs are deployed in Unity Catalog.
 * For any missing, check if a proposal exists in the ForgeMetricViewProposal
 * table that could be auto-deployed.
 */
export async function checkMetricViewDependencies(
  requiredFqns: string[],
): Promise<DependencyCheckResult> {
  if (requiredFqns.length === 0) {
    return { allDeployed: true, missing: [], deployed: [] };
  }

  const deployed: string[] = [];
  const missingFqns: string[] = [];

  // Check each FQN via DESCRIBE TABLE (lightweight probe)
  for (const fqn of requiredFqns) {
    try {
      await executeSQL(`DESCRIBE TABLE ${fqn}`);
      deployed.push(fqn);
    } catch {
      missingFqns.push(fqn);
    }
  }

  if (missingFqns.length === 0) {
    return { allDeployed: true, missing: [], deployed };
  }

  // Look up proposals for missing FQNs
  const proposals = await findMetricViewProposalsByFqn(missingFqns);
  const proposalByName = new Map(proposals.map((p) => [p.name.toLowerCase(), p]));

  const missing = missingFqns.map((fqn) => {
    const name = fqn.split(".").pop()?.toLowerCase() ?? fqn;
    const proposal = proposalByName.get(name);
    return {
      name: proposal?.name ?? name,
      fqn,
      proposalId: proposal?.id,
      ddl: proposal?.ddl,
    };
  });

  return {
    allDeployed: false,
    missing,
    deployed,
  };
}

// ---------------------------------------------------------------------------
// Auto-deploy
// ---------------------------------------------------------------------------

/**
 * Deploy missing metric views that have proposals with DDL available.
 * Skips any that don't have a proposal or whose DDL is missing.
 */
export async function ensureMetricViewsDeployed(
  requiredFqns: string[],
  targetSchema?: string | undefined,
): Promise<DeployDependenciesResult> {
  const check = await checkMetricViewDependencies(requiredFqns);

  if (check.allDeployed) {
    return { deployed: check.deployed, failed: [] };
  }

  const deployed = [...check.deployed];
  const failed: Array<{ fqn: string; error: string }> = [];

  for (const mv of check.missing) {
    if (!mv.ddl) {
      failed.push({ fqn: mv.fqn, error: "No DDL available — proposal not found" });
      continue;
    }

    try {
      // Derive schema from the FQN if no explicit target is provided
      const schema = targetSchema ?? mv.fqn.split(".").slice(0, 2).join(".");
      const result = await deployAsset({ name: mv.name, ddl: mv.ddl }, schema);

      if (result.deployed) {
        deployed.push(result.fqn);
        if (mv.proposalId) {
          await updateDeploymentStatus(mv.proposalId, "deployed", result.fqn);
        }
        logger.info("Auto-deployed missing metric view dependency", { fqn: result.fqn });
      } else {
        const errorMsg = result.error ?? "Deploy returned false";
        failed.push({ fqn: mv.fqn, error: errorMsg });
        if (mv.proposalId) {
          await updateDeploymentStatus(mv.proposalId, "failed");
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      failed.push({ fqn: mv.fqn, error: errorMsg });
      logger.warn("Failed to auto-deploy metric view dependency", {
        fqn: mv.fqn,
        error: errorMsg,
      });
    }
  }

  return { deployed, failed };
}

// ---------------------------------------------------------------------------
// FQN extraction helpers
// ---------------------------------------------------------------------------

/**
 * Extract metric view FQNs referenced in a serialized space JSON.
 * Looks in data_sources.metric_views for identifiers.
 */
export function extractMetricViewFqnsFromSpace(serializedSpaceJson: string): string[] {
  try {
    const space = JSON.parse(serializedSpaceJson);
    const mvs = space?.data_sources?.metric_views;
    if (!Array.isArray(mvs)) return [];
    return mvs
      .map((mv: { identifier?: string }) => mv.identifier)
      .filter((id: unknown): id is string => typeof id === "string" && id.split(".").length >= 3);
  } catch {
    return [];
  }
}

/**
 * Extract metric view FQNs referenced in dashboard dataset SQL.
 * Looks for FROM / JOIN clauses referencing known metric view patterns.
 */
export function extractMetricViewFqnsFromSql(sql: string, knownMvFqns: string[]): string[] {
  if (knownMvFqns.length === 0) return [];

  const lowerSql = sql.toLowerCase();
  return knownMvFqns.filter((fqn) => lowerSql.includes(fqn.toLowerCase()));
}

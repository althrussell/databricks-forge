/**
 * API: /api/metric-views/[id]/repair
 *
 * POST -- Repair a single metric view proposal by re-running auto-fixes,
 * validation, and (if needed) LLM repair with the run's cached metadata.
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import {
  getMetricViewProposalById,
  updateMetricViewProposal,
  updateDeploymentStatus,
} from "@/lib/lakebase/metric-view-proposals";
import { loadMetadataForRun } from "@/lib/lakebase/metadata-cache";
import {
  buildSchemaAllowlist,
  buildSchemaContextBlock,
  buildCompactColumnsBlock,
} from "@/lib/genie/schema-allowlist";
import {
  validateMetricViewYaml,
  nestSnowflakeJoins,
  qualifyNestedAliasRefs,
  autoRenameCollidingJoinAliases,
  autoRenameShadowedMeasures,
  repairProposal,
  hasColumnErrors,
} from "@/lib/genie/passes/metric-view-proposals";
import { executeSQL } from "@/lib/dbx/sql";
import { getServingEndpoint } from "@/lib/dbx/client";
import { logger } from "@/lib/logger";

const PERMISSION_PATTERNS = [
  "PERMISSION_DENIED",
  "does not have CREATE",
  "Access denied",
  "INSUFFICIENT_PRIVILEGES",
];

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const proposal = await getMetricViewProposalById(id);
    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    if (!proposal.runId) {
      return NextResponse.json(
        { error: "Cannot repair a standalone proposal (no run metadata available)" },
        { status: 400 },
      );
    }

    const metadata = await loadMetadataForRun(proposal.runId);
    if (!metadata) {
      return NextResponse.json(
        { error: "Metadata cache not found for this run. Cannot rebuild schema context." },
        { status: 404 },
      );
    }

    const allowlist = buildSchemaAllowlist(metadata);
    const tableFqns =
      proposal.sourceTables.length > 0 ? proposal.sourceTables : metadata.tables.map((t) => t.fqn);
    const schemaBlock = buildSchemaContextBlock(metadata, tableFqns);
    const columnsBlock = buildCompactColumnsBlock(metadata, tableFqns);

    // Step 1: Run deterministic auto-fixes on current YAML/DDL
    let yaml = nestSnowflakeJoins(proposal.yaml);
    let ddl = nestSnowflakeJoins(proposal.ddl);

    yaml = qualifyNestedAliasRefs(yaml);
    ddl = qualifyNestedAliasRefs(ddl);

    const aliasCollision = autoRenameCollidingJoinAliases(yaml, ddl, allowlist);
    yaml = aliasCollision.yaml;
    ddl = aliasCollision.ddl;

    const shadowFix = autoRenameShadowedMeasures(yaml, ddl, allowlist);
    yaml = shadowFix.yaml;
    ddl = shadowFix.ddl;

    // Step 2: Validate after auto-fixes
    let validation = validateMetricViewYaml(yaml, ddl, allowlist);

    // Step 3: If still errored with column issues, attempt LLM repair
    if (validation.status === "error" && hasColumnErrors(validation.issues)) {
      logger.info("Repair: attempting LLM repair for metric view", {
        id,
        name: proposal.name,
        issues: validation.issues,
      });

      const endpoint = getServingEndpoint();
      const repaired = await repairProposal(
        {
          name: proposal.name,
          description: proposal.description ?? "",
          yaml,
          ddl,
          sourceTables: proposal.sourceTables,
          hasJoins: proposal.hasJoins,
          hasFilteredMeasures: false,
          hasWindowMeasures: false,
          hasMaterialization: false,
          validationStatus: validation.status,
          validationIssues: validation.issues,
        },
        schemaBlock,
        columnsBlock,
        endpoint,
      );

      if (repaired) {
        yaml = nestSnowflakeJoins(repaired.yaml);
        ddl = nestSnowflakeJoins(repaired.ddl);
        yaml = qualifyNestedAliasRefs(yaml);
        ddl = qualifyNestedAliasRefs(ddl);

        const reAliasCollision = autoRenameCollidingJoinAliases(yaml, ddl, allowlist);
        yaml = reAliasCollision.yaml;
        ddl = reAliasCollision.ddl;

        const reShadow = autoRenameShadowedMeasures(yaml, ddl, allowlist);
        yaml = reShadow.yaml;
        ddl = reShadow.ddl;

        validation = validateMetricViewYaml(yaml, ddl, allowlist);
      }
    }

    // Step 4: Dry-run DDL for non-error proposals
    if (validation.status !== "error") {
      try {
        await executeSQL(ddl);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isPermission = PERMISSION_PATTERNS.some((p) => msg.includes(p));

        if (isPermission) {
          if (validation.status !== "warning") validation.status = "warning";
          validation.issues.push(
            "Could not pre-validate — no CREATE permission on source schema. Deploy to a schema you own.",
          );
        } else {
          validation.status = "error";
          validation.issues.push(`SQL validation failed: ${msg}`);
        }
      }
    }

    // Step 5: Persist the repaired proposal
    await updateMetricViewProposal(id, {
      yaml,
      ddl,
      validationStatus: validation.status,
      validationIssues: validation.issues,
    });

    if (proposal.deploymentStatus === "failed") {
      await updateDeploymentStatus(id, "proposed");
    }

    const repaired = validation.status !== "error";
    logger.info("Metric view repair completed", {
      id,
      name: proposal.name,
      repaired,
      newStatus: validation.status,
      issueCount: validation.issues.length,
    });

    const updated = await getMetricViewProposalById(id);

    return NextResponse.json({ repaired, proposal: updated });
  } catch (err) {
    logger.error("Metric view repair endpoint error", { error: safeErrorMessage(err) });
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

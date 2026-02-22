/**
 * API: /api/runs/[runId]/genie-deploy
 *
 * POST -- Orchestrates the full Genie deployment flow:
 *   1. Rewrite metric view / function DDLs to the chosen target schema
 *   2. Execute each DDL via SQL Statement Execution API
 *   3. Patch each domain's serializedSpace to include the deployed assets
 *   4. Create Genie spaces via the Databricks API
 *   5. Track each space in Lakebase
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import { executeSQL } from "@/lib/dbx/sql";
import { createGenieSpace } from "@/lib/dbx/genie";
import { trackGenieSpaceCreated } from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

interface DeployAsset {
  name: string;
  ddl: string;
  description?: string;
}

interface DomainDeployRequest {
  domain: string;
  title: string;
  description: string;
  serializedSpace: string;
  metricViews: DeployAsset[];
  functions: DeployAsset[];
}

interface RequestBody {
  domains: DomainDeployRequest[];
  targetSchema: string; // "catalog.schema"
}

interface AssetResult {
  name: string;
  type: "metric_view" | "function";
  success: boolean;
  error?: string;
  fqn?: string;
}

interface DomainResult {
  domain: string;
  assets: AssetResult[];
  spaceId?: string;
  spaceError?: string;
}

// ---------------------------------------------------------------------------
// DDL rewriting & sanitization
// ---------------------------------------------------------------------------

/**
 * Strip 4-part FQN column prefixes (catalog.schema.table.column -> column)
 * from a SQL/YAML expression string.
 */
function stripFqnPrefixes(sql: string): string {
  return sql.replace(
    /\b[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*\.([a-zA-Z_]\w*)\b/g,
    "$1"
  );
}

/**
 * Rewrite the target FQN in a CREATE statement to use a different
 * catalog.schema while preserving the object name.
 *
 * Handles:
 *   CREATE [OR REPLACE] VIEW catalog.schema.name ...
 *   CREATE [OR REPLACE] FUNCTION catalog.schema.name ...
 */
function rewriteDdlTarget(ddl: string, targetSchema: string): string {
  return ddl.replace(
    /(CREATE\s+(?:OR\s+REPLACE\s+)?(?:VIEW|FUNCTION)\s+)(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i,
    (_match, prefix: string, fqn: string) => {
      const parts = fqn.replace(/`/g, "").split(".");
      const objectName = parts[parts.length - 1];
      return `${prefix}${targetSchema}.${objectName}`;
    }
  );
}

/**
 * Fix ambiguous join `on:` clauses by qualifying bare column names with `source.`.
 * E.g. `on: customerID = customer.customerID` -> `on: source.customerID = customer.customerID`
 *
 * A bare column is one that appears without a dot prefix on the left side of `=`.
 */
function qualifyJoinCriteria(onExpr: string): string {
  return onExpr.replace(
    /^(\s*)(\b[a-zA-Z_]\w*\b)\s*=\s*(\b[a-zA-Z_]\w*\b)\.(\b[a-zA-Z_]\w*\b)\s*$/,
    "$1source.$2 = $3.$4"
  );
}

/**
 * Remove window: blocks from YAML measures. The window spec is experimental
 * and the YAML parser frequently rejects LLM-generated window structures.
 * Handles both inline `window: {...}` and multi-line indented blocks.
 */
function stripWindowBlocks(ddl: string): string {
  const lines = ddl.split("\n");
  const result: string[] = [];
  let skipIndent = -1;

  for (const line of lines) {
    if (skipIndent >= 0) {
      const indent = line.search(/\S/);
      if (indent > skipIndent || (indent === -1 && line.trim() === "")) {
        continue;
      }
      skipIndent = -1;
    }

    if (/^\s*window:\s*/.test(line)) {
      const windowIndent = line.search(/\S/);
      const afterColon = line.replace(/^\s*window:\s*/, "").trim();
      if (afterColon && !afterColon.startsWith("{")) {
        // single-line window value -- skip this line only
        continue;
      }
      // multi-line block or inline object -- skip until dedent
      skipIndent = windowIndent;
      continue;
    }

    result.push(line);
  }

  return result.join("\n");
}

/**
 * Sanitize a metric view DDL before execution:
 * 1. Strip FQN column prefixes from expr: and on: lines
 * 2. Remove `comment:` lines (unsupported by Databricks YAML parser)
 * 3. Qualify ambiguous join criteria with `source.` prefix
 * 4. Strip window: blocks (experimental, frequently malformed)
 */
function sanitizeMetricViewDdl(ddl: string): string {
  let result = ddl
    .replace(
      /^(\s*(?:expr|on):\s*)(.+)$/gm,
      (_match, prefix: string, rest: string) => prefix + stripFqnPrefixes(rest)
    )
    .replace(/^\s*comment:\s*"[^"]*"\s*$/gm, "")
    .replace(/^\s*comment:\s*'[^']*'\s*$/gm, "")
    .replace(/^\s*comment:\s*[^\n]+$/gm, "");

  // Fix ambiguous join on: clauses
  result = result.replace(
    /^(\s*on:\s*)(.+)$/gm,
    (_match, prefix: string, expr: string) => prefix + qualifyJoinCriteria(expr).trim()
  );

  // Remove window blocks that the YAML parser rejects
  result = stripWindowBlocks(result);

  return result;
}

/**
 * Extract the object name from a CREATE DDL (last segment of the FQN).
 */
function extractObjectName(ddl: string): string | null {
  const match = ddl.match(
    /(?:CREATE\s+(?:OR\s+REPLACE\s+)?(?:VIEW|FUNCTION)\s+)(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i
  );
  if (!match) return null;
  const parts = match[1].replace(/`/g, "").split(".");
  return parts[parts.length - 1];
}

// ---------------------------------------------------------------------------
// Space patching
// ---------------------------------------------------------------------------

function patchSerializedSpace(
  spaceJson: string,
  deployedMetricViews: { fqn: string; description?: string }[],
  deployedFunctions: { fqn: string }[],
): string {
  const space = JSON.parse(spaceJson) as Record<string, unknown>;
  const dataSources = (space.data_sources ?? {}) as Record<string, unknown>;
  const instructions = (space.instructions ?? {}) as Record<string, unknown>;

  // Patch metric_views into data_sources
  if (deployedMetricViews.length > 0) {
    const existing = (dataSources.metric_views ?? []) as Array<{
      identifier: string;
      description?: string[];
    }>;
    for (const mv of deployedMetricViews) {
      const already = existing.some(
        (e) => e.identifier.toLowerCase() === mv.fqn.toLowerCase()
      );
      if (!already) {
        existing.push({
          identifier: mv.fqn,
          ...(mv.description ? { description: [mv.description] } : {}),
        });
      }
    }
    dataSources.metric_views = existing.sort((a, b) =>
      a.identifier.localeCompare(b.identifier)
    );
  }

  // Patch sql_functions into instructions
  if (deployedFunctions.length > 0) {
    const existing = (instructions.sql_functions ?? []) as Array<{
      id: string;
      identifier: string;
    }>;
    for (const fn of deployedFunctions) {
      const already = existing.some(
        (e) => e.identifier.toLowerCase() === fn.fqn.toLowerCase()
      );
      if (!already) {
        existing.push({
          id: uuidv4().replace(/-/g, ""),
          identifier: fn.fqn,
        });
      }
    }
    instructions.sql_functions = existing;
  }

  space.data_sources = dataSources;
  space.instructions = instructions;
  return JSON.stringify(space);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  try {
    const body = (await request.json()) as RequestBody;

    if (!body.domains || !Array.isArray(body.domains) || body.domains.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: domains" },
        { status: 400 }
      );
    }

    if (!body.targetSchema || body.targetSchema.split(".").length !== 2) {
      return NextResponse.json(
        { error: "targetSchema must be in catalog.schema format" },
        { status: 400 }
      );
    }

    const config = getConfig();
    const results: DomainResult[] = [];

    for (const domainReq of body.domains) {
      const assets: AssetResult[] = [];
      const deployedMvs: { fqn: string; description?: string }[] = [];
      const deployedFns: { fqn: string }[] = [];

      // 1. Deploy metric views
      for (const mv of domainReq.metricViews) {
        try {
          const rewritten = sanitizeMetricViewDdl(
            rewriteDdlTarget(mv.ddl, body.targetSchema)
          );
          const objectName = extractObjectName(rewritten) ?? mv.name;
          const fqn = `${body.targetSchema}.${objectName}`;

          await executeSQL(rewritten);

          // Grant broad access so the Genie service can validate and query
          // the metric view. The Genie API uses a separate internal identity
          // to verify table access, so the creating SP's ownership isn't enough.
          for (const grant of [
            `GRANT ALL PRIVILEGES ON TABLE ${fqn} TO \`account users\``,
            `GRANT SELECT ON TABLE ${fqn} TO \`account users\``,
          ]) {
            try {
              await executeSQL(grant);
              logger.info("GRANT succeeded on metric view", { fqn, grant });
              break;
            } catch (grantErr) {
              logger.warn("GRANT attempt on metric view failed", {
                fqn,
                grant,
                error: grantErr instanceof Error ? grantErr.message : String(grantErr),
              });
            }
          }

          deployedMvs.push({ fqn, description: mv.description });
          assets.push({ name: mv.name, type: "metric_view", success: true, fqn });

          logger.info("Metric view deployed", { runId, domain: domainReq.domain, fqn });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          assets.push({ name: mv.name, type: "metric_view", success: false, error: msg });
          logger.warn("Metric view deployment failed", { name: mv.name, error: msg });
        }
      }

      // 2. Deploy functions
      for (const fn of domainReq.functions) {
        try {
          const rewritten = rewriteDdlTarget(fn.ddl, body.targetSchema);
          const objectName = extractObjectName(rewritten) ?? fn.name;
          const fqn = `${body.targetSchema}.${objectName}`;

          await executeSQL(rewritten);

          // Grant EXECUTE so the Genie service can invoke the function
          for (const grant of [
            `GRANT ALL PRIVILEGES ON FUNCTION ${fqn} TO \`account users\``,
            `GRANT EXECUTE ON FUNCTION ${fqn} TO \`account users\``,
          ]) {
            try {
              await executeSQL(grant);
              logger.info("GRANT succeeded on function", { fqn, grant });
              break;
            } catch (grantErr) {
              logger.warn("GRANT attempt on function failed", {
                fqn,
                grant,
                error: grantErr instanceof Error ? grantErr.message : String(grantErr),
              });
            }
          }

          deployedFns.push({ fqn });
          assets.push({ name: fn.name, type: "function", success: true, fqn });

          logger.info("Function deployed", { runId, domain: domainReq.domain, fqn });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          assets.push({ name: fn.name, type: "function", success: false, error: msg });
          logger.warn("Function deployment failed", { name: fn.name, error: msg });
        }
      }

      // 3. Patch serialized space with deployed assets
      const patchedSpace = patchSerializedSpace(
        domainReq.serializedSpace,
        deployedMvs,
        deployedFns,
      );

      // 4. Create Genie space
      try {
        const result = await createGenieSpace({
          title: domainReq.title,
          description: domainReq.description || "",
          serializedSpace: patchedSpace,
          warehouseId: config.warehouseId,
        });

        // 5. Track in Lakebase
        const trackingId = uuidv4();
        await trackGenieSpaceCreated(
          trackingId,
          result.space_id,
          runId,
          domainReq.domain,
          domainReq.title,
        );

        results.push({
          domain: domainReq.domain,
          assets,
          spaceId: result.space_id,
        });

        logger.info("Genie space deployed with assets", {
          runId,
          domain: domainReq.domain,
          spaceId: result.space_id,
          metricViews: deployedMvs.length,
          functions: deployedFns.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          domain: domainReq.domain,
          assets,
          spaceError: msg,
        });
        logger.error("Genie space creation failed during deploy", {
          domain: domainReq.domain,
          error: msg,
        });
      }
    }

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Genie deploy failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

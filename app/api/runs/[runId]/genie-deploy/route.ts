/**
 * API: /api/runs/[runId]/genie-deploy
 *
 * POST -- Orchestrates the full Genie deployment flow:
 *   1. Validate pre-existing metric views from metadata
 *   2. Rewrite metric view / function DDLs to the chosen target schema
 *   3. Execute each DDL (with auto-fix for common errors)
 *   4. Prepare a clean serializedSpace: strip undeployed/failed refs, add deployed FQNs
 *   5. Create or update Genie spaces via the Databricks API
 *   6. Track each space in Lakebase
 */

import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getConfig } from "@/lib/dbx/client";
import { executeSQL } from "@/lib/dbx/sql";
import { createGenieSpace, updateGenieSpace } from "@/lib/dbx/genie";
import {
  trackGenieSpaceCreated,
  trackGenieSpaceUpdated as trackSpaceUpdated,
} from "@/lib/lakebase/genie-spaces";
import { logger } from "@/lib/logger";
import { isSafeId, validateFqn } from "@/lib/validation";

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
  existingSpaceId?: string;
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
  autoFixed?: boolean;
  errorCategory?: string;
}

interface StrippedRef {
  type: "metric_view" | "function";
  identifier: string;
  reason: string;
}

interface DomainResult {
  domain: string;
  assets: AssetResult[];
  spaceId?: string;
  spaceError?: string;
  orphanedAssets?: { functions: string[]; metricViews: string[] };
  patchedSpace?: string;
  strippedRefs?: StrippedRef[];
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

const AI_FUNCTION_PATTERN = /\b(?:ai_analyze_sentiment|ai_classify|ai_extract|ai_gen|ai_query|ai_similarity|ai_forecast|ai_summarize)\s*\(/i;

/**
 * Sanitize a metric view DDL before execution:
 * 1. Strip FQN column prefixes from expr: and on: lines
 * 2. Remove `comment:` lines (unsupported by Databricks YAML parser)
 * 3. Qualify ambiguous join criteria with `source.` prefix
 * 4. Strip window: blocks (experimental, frequently malformed)
 * 5. Strip dimension/measure entries that use AI functions (non-deterministic, expensive)
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

  // Strip dimension/measure entries containing AI functions
  result = stripAiFunctionEntries(result);

  return result;
}

/**
 * Remove YAML dimension/measure entries whose expr: contains an AI function.
 * Matches a `- name: ...` line followed by an `expr: ...` line that includes
 * a prohibited AI function call, and removes both lines.
 */
function stripAiFunctionEntries(ddl: string): string {
  return ddl.replace(
    /^(\s*- name:\s*.+\n)(\s*expr:\s*.+)$/gm,
    (_match, nameLine: string, exprLine: string) => {
      if (AI_FUNCTION_PATTERN.test(exprLine)) {
        logger.warn("Stripping metric view entry with AI function", {
          entry: exprLine.trim(),
        });
        return "";
      }
      return nameLine + exprLine;
    }
  );
}

/**
 * Parameter types that the Genie Spaces certified answer API does not
 * support.  These must be rewritten to STRING; the function body should
 * CAST from STRING internally.
 */
const UNSUPPORTED_PARAM_TYPES = /\b(DATE|TIMESTAMP|TIMESTAMP_NTZ|TIMESTAMP_LTZ|INTERVAL|BINARY|ARRAY|MAP|STRUCT)\b/gi;

/**
 * Sanitize a function DDL before execution:
 * 1. Fix doubled single quotes that the LLM generates as if the body
 *    were inside a SQL string literal (''month'' -> 'month').
 * 2. Rewrite unsupported parameter types (DATE, TIMESTAMP, etc.) to STRING
 *    so Genie can introspect the function without rejecting it.
 * 3. Add OR REPLACE if missing (idempotent creation).
 */
function sanitizeFunctionDdl(ddl: string): string {
  let result = ddl;

  // LLMs frequently double-escape single quotes around string literals in
  // function bodies, e.g. ''month'' instead of 'month'. We collapse these
  // paired doubled quotes but preserve standalone '' (empty string literals).
  const bodyMatch = result.match(/\bRETURN\b([\s\S]*)/i);
  if (bodyMatch) {
    const bodyStart = result.indexOf(bodyMatch[0]);
    const prefix = result.slice(0, bodyStart);
    const body = result.slice(bodyStart);
    // Match ''...'' (doubled quotes wrapping content) and collapse to '...'
    const collapsed = body.replace(/''([^']+)''/g, "'$1'");
    if (collapsed !== body) {
      result = prefix + collapsed;
      logger.info("Collapsed doubled single quotes in function DDL");
    }
  }

  // Rewrite unsupported parameter types in the function signature.
  // The signature sits between the opening `(` after the function name
  // and the closing `)` before RETURNS TABLE.
  const sigMatch = result.match(
    /(CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+[^\(]+\()([^)]*\))\s*(RETURNS\s+TABLE)/i
  );
  if (sigMatch) {
    const before = result.slice(0, result.indexOf(sigMatch[0]));
    const sigPrefix = sigMatch[1]; // "CREATE ... FUNCTION name("
    let params = sigMatch[2];      // "p_date DATE DEFAULT NULL, ...)"
    const after = sigMatch[3];     // "RETURNS TABLE"
    const rest = result.slice(
      result.indexOf(sigMatch[0]) + sigMatch[0].length
    );

    const original = params;
    params = params.replace(UNSUPPORTED_PARAM_TYPES, "STRING");
    if (params !== original) {
      logger.info("Rewrote unsupported parameter types to STRING in function DDL");
      result = before + sigPrefix + params + " " + after + rest;
    }
  }

  // Ensure OR REPLACE is present
  if (/^CREATE\s+FUNCTION\s+/i.test(result) && !/OR\s+REPLACE/i.test(result)) {
    result = result.replace(/^CREATE\s+FUNCTION/i, "CREATE OR REPLACE FUNCTION");
  }

  return result;
}

/** Extract the bare object name (last dot-segment) from an identifier or FQN. */
function bareName(identifier: string): string {
  const parts = identifier.replace(/`/g, "").split(".");
  return parts[parts.length - 1].toLowerCase();
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
// Error classification & auto-fix
// ---------------------------------------------------------------------------

function classifyDeployError(error: string): { category: string; treatAsSuccess: boolean } {
  const msg = error.toUpperCase();
  if (msg.includes("ALREADY_EXISTS") || msg.includes("ALREADY EXISTS")) {
    return { category: "exists", treatAsSuccess: true };
  }
  if (msg.includes("PERMISSION_DENIED") || msg.includes("ACCESS_DENIED")) {
    return { category: "permission", treatAsSuccess: false };
  }
  if (msg.includes("SCHEMA_NOT_FOUND") || msg.includes("CATALOG_NOT_FOUND")) {
    return { category: "schema_not_found", treatAsSuccess: false };
  }
  if (msg.includes("PARSE_SYNTAX_ERROR") || msg.includes("PARSE ERROR") || msg.includes("PARSING ERROR")) {
    return { category: "syntax", treatAsSuccess: false };
  }
  if (msg.includes("INVALID_AGGREGATE_FILTER") || msg.includes("NON_DETERMINISTIC")) {
    return { category: "non_deterministic", treatAsSuccess: false };
  }
  return { category: "unknown", treatAsSuccess: false };
}

/**
 * Try to auto-fix common DDL issues that cause deployment failures.
 * Returns the fixed DDL string, or null if no fix is applicable.
 */
function attemptDdlAutoFix(ddl: string, error: string, assetType: "metric_view" | "function"): string | null {
  const msg = error.toUpperCase();

  if (assetType === "metric_view" && (msg.includes("PARSE") || msg.includes("SYNTAX"))) {
    let fixed = ddl;

    // Strip unsupported description: lines in YAML
    fixed = fixed.replace(/^\s*description:\s*"[^"]*"\s*$/gm, "");
    fixed = fixed.replace(/^\s*description:\s*'[^']*'\s*$/gm, "");
    fixed = fixed.replace(/^\s*description:\s*[^\n]+$/gm, "");

    // Fix aggregate keyword casing
    fixed = fixed.replace(
      /^(\s*agg:\s*)(.+)$/gm,
      (_m, prefix: string, rest: string) => prefix + rest.toUpperCase()
    );

    // Strip label: lines (unsupported in some DBR versions)
    fixed = fixed.replace(/^\s*label:\s*[^\n]+$/gm, "");

    if (fixed !== ddl) return fixed;
  }

  // Non-deterministic AI functions in metric view expressions
  if (assetType === "metric_view" && (msg.includes("NON_DETERMINISTIC") || msg.includes("INVALID_AGGREGATE_FILTER"))) {
    const fixed = stripAiFunctionEntries(ddl);
    if (fixed !== ddl) return fixed;
  }

  if (assetType === "function" && (msg.includes("PARSE") || msg.includes("SYNTAX"))) {
    // Re-run the full sanitizer — it may catch issues the first pass missed
    // if the DDL was modified between sanitization and this retry.
    const fixed = sanitizeFunctionDdl(ddl);
    if (fixed !== ddl) return fixed;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Pre-existing metric view validation
// ---------------------------------------------------------------------------

/**
 * Validate that pre-existing metric views from metadata are accessible.
 * Runs lightweight DESCRIBE checks in parallel; returns the set of valid FQNs.
 */
async function validatePreExistingMetricViews(mvFqns: string[]): Promise<{
  valid: Set<string>;
  stripped: StrippedRef[];
}> {
  if (mvFqns.length === 0) return { valid: new Set(), stripped: [] };

  const results = await Promise.allSettled(
    mvFqns.map(async (fqn) => {
      validateFqn(fqn, "metric view");
      await executeSQL(`DESCRIBE TABLE ${fqn}`);
      return fqn;
    })
  );

  const valid = new Set<string>();
  const stripped: StrippedRef[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      valid.add(r.value.toLowerCase());
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      stripped.push({
        type: "metric_view",
        identifier: mvFqns[i],
        reason: `Pre-existing metric view inaccessible: ${reason}`,
      });
      logger.warn("Pre-existing metric view inaccessible, stripping from space", {
        fqn: mvFqns[i],
        error: reason,
      });
    }
  }

  return { valid, stripped };
}

// ---------------------------------------------------------------------------
// Pre-existing function validation
// ---------------------------------------------------------------------------

/**
 * Validate that function identifiers already in the serialized space actually
 * exist in Unity Catalog. Used on retry so that previously-deployed functions
 * are retained rather than wiped.
 */
async function validatePreExistingFunctions(fnIdentifiers: string[]): Promise<{
  valid: Set<string>;
  stripped: StrippedRef[];
}> {
  if (fnIdentifiers.length === 0) return { valid: new Set(), stripped: [] };

  const results = await Promise.allSettled(
    fnIdentifiers.map(async (fqn) => {
      validateFqn(fqn, "function");
      await executeSQL(`DESCRIBE FUNCTION ${fqn}`);
      return fqn;
    })
  );

  const valid = new Set<string>();
  const stripped: StrippedRef[] = [];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      valid.add(r.value.toLowerCase());
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      stripped.push({
        type: "function",
        identifier: fnIdentifiers[i],
        reason: `Function not accessible: ${reason}`,
      });
      logger.warn("Function in serialized space inaccessible, stripping", {
        fqn: fnIdentifiers[i],
        error: reason,
      });
    }
  }

  return { valid, stripped };
}

// ---------------------------------------------------------------------------
// Space preparation (replaces the old add-only patchSerializedSpace)
// ---------------------------------------------------------------------------

/**
 * Build a clean serialized space that only references objects confirmed to
 * exist in Unity Catalog:
 *
 *   sql_functions  -- retain validated pre-existing FQNs (from a prior deploy)
 *                     + add newly-deployed FQNs; strip everything else.
 *   metric_views   -- keep validated pre-existing entries + deployed proposals.
 *
 * Also tracks which references were stripped so the UI can show warnings.
 */
function prepareSerializedSpace(
  spaceJson: string,
  deployedMetricViews: { fqn: string; description?: string }[],
  deployedFunctions: { fqn: string }[],
  validPreExistingMvFqns: Set<string>,
  validPreExistingFnFqns: Set<string>,
): { json: string; strippedRefs: StrippedRef[] } {
  const space = JSON.parse(spaceJson) as Record<string, unknown>;
  const dataSources = (space.data_sources ?? {}) as Record<string, unknown>;
  const instructions = (space.instructions ?? {}) as Record<string, unknown>;
  const strippedRefs: StrippedRef[] = [];

  // --- sql_functions: retain validated pre-existing + add newly deployed ---
  // The assembler stores bare names (e.g. "get_franchise_summary") while the
  // deploy step records full FQNs (e.g. "forge_test.forge.get_franchise_summary").
  // Normalise both sides to bare names for matching, then upgrade retained
  // entries to FQN format.
  const oldFns = (instructions.sql_functions ?? []) as Array<{ id: string; identifier: string }>;

  const deployedFnByName = new Map(
    deployedFunctions.map((f) => [bareName(f.fqn), f.fqn])
  );
  const validPreExistingFnNames = new Set(
    [...validPreExistingFnFqns].map(bareName)
  );

  const retainedFns: Array<{ id: string; identifier: string }> = [];
  for (const fn of oldFns) {
    const name = bareName(fn.identifier);
    const deployedFqn = deployedFnByName.get(name);
    const isValidPreExisting = validPreExistingFnFqns.has(fn.identifier.toLowerCase())
      || validPreExistingFnNames.has(name);

    if (deployedFqn) {
      retainedFns.push({ id: fn.id, identifier: deployedFqn });
      deployedFnByName.delete(name);
    } else if (isValidPreExisting) {
      retainedFns.push(fn);
    } else {
      strippedRefs.push({
        type: "function",
        identifier: fn.identifier,
        reason: "Not deployed to Unity Catalog",
      });
    }
  }

  // Add any deployed functions that didn't match an existing entry
  const newFnEntries = [...deployedFnByName.values()].map((fqn) => ({
    id: uuidv4().replace(/-/g, ""),
    identifier: fqn,
  }));

  const allFns = [...retainedFns, ...newFnEntries].sort((a, b) =>
    a.identifier.localeCompare(b.identifier)
  );

  if (allFns.length > 0) {
    instructions.sql_functions = allFns;
  } else {
    delete instructions.sql_functions;
  }

  // --- metric_views: keep validated pre-existing + add deployed proposals ---
  const existingMvs = (dataSources.metric_views ?? []) as Array<{
    identifier: string;
    description?: string[];
  }>;

  const retainedMvs = existingMvs.filter((mv) => {
    const isValid = validPreExistingMvFqns.has(mv.identifier.toLowerCase());
    if (!isValid) {
      // Only track as stripped if it wasn't already reported by validation
      const alreadyReported = strippedRefs.some(
        (s) => s.identifier.toLowerCase() === mv.identifier.toLowerCase()
      );
      if (!alreadyReported) {
        strippedRefs.push({
          type: "metric_view",
          identifier: mv.identifier,
          reason: "Pre-existing metric view not accessible",
        });
      }
    }
    return isValid;
  });

  const deployedMvEntries = deployedMetricViews
    .filter(
      (mv) => !retainedMvs.some((e) => e.identifier.toLowerCase() === mv.fqn.toLowerCase())
    )
    .map((mv) => ({
      identifier: mv.fqn,
      ...(mv.description ? { description: [mv.description] } : {}),
    }));

  const allMvs = [...retainedMvs, ...deployedMvEntries].sort((a, b) =>
    a.identifier.localeCompare(b.identifier)
  );

  if (allMvs.length > 0) {
    dataSources.metric_views = allMvs;
  } else {
    delete dataSources.metric_views;
  }

  space.data_sources = dataSources;
  space.instructions = instructions;
  return { json: JSON.stringify(space), strippedRefs };
}

// ---------------------------------------------------------------------------
// Asset deployment helpers
// ---------------------------------------------------------------------------

/**
 * Wait for a newly-created function or view to become visible in UC.
 * The Statement Execution API can report DDL success before the metastore
 * has propagated the object, causing immediate DESCRIBE/GRANT to fail.
 */
async function waitForAssetVisibility(
  fqn: string,
  objectSqlType: "TABLE" | "FUNCTION",
  maxRetries = 5,
  delayMs = 2000,
): Promise<boolean> {
  const describeCmd = objectSqlType === "FUNCTION"
    ? `DESCRIBE FUNCTION ${fqn}`
    : `DESCRIBE TABLE ${fqn}`;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await executeSQL(describeCmd);
      return true;
    } catch {
      if (attempt < maxRetries - 1) {
        logger.debug("Asset not yet visible, waiting for propagation", {
          fqn, attempt: attempt + 1, maxRetries, delayMs,
        });
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  return false;
}

async function grantAccess(
  fqn: string,
  objectType: "TABLE" | "FUNCTION",
): Promise<void> {
  validateFqn(fqn, "grantAccess target");
  const privilege = objectType === "TABLE" ? "SELECT" : "EXECUTE";
  for (const grant of [
    `GRANT ALL PRIVILEGES ON ${objectType} ${fqn} TO \`account users\``,
    `GRANT ${privilege} ON ${objectType} ${fqn} TO \`account users\``,
  ]) {
    try {
      await executeSQL(grant);
      logger.info(`GRANT succeeded on ${objectType.toLowerCase()}`, { fqn, grant });
      return;
    } catch (grantErr) {
      logger.warn(`GRANT attempt on ${objectType.toLowerCase()} failed`, {
        fqn,
        grant,
        error: grantErr instanceof Error ? grantErr.message : String(grantErr),
      });
    }
  }
}

/**
 * Deploy a single DDL asset with auto-fix: execute DDL, classify errors,
 * attempt auto-fix on failure, and treat ALREADY_EXISTS as success.
 */
async function deployAsset(
  asset: DeployAsset,
  assetType: "metric_view" | "function",
  targetSchema: string,
): Promise<AssetResult & { deployed: boolean; fqn: string }> {
  const rewritten = assetType === "metric_view"
    ? sanitizeMetricViewDdl(rewriteDdlTarget(asset.ddl, targetSchema))
    : sanitizeFunctionDdl(rewriteDdlTarget(asset.ddl, targetSchema));
  const objectName = extractObjectName(rewritten) ?? asset.name;
  const fqn = `${targetSchema}.${objectName}`;
  const objectSqlType = assetType === "metric_view" ? "TABLE" as const : "FUNCTION" as const;

  // First attempt
  try {
    await executeSQL(rewritten);

    // Verify the asset actually exists (DDL can report success before metastore propagation)
    const visible = await waitForAssetVisibility(fqn, objectSqlType);
    if (!visible) {
      logger.error("Asset DDL succeeded but asset not visible after retries", { fqn, type: assetType });
      return {
        name: asset.name, type: assetType, success: false, fqn, deployed: false,
        error: `DDL executed but ${assetType} not found in Unity Catalog after waiting. The SQL warehouse may need more time to propagate.`,
      };
    }

    await grantAccess(fqn, objectSqlType);
    return { name: asset.name, type: assetType, success: true, fqn, deployed: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const classification = classifyDeployError(errorMsg);

    // ALREADY_EXISTS → treat as success (idempotent)
    if (classification.treatAsSuccess) {
      logger.info("Asset already exists, treating as success", { fqn, type: assetType });
      await grantAccess(fqn, objectSqlType);
      return {
        name: asset.name, type: assetType, success: true, fqn,
        deployed: true, errorCategory: classification.category,
      };
    }

    // Try auto-fix
    const fixedDdl = attemptDdlAutoFix(rewritten, errorMsg, assetType);
    if (fixedDdl) {
      try {
        await executeSQL(fixedDdl);

        const visible = await waitForAssetVisibility(fqn, objectSqlType);
        if (!visible) {
          logger.error("Auto-fixed DDL succeeded but asset not visible", { fqn, type: assetType });
          return {
            name: asset.name, type: assetType, success: false, fqn, deployed: false,
            error: `Auto-fixed DDL executed but ${assetType} not found in Unity Catalog after waiting.`,
            errorCategory: classification.category,
          };
        }

        await grantAccess(fqn, objectSqlType);
        logger.info("Asset deployed after auto-fix", { fqn, type: assetType });
        return {
          name: asset.name, type: assetType, success: true, fqn,
          deployed: true, autoFixed: true, errorCategory: classification.category,
        };
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
        logger.warn("Auto-fix attempt also failed", { fqn, type: assetType, error: retryMsg });
      }
    }

    logger.warn(`${assetType} deployment failed`, { name: asset.name, error: errorMsg });
    return {
      name: asset.name, type: assetType, success: false,
      error: errorMsg, fqn, deployed: false, errorCategory: classification.category,
    };
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params;

  if (!isSafeId(runId)) {
    return NextResponse.json({ error: "Invalid runId" }, { status: 400 });
  }

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

    try {
      validateFqn(body.targetSchema, "targetSchema");
    } catch {
      return NextResponse.json(
        { error: "targetSchema contains invalid characters" },
        { status: 400 }
      );
    }

    const config = getConfig();
    const results: DomainResult[] = [];

    for (const domainReq of body.domains) {
      const assets: AssetResult[] = [];
      const deployedMvs: { fqn: string; description?: string }[] = [];
      const deployedFns: { fqn: string }[] = [];

      // 1. Deploy metric views (with auto-fix)
      for (const mv of domainReq.metricViews) {
        const result = await deployAsset(mv, "metric_view", body.targetSchema);
        assets.push(result);
        if (result.deployed) {
          deployedMvs.push({ fqn: result.fqn, description: mv.description });
          logger.info("Metric view deployed", { runId, domain: domainReq.domain, fqn: result.fqn });
        }
      }

      // 2. Deploy functions (with auto-fix)
      for (const fn of domainReq.functions) {
        const result = await deployAsset(fn, "function", body.targetSchema);
        assets.push(result);
        if (result.deployed) {
          deployedFns.push({ fqn: result.fqn });
          logger.info("Function deployed", { runId, domain: domainReq.domain, fqn: result.fqn });
        }
      }

      // 3. Validate pre-existing metric views and functions from the serialized space.
      //    Only validate identifiers that are already FQNs (3-part names). Bare names
      //    come from the assembler (first deploy) and haven't been created yet —
      //    validating them produces spurious failures.
      const isFqn = (id: string) => id.replace(/`/g, "").split(".").length >= 3;

      const preExistingMvFqns = extractPreExistingMvFqns(domainReq.serializedSpace).filter(isFqn);
      const preExistingFnFqns = extractPreExistingFnIdentifiers(domainReq.serializedSpace).filter(isFqn);

      const [
        { valid: validPreExistingMvs, stripped: mvValidationStripped },
        { valid: validPreExistingFns, stripped: fnValidationStripped },
      ] = await Promise.all([
        validatePreExistingMetricViews(preExistingMvFqns),
        validatePreExistingFunctions(preExistingFnFqns),
      ]);

      // 4. Prepare a clean serialized space (strip undeployed, add deployed FQNs)
      const { json: preparedSpace, strippedRefs } = prepareSerializedSpace(
        domainReq.serializedSpace,
        deployedMvs,
        deployedFns,
        validPreExistingMvs,
        validPreExistingFns,
      );

      // 5. Final existence check — verify every reference in the space is real
      const { json: validatedSpace, stripped: finalStripped } =
        await validateFinalSpace(preparedSpace);

      // 5b. Normalize all identifiers to 3-part FQNs — Genie API requires
      // fully-qualified catalog.schema.object names for functions and metric views.
      const finalSpace = normalizeIdentifiersToFqn(validatedSpace, body.targetSchema);

      const allStripped = [
        ...mvValidationStripped,
        ...fnValidationStripped,
        ...strippedRefs,
        ...finalStripped,
      ];

      if (allStripped.length > 0) {
        logger.info("Stripped references from serialized space", {
          domain: domainReq.domain,
          stripped: allStripped.map((s) => `${s.type}:${s.identifier}`),
        });
      }

      // 6. Create or update Genie space
      const deployedAssetsPayload = {
        functions: deployedFns.map((f) => f.fqn),
        metricViews: deployedMvs.map((m) => m.fqn),
      };

      try {
        let spaceId: string;

        if (domainReq.existingSpaceId) {
          const result = await updateGenieSpace(domainReq.existingSpaceId, {
            serializedSpace: finalSpace,
          });
          spaceId = result.space_id;
          try {
            await trackSpaceUpdated(spaceId, undefined, deployedAssetsPayload);
          } catch (trackErr) {
            logger.error("Lakebase tracking failed after space update (space exists in Genie)", {
              spaceId,
              domain: domainReq.domain,
              error: trackErr instanceof Error ? trackErr.message : String(trackErr),
            });
            try {
              await trackSpaceUpdated(spaceId, undefined, deployedAssetsPayload);
            } catch { /* exhausted retry */ }
          }
          logger.info("Genie space updated", {
            runId, domain: domainReq.domain, spaceId,
          });
        } else {
          const result = await createGenieSpace({
            title: domainReq.title,
            description: domainReq.description || "",
            serializedSpace: finalSpace,
            warehouseId: config.warehouseId,
          });
          spaceId = result.space_id;

          const trackingId = uuidv4();
          try {
            await trackGenieSpaceCreated(
              trackingId,
              spaceId,
              runId,
              domainReq.domain,
              domainReq.title,
              deployedAssetsPayload,
            );
          } catch (trackErr) {
            logger.error("Lakebase tracking failed after space creation (space exists in Genie)", {
              spaceId,
              domain: domainReq.domain,
              error: trackErr instanceof Error ? trackErr.message : String(trackErr),
            });
            try {
              await trackGenieSpaceCreated(
                trackingId, spaceId, runId, domainReq.domain, domainReq.title, deployedAssetsPayload,
              );
            } catch { /* exhausted retry */ }
          }
        }

        results.push({
          domain: domainReq.domain,
          assets,
          spaceId,
          patchedSpace: finalSpace,
          strippedRefs: allStripped.length > 0 ? allStripped : undefined,
        });

        logger.info("Genie space deployed", {
          runId,
          domain: domainReq.domain,
          spaceId,
          metricViews: deployedMvs.length,
          functions: deployedFns.length,
          strippedRefs: allStripped.length,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const orphanedAssets = {
          functions: deployedFns.map((f) => f.fqn),
          metricViews: deployedMvs.map((m) => m.fqn),
        };
        if (orphanedAssets.functions.length > 0 || orphanedAssets.metricViews.length > 0) {
          logger.warn("Genie space creation failed -- UC assets deployed but not attached to any space", {
            domain: domainReq.domain,
            orphanedAssets,
          });
        }
        results.push({
          domain: domainReq.domain,
          assets,
          spaceError: msg,
          orphanedAssets: (orphanedAssets.functions.length > 0 || orphanedAssets.metricViews.length > 0)
            ? orphanedAssets : undefined,
          patchedSpace: finalSpace,
          strippedRefs: allStripped.length > 0 ? allStripped : undefined,
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

// ---------------------------------------------------------------------------
// FQN normalisation
// ---------------------------------------------------------------------------

/**
 * Ensure every sql_function and metric_view identifier is a 3-part FQN
 * (catalog.schema.object). Genie cannot resolve bare names or 2-part names.
 * Any identifier that is not already 3-part gets prefixed with targetSchema.
 */
function normalizeIdentifiersToFqn(spaceJson: string, targetSchema: string): string {
  const space = JSON.parse(spaceJson) as Record<string, unknown>;
  const instructions = (space.instructions ?? {}) as Record<string, unknown>;
  const dataSources = (space.data_sources ?? {}) as Record<string, unknown>;

  const fns = (instructions.sql_functions ?? []) as Array<{ id: string; identifier: string }>;
  if (fns.length > 0) {
    for (const fn of fns) {
      const parts = fn.identifier.replace(/`/g, "").split(".");
      if (parts.length < 3) {
        const objectName = parts[parts.length - 1];
        const fqn = `${targetSchema}.${objectName}`;
        logger.info("Normalized function identifier to FQN", {
          from: fn.identifier,
          to: fqn,
        });
        fn.identifier = fqn;
      }
    }
    // Deduplicate by FQN (bare name + deployed FQN may both be present)
    const seenFns = new Set<string>();
    instructions.sql_functions = fns.filter((fn) => {
      const key = fn.identifier.toLowerCase();
      if (seenFns.has(key)) return false;
      seenFns.add(key);
      return true;
    });
  }

  const mvs = (dataSources.metric_views ?? []) as Array<{ identifier: string }>;
  if (mvs.length > 0) {
    for (const mv of mvs) {
      const parts = mv.identifier.replace(/`/g, "").split(".");
      if (parts.length < 3) {
        const objectName = parts[parts.length - 1];
        const fqn = `${targetSchema}.${objectName}`;
        logger.info("Normalized metric view identifier to FQN", {
          from: mv.identifier,
          to: fqn,
        });
        mv.identifier = fqn;
      }
    }
    const seenMvs = new Set<string>();
    dataSources.metric_views = mvs.filter((mv) => {
      const key = mv.identifier.toLowerCase();
      if (seenMvs.has(key)) return false;
      seenMvs.add(key);
      return true;
    });
  }

  space.instructions = instructions;
  space.data_sources = dataSources;
  return JSON.stringify(space);
}

// ---------------------------------------------------------------------------
// Final existence validation
// ---------------------------------------------------------------------------

/**
 * Final belt-and-suspenders check: parse the prepared serialised space and
 * verify that every sql_function and metric_view identifier actually exists
 * in Unity Catalog right now.  Strip any that don't so the Genie space never
 * references a phantom object.
 */
async function validateFinalSpace(
  spaceJson: string,
): Promise<{ json: string; stripped: StrippedRef[] }> {
  const space = JSON.parse(spaceJson) as Record<string, unknown>;
  const dataSources = (space.data_sources ?? {}) as Record<string, unknown>;
  const instructions = (space.instructions ?? {}) as Record<string, unknown>;
  const stripped: StrippedRef[] = [];

  // --- validate sql_functions ---
  const fns = (instructions.sql_functions ?? []) as Array<{ id: string; identifier: string }>;
  if (fns.length > 0) {
    const results = await Promise.allSettled(
      fns.map(async (fn) => {
        validateFqn(fn.identifier, "sql_function");
        await executeSQL(`DESCRIBE FUNCTION ${fn.identifier}`);
        return fn.identifier;
      })
    );
    const validFns: typeof fns = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        validFns.push(fns[i]);
      } else {
        const reason = (results[i] as PromiseRejectedResult).reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        stripped.push({
          type: "function",
          identifier: fns[i].identifier,
          reason: `Does not exist in Unity Catalog: ${msg}`,
        });
        logger.warn("Final validation: function missing from UC, stripping", {
          identifier: fns[i].identifier,
          error: msg,
        });
      }
    }
    if (validFns.length > 0) {
      instructions.sql_functions = validFns;
    } else {
      delete instructions.sql_functions;
    }
  }

  // --- validate metric_views ---
  const mvs = (dataSources.metric_views ?? []) as Array<{
    identifier: string;
    description?: string[];
  }>;
  if (mvs.length > 0) {
    const results = await Promise.allSettled(
      mvs.map(async (mv) => {
        validateFqn(mv.identifier, "metric_view");
        await executeSQL(`DESCRIBE TABLE ${mv.identifier}`);
        return mv.identifier;
      })
    );
    const validMvs: typeof mvs = [];
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === "fulfilled") {
        validMvs.push(mvs[i]);
      } else {
        const reason = (results[i] as PromiseRejectedResult).reason;
        const msg = reason instanceof Error ? reason.message : String(reason);
        stripped.push({
          type: "metric_view",
          identifier: mvs[i].identifier,
          reason: `Does not exist in Unity Catalog: ${msg}`,
        });
        logger.warn("Final validation: metric view missing from UC, stripping", {
          identifier: mvs[i].identifier,
          error: msg,
        });
      }
    }
    if (validMvs.length > 0) {
      dataSources.metric_views = validMvs;
    } else {
      delete dataSources.metric_views;
    }
  }

  space.data_sources = dataSources;
  space.instructions = instructions;
  return { json: JSON.stringify(space), stripped };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract pre-existing metric view FQNs from the serialized space payload.
 * These are the ones placed by the assembler from metadata, not proposals.
 */
function extractPreExistingMvFqns(spaceJson: string): string[] {
  try {
    const space = JSON.parse(spaceJson);
    const mvs = space?.data_sources?.metric_views;
    if (!Array.isArray(mvs)) return [];
    return mvs
      .map((mv: { identifier?: string }) => mv.identifier)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

/**
 * Extract function identifiers from the serialized space payload.
 * On retry, these may include FQNs from previously-deployed functions
 * that need to be validated rather than wiped.
 */
function extractPreExistingFnIdentifiers(spaceJson: string): string[] {
  try {
    const space = JSON.parse(spaceJson);
    const fns = space?.instructions?.sql_functions;
    if (!Array.isArray(fns)) return [];
    return fns
      .map((fn: { identifier?: string }) => fn.identifier)
      .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

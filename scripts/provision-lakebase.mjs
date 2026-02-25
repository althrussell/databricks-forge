#!/usr/bin/env node

/**
 * Lakebase Autoscale provisioning script (standalone, no TypeScript).
 *
 * Called by scripts/start.sh BEFORE prisma db push. Ensures the Lakebase
 * project exists, resolves the endpoint, generates a DB credential, and
 * prints the full DATABASE_URL to stdout.
 *
 * Exits 0 + prints URL on success, exits 1 on failure.
 * All diagnostic output goes to stderr so stdout contains only the URL.
 */

const PROJECT_ID_BASE = "databricks-forge";
const BRANCH_ID = "production";
const DATABASE_NAME = "databricks_postgres";
const PG_VERSION = "17";
const DISPLAY_NAME = "Databricks Forge AI";
const API_TIMEOUT = 30_000;
const LRO_TIMEOUT = 120_000;
const LRO_POLL = 5_000;

function getProjectId() {
  if (process.env.LAKEBASE_PROJECT_ID) return process.env.LAKEBASE_PROJECT_ID;
  const clientId = process.env.DATABRICKS_CLIENT_ID || "";
  if (clientId) return `${PROJECT_ID_BASE}-${clientId.slice(0, 8)}`;
  return PROJECT_ID_BASE;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  process.stderr.write(`[provision] ${msg}\n`);
}

function getHost() {
  let h = process.env.DATABRICKS_HOST || "";
  if (h && !h.startsWith("https://")) h = `https://${h}`;
  return h.replace(/\/+$/, "");
}

async function timedFetch(url, init, timeoutMs = API_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Workspace OAuth token
// ---------------------------------------------------------------------------

async function getWorkspaceToken() {
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;
  const host = getHost();

  const resp = await timedFetch(`${host}/oidc/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "all-apis",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Workspace OAuth failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  return data.access_token;
}

// ---------------------------------------------------------------------------
// Lakebase REST API
// ---------------------------------------------------------------------------

let _token = null;

async function api(method, path, body) {
  if (!_token) _token = await getWorkspaceToken();
  const host = getHost();
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${_token}`,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);
  return timedFetch(`${host}/api/2.0/postgres/${path}`, opts);
}

// ---------------------------------------------------------------------------
// Project check / create
// ---------------------------------------------------------------------------

async function ensureProject() {
  const projectId = getProjectId();
  const getResp = await api("GET", `projects/${projectId}`);
  if (getResp.ok) {
    log(`Project '${projectId}' exists.`);
    return;
  }
  if (getResp.status !== 404) {
    const text = await getResp.text();
    throw new Error(`Check project failed (${getResp.status}): ${text}`);
  }

  log(`Creating Lakebase project '${projectId}'...`);
  const createResp = await api(
    "POST",
    `projects?project_id=${encodeURIComponent(projectId)}`,
    { spec: { display_name: DISPLAY_NAME, pg_version: PG_VERSION } }
  );

  if (createResp.status === 409) {
    log("Project already exists (409).");
    return;
  }
  if (!createResp.ok) {
    const text = await createResp.text();
    throw new Error(`Create project failed (${createResp.status}): ${text}`);
  }

  const op = await createResp.json();
  if (op.name && !op.done) {
    await pollOp(op.name);
  }
  log("Project created.");
}

async function pollOp(name) {
  const start = Date.now();
  while (Date.now() - start < LRO_TIMEOUT) {
    await new Promise((r) => setTimeout(r, LRO_POLL));
    const resp = await api("GET", name);
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Poll LRO failed (${resp.status}): ${text}`);
    }
    const op = await resp.json();
    if (op.done) {
      if (op.error) throw new Error(`LRO error: ${JSON.stringify(op.error)}`);
      return;
    }
    log(`  still creating... (${Math.round((Date.now() - start) / 1000)}s)`);
  }
  throw new Error(`Project creation timed out after ${LRO_TIMEOUT / 1000}s`);
}

// ---------------------------------------------------------------------------
// Endpoint + username + credential
// ---------------------------------------------------------------------------

async function getEndpointHost() {
  const projectId = getProjectId();
  const listResp = await api(
    "GET",
    `projects/${projectId}/branches/${BRANCH_ID}/endpoints`
  );
  if (!listResp.ok) {
    const text = await listResp.text();
    throw new Error(`List endpoints failed (${listResp.status}): ${text}`);
  }
  const data = await listResp.json();
  const eps = data.endpoints || data.items || [];
  if (!eps.length) throw new Error("No endpoints on production branch");

  const epName = eps[0].name;
  const detResp = await api("GET", epName);
  if (!detResp.ok) {
    const text = await detResp.text();
    throw new Error(`Get endpoint failed (${detResp.status}): ${text}`);
  }
  const detail = await detResp.json();
  const host = detail.status?.hosts?.host;
  if (!host) throw new Error(`Endpoint has no host: ${JSON.stringify(detail)}`);
  return { host, epName };
}

async function getUsername() {
  const host = getHost();
  const maxRetries = 5;
  let lastErr;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const resp = await timedFetch(`${host}/api/2.0/preview/scim/v2/Me`, {
      headers: {
        Authorization: `Bearer ${_token}`,
        "Content-Type": "application/json",
      },
    });

    if (resp.ok) {
      const data = await resp.json();
      return data.userName || data.displayName;
    }

    const text = await resp.text();

    if (resp.status === 429 && attempt < maxRetries - 1) {
      const delaySec = Math.pow(2, attempt + 1);
      log(`SCIM /Me rate-limited (429), retrying in ${delaySec}s... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delaySec * 1000));
      continue;
    }

    lastErr = new Error(`SCIM /Me failed (${resp.status}): ${text}`);
  }

  throw lastErr;
}

async function generateCredential(epName) {
  const resp = await api("POST", "credentials", { endpoint: epName });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Generate credential failed (${resp.status}): ${text}`);
  }
  const data = await resp.json();
  return data.token;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const clientId = process.env.DATABRICKS_CLIENT_ID;
  const clientSecret = process.env.DATABRICKS_CLIENT_SECRET;
  const host = process.env.DATABRICKS_HOST;

  if (!clientId || !clientSecret || !host) {
    log("ERROR: Missing DATABRICKS_CLIENT_ID, DATABRICKS_CLIENT_SECRET, or DATABRICKS_HOST");
    process.exit(1);
  }

  await ensureProject();

  const [{ host: epHost, epName }, username] = await Promise.all([
    getEndpointHost(),
    getUsername(),
  ]);

  const dbToken = await generateCredential(epName);

  const url =
    `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(dbToken)}` +
    `@${epHost}/${DATABASE_NAME}?sslmode=require&uselibpqcompat=true`;

  // Print ONLY the URL to stdout (start.sh captures this)
  process.stdout.write(url);
  log("Connection URL generated.");
}

main().catch((err) => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});

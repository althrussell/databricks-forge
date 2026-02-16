/**
 * Notebook deployment -- generates Jupyter (.ipynb) notebooks and deploys
 * them to the Databricks workspace via the Workspace REST API.
 *
 * Structure matches the reference notebook (databricks_inspire_v34):
 *
 *   - One notebook per domain, containing all use cases for that domain
 *   - Markdown cells for documentation (title, disclaimer, summary tables,
 *     per-use-case details tables)
 *   - Runnable SQL code cells (never commented out)
 *   - An index notebook at the root
 *
 * Notebooks are imported in JUPYTER format so Databricks renders markdown
 * and code cells natively.
 */

import { importNotebook, mkdirs } from "@/lib/dbx/workspace";
import type { PipelineRun, UseCase } from "@/lib/domain/types";
import { groupByDomain } from "@/lib/domain/scoring";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NotebookDeployResult {
  count: number;
  path: string;
  notebooks: Array<{
    name: string;
    path: string;
  }>;
  skipped: number;
}

interface JupyterCell {
  cell_type: "markdown" | "code";
  metadata: Record<string, unknown>;
  source: string[];
  execution_count?: number | null;
  outputs?: unknown[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function cellMeta(): Record<string, unknown> {
  return {
    "application/vnd.databricks.v1+cell": { nuid: uuid() },
  };
}

function mdCell(source: string[]): JupyterCell {
  return { cell_type: "markdown", metadata: cellMeta(), source };
}

function sqlCell(source: string[]): JupyterCell {
  return {
    cell_type: "code",
    execution_count: 0,
    outputs: [],
    metadata: cellMeta(),
    source,
  };
}

function safeStr(val: string | null | undefined): string {
  if (!val || !val.trim()) return "N/A";
  return val;
}

function timestamp(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, "_");
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

/**
 * Generate and deploy Jupyter notebooks for each domain.
 *
 * When a user email is provided (via user authorization), notebooks are
 * placed in the user's home folder: `/Users/<email>/inspire_gen/<biz>/`.
 * Otherwise falls back to the shared workspace path.
 */
export async function generateNotebooks(
  run: PipelineRun,
  useCases: UseCase[],
  userEmail?: string | null
): Promise<NotebookDeployResult> {
  const bizSlug = run.config.businessName.replace(/\s+/g, "_");
  const root = userEmail
    ? `/Users/${userEmail}/inspire_gen`
    : `/Shared/inspire_gen`;
  const basePath = `${root}/${bizSlug}/`;

  await mkdirs(basePath);

  // Deploy index notebook
  const indexContent = buildIndexNotebook(run, useCases);
  try {
    await importNotebook({
      path: `${basePath}_Index`,
      language: "SQL",
      content: indexContent,
      overwrite: true,
      format: "JUPYTER",
    });
  } catch (error) {
    console.warn("[notebooks] Failed to deploy index notebook:", error);
  }

  // Deploy one notebook per domain
  const grouped = groupByDomain(useCases);
  const deployed: Array<{ name: string; path: string }> = [];
  let skipped = 0;

  const sortedDomains = Object.entries(grouped).sort(
    ([, a], [, b]) => a.length - b.length
  );

  for (const [domain, cases] of sortedDomains) {
    const notebookName = sanitizeName(domain);
    const notebookPath = `${basePath}${notebookName}`;

    const content = buildDomainNotebook(run, domain, cases);

    try {
      await importNotebook({
        path: notebookPath,
        language: "SQL",
        content: content,
        overwrite: true,
        format: "JUPYTER",
      });
      deployed.push({ name: notebookName, path: notebookPath });
    } catch (error) {
      console.warn(`[notebooks] Failed to deploy ${notebookName}:`, error);
      skipped++;
    }
  }

  return {
    count: deployed.length,
    path: basePath,
    notebooks: deployed,
    skipped,
  };
}

// ---------------------------------------------------------------------------
// Index notebook
// ---------------------------------------------------------------------------

function buildIndexNotebook(run: PipelineRun, useCases: UseCase[]): string {
  const domains = [...new Set(useCases.map((uc) => uc.domain))].sort();
  const aiCount = useCases.filter((uc) => uc.type === "AI").length;
  const statsCount = useCases.length - aiCount;
  const avgScore = useCases.length
    ? Math.round(
        (useCases.reduce((s, uc) => s + uc.overallScore, 0) /
          useCases.length) *
          100
      )
    : 0;

  const domainRows = domains
    .map((d) => {
      const count = useCases.filter((uc) => uc.domain === d).length;
      return `| ${d} | ${count} |\n`;
    })
    .join("");

  const priorityList = run.config.businessPriorities
    .map((p) => `- ${p}\n`)
    .join("");

  const cells: JupyterCell[] = [
    mdCell([
      `# Databricks Inspire AI — Use Case Catalog\n\n`,
      `**Business:** ${run.config.businessName}\n\n`,
      `**Generated:** ${today()}\n\n`,
      `---\n`,
    ]),
    mdCell([
      `## Summary\n\n`,
      `| Metric | Value |\n`,
      `|--------|-------|\n`,
      `| Total Use Cases | ${useCases.length} |\n`,
      `| AI Use Cases | ${aiCount} |\n`,
      `| Statistical Use Cases | ${statsCount} |\n`,
      `| Business Domains | ${domains.length} |\n`,
      `| Average Score | ${avgScore}% |\n\n`,
      `## Domains\n\n`,
      `| Domain | Use Cases |\n`,
      `|--------|----------|\n`,
      domainRows,
      `\n## Business Priorities\n\n`,
      priorityList,
      `\n---\n\n`,
      `> Each domain notebook contains all use cases for that domain with runnable SQL.\n\n`,
      `*Generated by Databricks Inspire AI*\n`,
    ]),
  ];

  return JSON.stringify(buildJupyterNotebook("_Index", cells), null, 2);
}

// ---------------------------------------------------------------------------
// Domain notebook (one per domain, contains all use cases)
// ---------------------------------------------------------------------------

function buildDomainNotebook(
  run: PipelineRun,
  domain: string,
  useCases: UseCase[]
): string {
  const cells: JupyterCell[] = [];

  // ── Title cell ──────────────────────────────────────────────────────
  cells.push(
    mdCell([
      `# Databricks Inspire AI\n\n`,
      `## For ${run.config.businessName}: ${domain}\n\n`,
    ])
  );

  // ── Disclaimer cell ─────────────────────────────────────────────────
  cells.push(
    mdCell([
      `*Generated by Databricks Inspire AI on ${timestamp()}*\n\n`,
      `**Disclaimer:** All SQL queries are examples and must be validated `,
      `for syntax and safety by a qualified engineer before being used in `,
      `any production environment. Databricks is not liable for any issues `,
      `arising from the use of this code.\n\n`,
      `---\n`,
    ])
  );

  // ── Summary tables grouped by subdomain ─────────────────────────────
  const bySubdomain = new Map<string, UseCase[]>();
  for (const uc of useCases) {
    const sub = uc.subdomain || "General";
    if (!bySubdomain.has(sub)) bySubdomain.set(sub, []);
    bySubdomain.get(sub)!.push(uc);
  }

  let firstSection = true;
  for (const [subdomain, subCases] of [...bySubdomain.entries()].sort()) {
    const sorted = [...subCases].sort((a, b) => a.useCaseNo - b.useCaseNo);
    const headerLines: string[] = [];

    if (firstSection) {
      headerLines.push(`## Use Case Summaries\n\n`);
      firstSection = false;
    }
    headerLines.push(`### ${subdomain}\n\n`);
    headerLines.push(`| ID | Name | Score | Business Value |\n`);
    headerLines.push(`|---|---|---|---|\n`);
    for (const uc of sorted) {
      headerLines.push(
        `| ${uc.id} | ${uc.name} | ${Math.round(uc.overallScore * 100)}% | ${safeStr(uc.businessValue).substring(0, 80)} |\n`
      );
    }
    cells.push(mdCell(headerLines));
  }

  // ── Disclaimer bar ──────────────────────────────────────────────────
  cells.push(
    mdCell([
      `<div style="background-color:#FFF3CD; color:#664D03; border: 1px solid #FFECB5; padding:10px; border-radius:5px; margin-top:10px;">`,
      `<b>Disclaimer:</b> All SQL is AI-generated and must be reviewed before production use.</div>\n`,
    ])
  );

  // ── Section header ──────────────────────────────────────────────────
  cells.push(mdCell([`<hr>\n\n# Detailed Use Cases\n`]));

  // ── Per-use-case cells (details markdown + runnable SQL code) ───────
  const sortedCases = [...useCases].sort((a, b) => a.useCaseNo - b.useCaseNo);

  for (const uc of sortedCases) {
    // Details markdown cell (property table)
    cells.push(
      mdCell([
        `### ${uc.id}: ${uc.name}\n\n`,
        `| Aspect | Description |\n`,
        `|---|---|\n`,
        `| **Subdomain** | ${safeStr(uc.subdomain)} |\n`,
        `| **Type** | ${safeStr(uc.type)} |\n`,
        `| **Analytics Technique** | ${safeStr(uc.analyticsTechnique)} |\n`,
        `| **Score** | ${Math.round(uc.overallScore * 100)}% (Priority: ${Math.round(uc.priorityScore * 100)}%, Feasibility: ${Math.round(uc.feasibilityScore * 100)}%, Impact: ${Math.round(uc.impactScore * 100)}%) |\n`,
        `| **Statement** | ${safeStr(uc.statement)} |\n`,
        `| **Solution** | ${safeStr(uc.solution)} |\n`,
        `| **Business Value** | ${safeStr(uc.businessValue)} |\n`,
        `| **Beneficiary** | ${safeStr(uc.beneficiary)} |\n`,
        `| **Sponsor** | ${safeStr(uc.sponsor)} |\n`,
        `| **Tables Involved** | ${uc.tablesInvolved.join(", ") || "N/A"} |\n`,
      ])
    );

    // SQL code cell (runnable)
    const sqlSource = buildSqlCell(run, uc);
    cells.push(sqlCell(sqlSource));
  }

  const notebookName = sanitizeName(domain);
  return JSON.stringify(buildJupyterNotebook(notebookName, cells), null, 2);
}

// ---------------------------------------------------------------------------
// SQL cell builder — always produces runnable SQL
// ---------------------------------------------------------------------------

function buildSqlCell(run: PipelineRun, uc: UseCase): string[] {
  const lines: string[] = [];

  // Inspire header (used by reference notebook for regeneration tracking)
  lines.push(`--Use Case: ${uc.id} - ${uc.name}\n`);
  lines.push(`--generate_sample_result:No\n`);
  lines.push(`--regenerate_sql:No\n`);
  lines.push(`\n`);

  if (uc.sqlCode && uc.sqlCode.trim().length >= 20) {
    // Use the AI-generated SQL directly (runnable)
    const sqlLines = stripDuplicateHeader(uc.sqlCode);
    lines.push(sqlLines + "\n");
  } else {
    // Generate runnable scaffold SQL (not commented out)
    lines.push(...buildRunnableScaffold(run, uc));
  }

  return lines;
}

/**
 * Strip duplicate header lines that the LLM may have inserted
 * (our Inspire header already contains the use case info).
 */
function stripDuplicateHeader(sql: string): string {
  const lines = sql.split("\n");
  const cleaned: string[] = [];
  let skippingHeader = true;

  for (const line of lines) {
    const stripped = line.trim().toLowerCase();
    if (
      skippingHeader &&
      (stripped.startsWith("-- use case") ||
        stripped.startsWith("--use case"))
    ) {
      continue;
    }
    if (
      skippingHeader &&
      stripped.startsWith("--") &&
      !stripped.startsWith("-- step") &&
      !stripped.startsWith("--step") &&
      stripped.length > 2 &&
      !["with", "select", "cte", "step"].some((kw) => stripped.includes(kw))
    ) {
      continue;
    }
    skippingHeader = false;
    cleaned.push(line);
  }

  return cleaned.join("\n");
}

/**
 * Build runnable (not commented) scaffold SQL when no AI-generated SQL exists.
 * Generates a CTE that SELECTs from the referenced tables so the user has
 * a working starting point they can run immediately.
 */
function buildRunnableScaffold(run: PipelineRun, uc: UseCase): string[] {
  const tables = uc.tablesInvolved;
  const lines: string[] = [];

  if (tables.length === 0) {
    lines.push(`-- No specific tables identified for this use case.\n`);
    lines.push(`-- Add your source tables below and build the analysis.\n\n`);
    lines.push(`SELECT 'TODO: Add source tables for: ${uc.name}' AS next_step;\n`);
    return lines;
  }

  // Explore section: DESCRIBE + preview for each table
  for (const t of tables) {
    lines.push(`-- Explore: ${t}\n`);
    lines.push(`DESCRIBE TABLE ${t};\n\n`);
  }

  lines.push(`-- Preview source data\n`);
  const primaryTable = tables[0];
  lines.push(`SELECT * FROM ${primaryTable} LIMIT 10;\n`);

  // CTE-based analysis scaffold
  lines.push(`\n`);
  lines.push(`-- Analysis scaffold for: ${uc.name}\n`);
  lines.push(`WITH base_data AS (\n`);
  lines.push(`  SELECT *\n`);
  lines.push(`  FROM ${primaryTable} t1\n`);

  for (let i = 1; i < tables.length; i++) {
    lines.push(
      `  LEFT JOIN ${tables[i]} t${i + 1}\n`
    );
    lines.push(
      `    ON t1.id = t${i + 1}.id  -- TODO: set correct join keys\n`
    );
  }

  lines.push(`  LIMIT 1000\n`);
  lines.push(`)\n`);

  if (uc.type === "AI") {
    const modelEndpoint = run.config.aiModel;
    lines.push(`\n`);
    lines.push(`-- AI enrichment (${uc.analyticsTechnique})\n`);
    lines.push(`, ai_enriched AS (\n`);
    lines.push(`  SELECT\n`);
    lines.push(`    *,\n`);
    lines.push(`    ai_query(\n`);
    lines.push(`      '${modelEndpoint}',\n`);
    lines.push(
      `      CONCAT('You are a ${uc.subdomain} specialist for ${run.config.businessName}. ',\n`
    );
    lines.push(
      `             'Analyze the following data and provide insights.'),\n`
    );
    lines.push(
      `      modelParameters => named_struct('temperature', 0.4)\n`
    );
    lines.push(`    ) AS ai_insights\n`);
    lines.push(`  FROM base_data\n`);
    lines.push(`)\n`);
    lines.push(`\n`);
    lines.push(`SELECT * FROM ai_enriched;\n`);
  } else {
    lines.push(`\n`);
    lines.push(`SELECT * FROM base_data;\n`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Jupyter notebook builder
// ---------------------------------------------------------------------------

function buildJupyterNotebook(
  name: string,
  cells: JupyterCell[]
): Record<string, unknown> {
  return {
    cells,
    metadata: {
      "application/vnd.databricks.v1+notebook": {
        computePreferences: null,
        dashboards: [],
        environmentMetadata: {
          base_environment: "",
          environment_version: "4",
        },
        inputWidgetPreferences: null,
        language: "sql",
        notebookMetadata: { pythonIndentUnit: 2 },
        notebookName: name,
        widgets: {},
      },
      language_info: { name: "sql" },
    },
    nbformat: 4,
    nbformat_minor: 0,
  };
}

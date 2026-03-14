# Demo Mode

> Team guide for Field Engineering and Sales -- generate custom synthetic
> demo datasets tailored to a specific customer, industry, and business
> division.

Demo Mode researches a target company using LLM-powered intelligence,
designs a relational data model from industry outcome maps, and writes
realistic demo data directly to Unity Catalog managed Delta tables. The
entire workflow runs from a 6-step wizard accessible from the **Demo
Sessions** sidebar entry or from **Settings**.

---

## Table of Contents

1. [Enabling Demo Mode](#enabling-demo-mode)
2. [Research Presets](#research-presets)
3. [Wizard Walkthrough](#wizard-walkthrough)
4. [Demo Scope](#demo-scope)
5. [Customer Insight Page](#customer-insight-page)
6. [Exporting Research](#exporting-research)
7. [After Generation](#after-generation)
8. [Managing Sessions](#managing-sessions)
9. [Architecture](#architecture)
10. [API Reference](#api-reference)
11. [Troubleshooting](#troubleshooting)
12. [File Reference](#file-reference)

---

## Enabling Demo Mode

Demo Mode is **disabled by default**. It must be explicitly enabled.

### Local Development

Add to `.env.local`:

```
FORGE_DEMO_MODE_ENABLED=true
```

Restart the dev server (`npm run dev`).

### Databricks Apps Deployment

Pass the flag to the deploy script:

```bash
./deploy.sh --enable-demo-mode
```

This sets `FORGE_DEMO_MODE_ENABLED=true` in the app's environment. Combine
with other flags as normal:

```bash
./deploy.sh \
  --warehouse "My SQL Warehouse" \
  --enable-demo-mode \
  --enable-metric-views \
  --reasoning-endpoint-2 "databricks-claude-opus-4-5"
```

### Verification

Once enabled:
- A **Demo** section appears in the sidebar with a "Demo Sessions" link.
- The **Settings** page shows a Demo Mode card with a quick link.
- Navigate to `/demo` to see the full sessions listing.

If the section does not appear:
- Confirm `FORGE_DEMO_MODE_ENABLED=true` is set (check `/api/health` --
  response includes `"demoModeEnabled": true` in all cases).
- Hard-refresh the browser to clear cached settings state.

---

## Research Presets

The wizard offers three research depth levels. Choose based on how much
time you have and how polished the demo needs to be.

| Preset | Sources | Analysis | Estimated Time | Best For |
|---|---|---|---|---|
| **Quick** | Website only | Single synthesis pass | 20--45 s | Fast standups, internal testing |
| **Balanced** | Website + investor docs | Industry landscape + combined strategy-narrative | 60--90 s | Customer meetings with reasonable prep time |
| **Full** | Website + IR docs + uploads | 4-pass McKinsey-grade analysis (landscape, deep-dive, data strategy, demo narrative) | 2--3 min | High-stakes executive demos, QBRs |

All presets allow industry selection from a dropdown of known industries,
or auto-detection from website content when left as "Auto-detect". If the
detected industry has no built-in outcome map, the engine generates one
from scratch and persists it for reuse. If an outcome map exists but has
no enrichment data, only the enrichment layer is generated (faster).

---

## Wizard Walkthrough

### Step 1: Company Info

| Field | Required | Notes |
|---|---|---|
| Customer Name | Yes | e.g. "Rio Tinto", "ANZ Bank" |
| Website URL | No | Scraped for company context. Division-specific subpages are also probed. |
| Industry | No | Select from dropdown or leave as "Auto-detect from website". |
| Research Depth | Yes | Quick / Balanced / Full (see above). |
| Division / Scope | No | Narrows the demo to a business unit. See [Demo Scope](#demo-scope). |
| Demo Objective | No | Free text describing what the demo should emphasise. |
| Additional Documents | No | Upload PDFs, paste strategy excerpts, annual report text. Only used in Full mode. |

Click **Start Research** to kick off the Research Engine.

### Step 2: Research Results

The wizard shows a step-by-step timeline with real-time progress:

- **Gathering Sources** -- website scraping, IR document discovery
- **Classifying Industry** -- LLM-based industry detection (if auto-detect)
- **Industry Knowledge** -- checking/generating outcome map and enrichment
- **Analytical Passes** -- varies by preset (1 pass for Quick, 2 for Balanced, 4 for Full)

Each step shows a detail message (e.g. "Scraping https://riotinto.com -- 45K chars",
"Classified as Manufacturing (92% confidence)").

When complete, a summary card shows key stats with a **View Full Insights**
button that opens the Customer Insight Page.

### Step 3: Catalog Selection

Two modes:

1. **Browse existing** -- use the Catalog Browser to select an existing
   catalog and schema. Click a schema to select it.
2. **Create new** -- toggle "Create new catalog", enter a name, and click
   **Validate Permissions** to pre-check access.

Common errors and what to do:

| Error | Resolution |
|---|---|
| "You don't have permission to create catalogs" | Use an existing catalog, or ask your admin to grant `CREATE CATALOG`. |
| "Cannot create schema in this catalog" | You need `USE CATALOG` + `CREATE SCHEMA` on the target catalog. |

### Step 4: Schema Review

Review the data assets, narratives, and nomenclature the Data Engine will
use. This is a read-only preview.

### Step 5: Generation Progress

Each table shows its current phase: Pending → Generating SQL → Executing →
Completed/Failed. Failed tables are retried up to 2 times with LLM
review-and-fix. Table and column descriptions are applied automatically
after each table is created.

### Step 6: Complete

Summary shows the fully qualified catalog.schema path, table/row counts,
and suggested next steps.

---

## Demo Scope

Scope narrows the demo from a full enterprise view to a specific unit.

| Field | Effect |
|---|---|
| **Division** | e.g. "Aluminium Division", "Wealth Management". Focuses research on that business unit. |
| **Functional Focus** | Asset families to include (e.g. "Commercial & Customer", "Operations & OT"). |
| **Departments** | Auto-maps to asset families. HR → Workforce, Finance → Finance & Regulatory, etc. |
| **Demo Objective** | Free text that shapes the narrative design and killer moments. |

---

## Customer Insight Page

Navigate to `/demo/sessions/{sessionId}` (or click a session row, or
"View Full Insights" in the wizard) to see the full research output as a
presentation-ready page.

Sections (shown when data is available):

- **Company Overview** -- stated priorities, inferred priorities, urgency signals, strategic gaps
- **SWOT Analysis** -- strengths, weaknesses, opportunities, threats (4-card grid)
- **Industry Landscape** -- market forces with urgency indicators, competitive dynamics, regulatory pressures
- **Key Benchmarks** -- metrics, impacts, and sources in tabular form
- **Data Strategy** -- matched assets with relevance scores, maturity assessment, prioritised use cases
- **Demo Flow** -- numbered step-by-step talk track with transitions
- **Killer Moments** -- hero cards with scenario, insight, expected reaction
- **Competitive Positioning** -- competitor angles and opportunities
- **Executive Talking Points** -- per-asset headlines with benchmark tie-ins
- **Data Narratives** -- stories embedded in the demo data
- **Sources** -- all gathered sources with type, status, and size

Quick preset shows Data Narratives and Sources only. Balanced adds
Industry Landscape and Strategy. Full shows all sections.

---

## Exporting Research

From the Customer Insight Page or the sessions table, export research as:

- **PPTX** -- branded slide deck (10--12 slides) suitable for internal
  prep or customer-facing presentations
- **PDF** -- document-style report with the same content sections

Both formats use Databricks Forge branding and skip sections where data
is not available (e.g. Quick preset exports are shorter).

Download URL: `GET /api/demo/sessions/{id}/export?format=pptx|pdf`

---

## After Generation

The generated data lives at `<catalog>.<schema>` as managed Delta tables
with table and column descriptions applied.

Use it with any Forge feature:

1. **Discovery Pipeline** -- point a new pipeline run at the demo
   catalog/schema.
2. **Genie Studio** -- create Genie Spaces from the demo schema.
3. **AI/BI Dashboards** -- generate executive-ready dashboards.
4. **Ask Forge** -- explore the demo data conversationally.
5. **AI Comments** -- generate catalog documentation for the demo schema.

---

## Managing Sessions

### Viewing Past Sessions

Navigate to `/demo` (sidebar: Demo → Demo Sessions) to see all sessions
in a table view with customer name, industry, status, catalog path, table
and row counts, and creation date.

### Deleting Demo Data

Click the delete action on any session. This:
1. Runs `DROP TABLE IF EXISTS` for every table created by that session
2. Drops the schema if it's empty after table drops
3. Deletes the `ForgeDemoSession` record from Lakebase
4. Logs a `demo_cleanup` activity event

Only tables tracked by that specific session are dropped.

### Factory Reset

`Settings → Delete All Data` also clears all demo sessions from Lakebase
(but does **not** drop Unity Catalog objects -- use per-session delete for
that).

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Demo Wizard (6 steps)                │
│   Company Info → Research → Catalog → Review → Gen   │
└───────────┬──────────────────────────┬───────────────┘
            │                          │
            ▼                          ▼
┌───────────────────────┐  ┌───────────────────────────┐
│    Research Engine     │  │       Data Engine          │
│                        │  │                           │
│  Pass 0: Sources       │  │  Pass 0: Narrative Design │
│  Pass 3.25: Industry   │  │  Pass 1: Schema Design    │
│  Pass 3.5: Outcome Map │  │  Pass 2: Seed Generation  │
│  Pass 4-7: Analysis    │  │  Pass 3: Fact Generation  │
│  (varies by preset)    │  │  Pass 4: Validation       │
└───────────────────────┘  └───────────────────────────┘
            │                          │
            ▼                          ▼
┌───────────────────────┐  ┌───────────────────────────┐
│  ResearchEngineResult  │  │  Unity Catalog Delta      │
│  (stored in Lakebase)  │  │  Tables (direct write)    │
└───────────────────────┘  └───────────────────────────┘
```

### Research Engine Passes

| Pass | Name | Preset | Tier | Purpose |
|---|---|---|---|---|
| 0 | Source Collection | All | -- | Website scrape, IR discovery, doc parsing (parallel) |
| 3.25 | Industry Classification | All (if needed) | classification | Auto-detect industry from sources |
| 3.5 | Outcome Map / Enrichment | All (if needed) | reasoning / generation | 3-case: skip if both exist, generate enrichment if outcome-only, full generation if neither |
| 4Q | Quick Synthesis | Quick | generation | Single-pass: assets + nomenclature + narratives |
| 4 | Industry Landscape | Balanced, Full | reasoning | Market forces, benchmarks, competitive dynamics |
| 5B | Strategy & Narrative | Balanced | reasoning | Combined strategic profile + data strategy + demo narrative |
| 5 | Company Deep-Dive | Full | reasoning | SWOT, stated/inferred priorities, urgency signals |
| 6 | Data Strategy Mapping | Full | reasoning | Map priorities to data assets with criticality scoring |
| 7 | Demo Narrative Design | Full | reasoning | Killer moments, demo flow, executive talking points |

### Data Engine Passes

| Pass | Name | Tier | Purpose |
|---|---|---|---|
| 0 | Narrative Design | reasoning | Design 3--5 data stories with temporal patterns |
| 1 | Schema Design | reasoning | Design dimension + fact tables from matched assets |
| 2 | Seed Generation | sql | DDL + INSERT for dimension tables (sequential) + COMMENT ON |
| 3 | Fact Generation | sql | CTAS for fact tables (2x concurrent) + COMMENT ON |
| 4 | Validation | -- | Row counts, FK integrity, distribution checks (pure SQL) |

### Status Tracking

Both engines use in-memory `Map` for fast polling (2s intervals) with
`AbortController` support for cancellation. Final status is persisted on
`ForgeDemoSession` in Lakebase. Demo jobs do **not** write to
`ForgeBackgroundJob` (which has an FK to `ForgeRun`).

---

## API Reference

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/demo/research` | Start Research Engine (fire-and-forget) |
| GET | `/api/demo/research/status?sessionId=X` | Poll research job status |
| POST | `/api/demo/generate` | Start Data Engine (fire-and-forget) |
| GET | `/api/demo/generate/status?sessionId=X` | Poll generation job status |
| POST | `/api/demo/validate-catalog` | Pre-check catalog/schema permissions |
| POST | `/api/demo/upload` | Upload PDF/text documents for research |
| GET | `/api/demo/sessions` | List all demo sessions |
| GET | `/api/demo/sessions/:id` | Session detail + research result |
| DELETE | `/api/demo/sessions/:id` | Cleanup: DROP tables + delete session |
| GET | `/api/demo/sessions/:id/export?format=pptx\|pdf` | Export research as PPTX or PDF |

All routes return 404 when `FORGE_DEMO_MODE_ENABLED` is not `true`.

---

## Troubleshooting

### "Demo mode is not enabled"

All API routes return this when the feature gate is off. Set
`FORGE_DEMO_MODE_ENABLED=true` and restart.

### Research takes too long

Switch to **Quick** preset for 20--45 second research. Full preset can
take 2--3 minutes due to 4 sequential reasoning-tier LLM calls.

### "You don't have permission to create catalogs"

The service principal (or your PAT in local dev) needs `CREATE CATALOG`
on the metastore. Alternatively, select an existing catalog using the
Catalog Browser.

### Tables fail during generation

The Data Engine retries failed SQL up to 2 times using LLM review-and-fix.
If a table still fails:
- Check the SQL warehouse is running and not at capacity
- The generated SQL uses Databricks-specific functions (`EXPLODE`,
  `SEQUENCE`, `RAND`) -- ensure the warehouse supports these

### "Empty LLM response content (finishReason=length)"

The SQL generation model hit its output token limit. The Data Engine now
uses the `sql` tier (routing to models with 128K output capacity) to
prevent this. If you still see this, the table design may be too complex --
try reducing the target row count.

### No industry outcome map found

If the target industry isn't in the built-in registry, the engine
auto-generates one. If only the enrichment is missing, only that layer is
generated (~30s). Full generation takes ~60-120s. Generated maps are
persisted for reuse.

### Demo data looks too uniform

Ensure you're using **Balanced** or **Full** preset. Quick mode produces
simpler narratives. Also check that you provided a website URL -- without
it, the engine has less context for nomenclature and realistic values.

---

## File Reference

### Core

| File | Purpose |
|---|---|
| `lib/demo/config.ts` | `isDemoModeEnabled()` feature gate |
| `lib/demo/types.ts` | All shared types (ResearchPreset, DemoScope, TableDesign, etc.) |
| `lib/demo/scope.ts` | Department → asset family resolution, schema name builder |
| `lib/demo/cleanup.ts` | UC object cleanup (DROP TABLE/SCHEMA) |

### Research Engine

| File | Purpose |
|---|---|
| `lib/demo/research-engine/engine.ts` | `runResearchEngine()` orchestrator + `normalizeIndustryId()` |
| `lib/demo/research-engine/types.ts` | Input, deps, result, intermediate analysis types |
| `lib/demo/research-engine/prompts.ts` | All prompt templates (incl. `ENRICHMENT_ONLY_GENERATION_PROMPT`) |
| `lib/demo/research-engine/engine-status.ts` | In-memory status tracking (no ForgeBackgroundJob) |
| `lib/demo/research-engine/passes/*.ts` | Individual pass implementations (incl. `runEnrichmentOnlyGeneration`) |

### Data Engine

| File | Purpose |
|---|---|
| `lib/demo/data-engine/engine.ts` | `runDataEngine()` orchestrator |
| `lib/demo/data-engine/types.ts` | Input, deps, result types |
| `lib/demo/data-engine/prompts.ts` | Prompt templates for schema/SQL generation |
| `lib/demo/data-engine/engine-status.ts` | In-memory status tracking (no ForgeBackgroundJob) |
| `lib/demo/data-engine/passes/*.ts` | Individual pass implementations (with COMMENT ON after creation) |

### Export

| File | Purpose |
|---|---|
| `lib/export/demo-research-pptx.ts` | `generateDemoResearchPptx()` -- branded slide deck |
| `lib/export/demo-research-pdf.ts` | `generateDemoResearchPdf()` -- document-style report |

### Persistence

| File | Purpose |
|---|---|
| `lib/lakebase/demo-sessions.ts` | CRUD for `ForgeDemoSession` |
| `lib/lakebase/outcome-maps.ts` | `getCustomEnrichment()`, `setCustomEnrichment()` |
| `prisma/schema.prisma` | `ForgeDemoSession` model, `enrichmentJson` on `ForgeOutcomeMap` |

### UI

| File | Purpose |
|---|---|
| `app/demo/page.tsx` | Demo Sessions listing page (table, wizard launcher) |
| `app/demo/sessions/[sessionId]/page.tsx` | Customer Insight Page (full research view) |
| `components/demo/demo-wizard.tsx` | 6-step wizard modal |
| `components/demo/demo-settings.tsx` | Settings page card (link to /demo) |
| `components/demo/steps/*.tsx` | Individual step components |
| `components/pipeline/sidebar-nav.tsx` | Demo section (conditional on `demoModeEnabled`) |

### API Routes

| File | Purpose |
|---|---|
| `app/api/demo/research/route.ts` | Start research |
| `app/api/demo/generate/route.ts` | Start data generation |
| `app/api/demo/validate-catalog/route.ts` | Permission pre-check |
| `app/api/demo/upload/route.ts` | Document upload |
| `app/api/demo/sessions/route.ts` | List sessions |
| `app/api/demo/sessions/[sessionId]/route.ts` | Session detail + delete |
| `app/api/demo/sessions/[sessionId]/export/route.ts` | PPTX/PDF export |

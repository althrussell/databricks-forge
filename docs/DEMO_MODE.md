# Demo Mode

> Team guide for Field Engineering and Sales -- generate custom synthetic
> demo datasets tailored to a specific customer, industry, and business
> division.

Demo Mode researches a target company using LLM-powered intelligence,
designs a relational data model from industry outcome maps, and writes
realistic demo data directly to Unity Catalog managed Delta tables. The
entire workflow runs from a 6-step wizard accessible in **Settings**.

---

## Table of Contents

1. [Enabling Demo Mode](#enabling-demo-mode)
2. [Research Presets](#research-presets)
3. [Wizard Walkthrough](#wizard-walkthrough)
4. [Demo Scope](#demo-scope)
5. [After Generation](#after-generation)
6. [Managing Sessions](#managing-sessions)
7. [Architecture](#architecture)
8. [API Reference](#api-reference)
9. [Troubleshooting](#troubleshooting)
10. [File Reference](#file-reference)

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

Once enabled, navigate to **Settings**. A **Demo Mode** card appears above
Data Management with a "Launch Demo Wizard" button and a list of previous
sessions.

If the card does not appear:
- Confirm `FORGE_DEMO_MODE_ENABLED=true` is set (check `/api/health` --
  response includes `"demoModeEnabled": true`).
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

All presets auto-detect the industry if you leave the field blank. If the
detected industry has no built-in outcome map, the engine generates one
from scratch and persists it for reuse.

---

## Wizard Walkthrough

### Step 1: Company Info

| Field | Required | Notes |
|---|---|---|
| Customer Name | Yes | e.g. "Rio Tinto", "ANZ Bank" |
| Website URL | No | Scraped for company context. Division-specific subpages are also probed. |
| Industry | No | Leave blank for auto-detection from website content. |
| Research Depth | Yes | Quick / Balanced / Full (see above). |
| Division / Scope | No | Narrows the demo to a business unit. See [Demo Scope](#demo-scope). |
| Demo Objective | No | Free text describing what the demo should emphasise. |
| Additional Documents | No | Upload PDFs, paste strategy excerpts, annual report text. Only used in Full mode. |

Click **Start Research** to kick off the Research Engine.

### Step 2: Research Results

The wizard polls the Research Engine status every 2 seconds, showing:
- Current phase and progress bar
- Source status (website, IR docs, uploads)

When complete, a summary card shows:
- Industry classification (with a note if a new outcome map was generated)
- Number of matched data assets
- Key company priorities extracted from sources
- Company-specific nomenclature (terminology mapping)

Review and click **Continue to Catalog**.

### Step 3: Catalog Selection

Enter or select:
- **Catalog Name** -- an existing catalog or a new name. The wizard creates
  it if needed (and you have `CREATE CATALOG` permission).
- **Schema Name** -- auto-suggested from the customer name and scope.

Click **Validate Permissions** to pre-check:
- Catalog existence and accessibility
- `CREATE SCHEMA` permission
- `CREATE TABLE` permission (implicit via schema creation)

Common errors and what to do:

| Error | Resolution |
|---|---|
| "You don't have permission to create catalogs" | Use an existing catalog, or ask your admin to grant `CREATE CATALOG`. |
| "Cannot create schema in this catalog" | You need `USE CATALOG` + `CREATE SCHEMA` on the target catalog. |

### Step 4: Schema Review

Review the data assets, narratives, and nomenclature the Data Engine will
use. This is a read-only preview -- the actual table schema is designed
dynamically during generation.

Key elements:
- **Data Assets** -- the industry reference data assets selected by the
  Research Engine (e.g. "A01: Core Banking System").
- **Data Narratives** -- stories embedded as patterns in the data (spikes,
  trends, anomalies, seasonal patterns).
- **Nomenclature** -- company-specific term mappings used in table and
  column names.
- **Demo Highlights** -- killer moments designed for maximum demo impact
  (Full preset only).

Click **Generate Data** to start the Data Engine.

### Step 5: Generation Progress

The Data Engine runs 5 passes:

1. **Narrative Design** -- designs 3--5 data stories
2. **Schema Design** -- designs dimension + fact tables from matched assets
3. **Seed Generation** -- `CREATE TABLE` + `INSERT INTO` for each dimension
4. **Fact Generation** -- `CREATE TABLE AS SELECT` with narrative patterns
5. **Validation** -- row counts, FK integrity, distribution checks

Each table shows its current phase:
- Pending → Generating SQL → Executing → Completed/Failed
- Failed tables are retried up to 2 times with LLM review-and-fix

### Step 6: Complete

Summary shows:
- Fully qualified catalog.schema path (with copy button)
- Total tables created, total rows, duration
- Suggested next steps

---

## Demo Scope

Scope narrows the demo from a full enterprise view to a specific unit.

| Field | Effect |
|---|---|
| **Division** | e.g. "Aluminium Division", "Wealth Management". Focuses research on that business unit. |
| **Functional Focus** | Asset families to include (e.g. "Commercial & Customer", "Operations & OT"). |
| **Departments** | Auto-maps to asset families. HR → Workforce, Finance → Finance & Regulatory, etc. |
| **Demo Objective** | Free text that shapes the narrative design and killer moments. |

### Department → Asset Family Mapping

| Department | Asset Families |
|---|---|
| HR | Workforce, Enterprise Operations |
| Finance | Finance & Regulatory, Enterprise & Finance |
| Operations | Operations & OT, Operations & OT Data |
| Supply Chain | Supply Chain, Manufacturing & Supply Chain |
| Marketing | Commercial & Customer, Marketing & Channels |
| Sales | Commercial & Customer, Sales & Distribution |
| Risk | Risk & External Intelligence, Risk & Compliance |
| IT | Foundation & Governance, Enterprise Operations |
| Customer Service | Commercial & Customer, Customer Experience |

---

## After Generation

The generated data lives at `<catalog>.<schema>` as managed Delta tables.
Use it with any Forge feature:

1. **Discovery Pipeline** -- point a new pipeline run at the demo
   catalog/schema. The pipeline discovers use cases from the synthetic
   metadata, scores them, generates SQL, and produces business value
   analysis -- all tailored to the demo data.

2. **Genie Studio** -- create Genie Spaces from the demo schema. The
   synthetic tables have realistic column names and relationships that
   produce high-quality spaces.

3. **AI/BI Dashboards** -- generate executive-ready dashboards. The
   embedded data narratives (trends, spikes, anomalies) produce visually
   compelling charts on first render.

4. **Ask Forge** -- explore the demo data conversationally.

5. **AI Comments** -- generate catalog documentation for the demo schema.

---

## Managing Sessions

### Viewing Past Sessions

The **Demo Mode** card in Settings lists all previous sessions with:
- Customer name, industry, status
- Catalog.schema path
- Table count, row count, creation date

### Deleting Demo Data

Click the trash icon on any session. This:
1. Runs `DROP TABLE IF EXISTS` for every table created by that session
2. Drops the schema if it's empty after table drops
3. Deletes the `ForgeDemoSession` record from Lakebase
4. Logs a `demo_cleanup` activity event

The delete is non-destructive to other data in the same catalog -- only
tables tracked by that specific session are dropped.

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
| 3.5 | Outcome Map Generation | All (if needed) | reasoning | Generate IndustryOutcome + enrichment for unknown industries |
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
| 2 | Seed Generation | generation | DDL + INSERT for dimension tables (sequential) |
| 3 | Fact Generation | generation | CTAS with EXPLODE(SEQUENCE) for fact tables (2x concurrent) |
| 4 | Validation | -- | Row counts, FK integrity, distribution checks (pure SQL) |

### Status Tracking

Both engines use the same pattern as the Genie Engine:
- In-memory `Map` for fast polling (2s intervals)
- Write-through to `ForgeBackgroundJob` in Lakebase for persistence
- `AbortController` support for cancellation

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
on the metastore. Alternatively, select an existing catalog.

### Tables fail during generation

The Data Engine retries failed SQL up to 2 times using LLM review-and-fix.
If a table still fails:
- Check the SQL warehouse is running and not at capacity
- The generated SQL uses Databricks-specific functions (`EXPLODE`,
  `SEQUENCE`, `RAND`) -- ensure the warehouse supports these

### No industry outcome map found

If the target industry isn't in the built-in registry (banking, insurance,
HLS, RCG, manufacturing, energy-utilities, communications, media-advertising,
digital-natives, games, sports-betting), the engine auto-generates one.
This adds ~30s to the research phase but the generated map is persisted
for reuse.

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
| `lib/demo/research-engine/engine.ts` | `runResearchEngine()` orchestrator |
| `lib/demo/research-engine/types.ts` | Input, deps, result, intermediate analysis types |
| `lib/demo/research-engine/prompts.ts` | All prompt templates for research passes |
| `lib/demo/research-engine/engine-status.ts` | In-memory + Lakebase status tracking |
| `lib/demo/research-engine/passes/*.ts` | Individual pass implementations |

### Data Engine

| File | Purpose |
|---|---|
| `lib/demo/data-engine/engine.ts` | `runDataEngine()` orchestrator |
| `lib/demo/data-engine/types.ts` | Input, deps, result types |
| `lib/demo/data-engine/prompts.ts` | Prompt templates for schema/SQL generation |
| `lib/demo/data-engine/engine-status.ts` | In-memory + Lakebase status tracking |
| `lib/demo/data-engine/passes/*.ts` | Individual pass implementations |

### Persistence

| File | Purpose |
|---|---|
| `lib/lakebase/demo-sessions.ts` | CRUD for `ForgeDemoSession` |
| `lib/lakebase/outcome-maps.ts` | `getCustomEnrichment()`, `setCustomEnrichment()` |
| `prisma/schema.prisma` | `ForgeDemoSession` model, `enrichmentJson` on `ForgeOutcomeMap` |

### UI

| File | Purpose |
|---|---|
| `components/demo/demo-wizard.tsx` | 6-step wizard modal |
| `components/demo/demo-settings.tsx` | Settings page card with session list |
| `components/demo/steps/*.tsx` | Individual step components |

### API Routes

| File | Purpose |
|---|---|
| `app/api/demo/research/route.ts` | Start research |
| `app/api/demo/generate/route.ts` | Start data generation |
| `app/api/demo/validate-catalog/route.ts` | Permission pre-check |
| `app/api/demo/upload/route.ts` | Document upload |
| `app/api/demo/sessions/route.ts` | List sessions |
| `app/api/demo/sessions/[sessionId]/route.ts` | Session detail + delete |

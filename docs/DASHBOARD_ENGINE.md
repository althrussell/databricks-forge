# Dashboard Engine

> AI/BI (Lakeview) dashboard recommendation generator.

## Overview

The Dashboard Engine generates Databricks AI/BI dashboard recommendations from
pipeline results or ad-hoc table selections. It produces full
`SerializedLakeviewDashboard` JSON payloads that can be deployed directly to the
workspace via the Lakeview REST API.

## Modes

The engine operates in two modes:

| Aspect | Pipeline mode | Ad-hoc mode |
|--------|---------------|-------------|
| Trigger | After pipeline completion (background) or manual "Generate" | Ask Forge intent or `POST /api/dashboard/generate` |
| Input | Run use cases, metadata, Genie recommendations, discovered dashboards | Tables, optional SQL blocks, widget descriptions, conversation summary |
| Use cases | Real pipeline use cases | Synthetic from conversation context |
| Genie enrichment | Yes (measures, dimensions, filters) | No |
| Enhancement detection | Yes (flags existing dashboards) | No |
| Deploy | Via deploy API after review | Optional inline deploy |

---

## Engine Flow

### Pipeline Mode

```
runDashboardRecommendations(ctx, runId)
    │
    ├── Load metadata, use cases, Genie recommendations, discovered dashboards
    │
    ├── runDashboardEngine(input)
    │     │
    │     ├── Group use cases by domain
    │     │
    │     ├── For each domain:
    │     │     ├── buildDashboardDesignPrompt()  ← use cases + metadata + Genie outputs
    │     │     ├── LLM call → DashboardDesign (JSON)
    │     │     ├── Validate dataset SQL (3 stages)
    │     │     ├── assembleLakeviewDashboard(design)
    │     │     └── buildDashboardRecommendation()
    │     │
    │     └── Return DashboardEngineResult
    │
    └── saveDashboardRecommendations()
```

### Ad-hoc Mode

```
runAdHocDashboardEngine(input)
    │
    ├── Fetch metadata for given tables
    ├── Build synthetic use cases from context
    ├── Same LLM pipeline + validation as pipeline mode
    ├── Optionally deploy via createDashboard() + publishDashboard()
    └── Return AdHocDashboardResult
```

---

## SQL Validation

All dataset SQL goes through three validation stages before inclusion:

1. **Schema allowlist** -- `validateSqlExpression()` from
   `lib/genie/schema-allowlist.ts` checks table and column references against
   metadata. `strictColumnCheck=true` for dashboards.

2. **LLM review** (optional) -- `reviewAndFixSql()` from
   `lib/ai/sql-reviewer.ts` when `isReviewEnabled("dashboard")` or
   `isReviewEnabled("adhoc-dashboard")`. Fixes SQL and re-validates against the
   allowlist.

3. **EXPLAIN validation** -- `validateDatasetSql(sql, datasetName)` runs
   `EXPLAIN <sql>` via the SQL warehouse to catch planning errors.

Datasets that fail any stage are dropped. Widgets referencing dropped datasets
are removed from the final dashboard.

---

## Lakeview Assembler

`assembleLakeviewDashboard(design)` converts the LLM's `DashboardDesign` into
the `SerializedLakeviewDashboard` format expected by the Lakeview REST API.

Layout uses a 6-column grid:
- **Title and subtitle** at the top
- **KPI counters** in rows of 3
- **"Trends & Analysis"** section with charts (2 per row)
- **"Details"** section with table widgets
- **Global filters** on a separate page (`PAGE_TYPE_GLOBAL_FILTERS`)

---

## Metric View Support

When metric views are present in the schema, `validateMetricViewSql()` checks:
- Correct `MEASURE()` function usage
- Proper `GROUP BY` clauses
- No `SELECT *` on metric views

---

## Deployment

1. `POST /api/runs/[runId]/dashboard-engine/[domain]/deploy` with optional
   `{ parentPath, publish }`
2. Load recommendation from Lakebase
3. Check `ForgeDashboard` for existing deployment
4. If exists: `updateDashboard()` + `trackDashboardUpdated()`
5. If new: `createDashboard()` + `trackDashboardCreated()`
6. If `publish`: `publishDashboard(dashboardId, warehouseId)`
7. Return `{ dashboardId, action, dashboardUrl }`

The Lakeview API client lives in `lib/dbx/dashboards.ts`.

---

## Dependency Injection

```typescript
interface DashboardEngineDeps {
  llm: LLMClient;
  logger: Logger;
  reviewAndFixSql?: typeof reviewAndFixSql;
  isReviewEnabled?: typeof isReviewEnabled;
}
```

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/dashboard/generate` | POST | Ad-hoc generation from tables + Ask Forge context |
| `/api/runs/[runId]/dashboard-engine/generate` | POST | Start async pipeline dashboard generation (optional domain filter) |
| `/api/runs/[runId]/dashboard-engine/generate/status` | GET | Poll generation status |
| `/api/runs/[runId]/dashboard-engine/[domain]/preview` | GET | Lakeview JSON preview for a domain |
| `/api/runs/[runId]/dashboard-engine/[domain]/deploy` | POST | Deploy a domain's dashboard to Databricks |
| `/api/runs/[runId]/dashboard-recommendations` | GET | List recommendations and tracked dashboards for a run |

---

## UI

| Component | Purpose |
|-----------|---------|
| `components/pipeline/dashboards-tab.tsx` | Run-level dashboard recommendations: list, select, deploy, regenerate, detail sheet |
| `components/pipeline/dashboard-deploy-modal.tsx` | Deploy modal: workspace path, publish option, sequential deploy |

---

## Data Model

| Table | Purpose |
|-------|---------|
| `ForgeDashboardRecommendation` | Per-domain recommendation: design, serialized JSON, use case IDs, type (new/enhancement) |
| `ForgeDashboard` | Deployed dashboard tracking: run, domain, dashboard ID, status, URL |

---

## File Reference

| File | Purpose |
|------|---------|
| `lib/dashboard/engine.ts` | Pipeline mode orchestrator |
| `lib/dashboard/adhoc-engine.ts` | Ad-hoc mode orchestrator |
| `lib/dashboard/types.ts` | All TypeScript types (design, Lakeview, recommendation) |
| `lib/dashboard/prompts.ts` | System message and prompt builder |
| `lib/dashboard/assembler.ts` | Lakeview JSON assembler and layout |
| `lib/dashboard/validation.ts` | EXPLAIN validation and metric view checks |
| `lib/dashboard/engine-status.ts` | In-memory job status tracker |
| `lib/pipeline/steps/dashboard-recommendations.ts` | Pipeline step integration |
| `lib/dbx/dashboards.ts` | Lakeview REST API client |
| `lib/genie/schema-allowlist.ts` | Schema allowlist validation (shared with Genie) |
| `lib/ai/sql-reviewer.ts` | LLM-based SQL review (shared) |

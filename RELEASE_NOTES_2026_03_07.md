# Release Notes -- 2026-03-07

**Databricks Forge AI v0.14.0**

---

## New Features

### Metric View Deploy Modal

Deploying metric views from the Metric Views tab now opens a modal dialog where users select the target `catalog.schema` via the Catalog Browser before deployment begins. This replaces the previous silent deploy that used the proposal's original schema scope with no user visibility. Both single-view deploy and "Deploy All Valid" actions use the same modal. The modal shows deployment progress and per-view success/failure results, matching the existing Genie Space deploy UX.

### Metric View Repair Button

Failed and errored metric views now show a "Repair" button (wrench icon) that re-runs the full validation and repair pipeline on a single proposal without requiring a full pipeline re-run. The repair flow:

- Loads the run's cached metadata and rebuilds the schema allowlist
- Applies all deterministic auto-fixes (snowflake join nesting, alias qualification, collision and shadow renaming)
- Re-validates against the allowlist
- If still errored with column issues, invokes LLM repair with full schema context
- Dry-runs the repaired DDL to catch SQL-level errors
- Updates the proposal in Lakebase and resets deployment status to "proposed"

New API endpoint: `POST /api/metric-views/[id]/repair`.

### Metric View Deployment Gate

Metric views are no longer silently auto-deployed to Unity Catalog when deploying Genie spaces or dashboards. Instead, a new dependency check runs before each deploy. If required metric views are missing, a blocking modal appears that:

- Lists which metric views are needed and which have no DDL available
- Lets the user select a target schema via the Catalog Browser
- Deploys each metric view individually with per-view success/failure reporting
- Only allows the parent deploy to proceed once dependencies are satisfied

### Metric View Dependency Check API

New `POST /api/metric-views/check-dependencies` endpoint that performs a read-only probe (via `DESCRIBE TABLE`) for a set of metric view FQNs. Accepts either explicit FQNs or a `runId`+`domain` pair to look up proposals. Returns which are deployed and which are missing, along with proposal metadata the frontend needs to offer deployment.

---

## Improvements

### LLM 429 Rate-Limit Endpoint Fallback

When the primary Model Serving endpoint exhausts its 429 retry budget, the app now automatically falls back to the review endpoint instead of failing. This applies to Genie Engine LLM cache calls and both streaming and non-streaming pipeline agent calls. A centralized `getFallbackEndpoint()` helper resolves the alternate endpoint while avoiding self-fallback loops.

### Metric Views Tab Width Fix (Root Cause)

The Metric Views tab no longer breaks the app layout when descriptions are very long. The root cause was the main column flex item in `app/layout.tsx` lacking `min-w-0`, allowing CSS `min-width: auto` to expand the entire page to content width. Added `min-w-0` to the layout flex column, `overflow-x-hidden` to `<main>`, switched the description from `truncate` to `line-clamp-2 break-words` for word wrapping, and added `break-words` to validation issue lists.

### YAML Copy Buttons on Metric Views

Every YAML preview and DDL code block in the Metric Views tab now has a hover-to-reveal "Copy" button using `navigator.clipboard`, with a 2-second "Copied" confirmation state.

### Dedicated Outcome Map Tab

Industry Outcome Map coverage analysis has been promoted from a buried collapsible section inside the Overview tab to a dedicated top-level "Outcome Map" tab with hero coverage ring, opportunity insight banners, strategic objective cards, and data gap analysis.

---

## Commits (5)

| Hash | Summary |
|---|---|
| `eda89a6` | Add deploy modal with schema picker and repair button for metric views |
| `8953d16` | Fix metric views width overflow by adding min-w-0 to layout flex column |
| `fc2ed03` | Replace silent metric view auto-deploy with user-facing dependency gate |
| `3dd4ce5` | Add 429 rate-limit endpoint fallback to review model |
| `2935f50` | UX fixes: contain metric views width, add YAML copy buttons, promote outcome map to dedicated tab |

**Uncommitted changes:** None.

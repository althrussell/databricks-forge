# Release Notes -- 2026-03-05

**Databricks Forge AI v0.9.0**

---

## New Features

### Space Discovery & Stale Validation
When the Genie Spaces page loads, the system now cross-references workspace spaces against Lakebase tracked spaces to automatically filter out stale entries (spaces deleted from Databricks). Stale spaces are excluded from the UI with a toast notification, but their Lakebase records remain intact for redeployment via pipeline runs. A new `POST /api/genie-spaces/discover` endpoint combines metadata extraction and health scoring in one efficient call using bounded concurrency (5 parallel tasks).

### Space Detail Page
New dedicated page at `/genie/[spaceId]` providing a central hub for each Genie Space with four tabs:
- **Overview** -- key stats (tables, measures, questions, filters, joins, benchmarks), domain, status, and quick actions (Open in Databricks, Run Benchmarks, Clone, View Run)
- **Configuration** -- full `serialized_space` displayed in an accordion layout via the new `SpaceConfigViewer` component
- **Health** -- inline health report with grade, quick wins, category progress bars, per-check details, and Fix/Fix All buttons wired into the optimization review flow
- **Benchmarks** -- link to the benchmark test runner

### Optimization Review Step
Both health fix and benchmark improve workflows now route through an intermediate review step before applying changes. The `OptimizationReview` component displays prioritized suggestions (high/medium/low) with select/deselect checkboxes, strategy summaries, and three actions: Apply to Space, Clone and Apply, or Cancel.

### Diff Preview
New `SpaceDiffViewer` component provides a side-by-side comparison of current vs proposed `serialized_space` configurations. JSON is pretty-printed before diffing with line-level highlights (green for additions, red for removals) and change summary statistics.

### Space Config Viewer
New read-only accordion component displaying all sections of a `SerializedSpace`: Data Sources (Tables, Metric Views), Instructions (Text, Example SQLs, Join Specs), SQL Snippets (Measures, Filters, Expressions), Benchmarks, and Sample Questions, with count badges on each section header.

---

## Improvements

### OBO Authentication for Genie API Reads
Switched `listGenieSpaces()` and `getGenieSpace()` in `lib/dbx/genie.ts` from Service Principal auth (`getAppHeaders`) to OBO auth (`getHeaders`). This forwards the logged-in user's token to enforce user-level permissions, resolving 403 `PERMISSION_DENIED` errors when users lacked table-level access through the SP.

### Space Metadata Extraction Utility
New shared module `lib/genie/space-metadata.ts` extracts structured metadata (12 fields including table count, measure count, filter count, join count, benchmark count) from a `serialized_space` JSON string. Used by both the discover endpoint and the detail endpoint to avoid code duplication.

### Enriched Space Cards
Space cards on the `/genie` list page now display metadata counts (tables, measures, questions, filters) fetched via the discover endpoint, giving users immediate visibility into space composition.

### Benchmark Improve No Longer Auto-Applies
The "Improve" action on the benchmarks page now displays the Optimization Review component instead of automatically applying changes, giving users control over what gets applied.

---

## Other Changes
- New API route: `GET /api/genie-spaces/[spaceId]/detail` returns full space detail in one call
- New API route: `POST /api/genie-spaces/discover` replaces `health-batch` for the list page
- Space card clicks on `/genie` now navigate to the new detail page
- Health Detail Sheet "Fix" action navigates to the detail page health tab (ensuring review step is used)
- Refresh button on Genie Spaces page re-fetches spaces and re-runs discovery
- Clone button exposed on Space Detail overview tab and in Optimization Review ("Clone and Apply")
- Updated `docs/GENIE_HEALTHCHECK_ENGINE.md` with new sections: Space Discovery & Stale Validation, Optimization Review & Diff Preview, CUJ 4 (Clone for Experimentation), expanded file reference

---

## Commits (2)

| Hash | Summary |
|---|---|
| `59735c7` | Refactor logging statements for improved clarity and consistency |
| `f2b6fbf` | Refactor and clean up imports and state management in various components |

**Uncommitted changes:** `app/api/genie-spaces/route.ts` (stale filtering), `app/genie/page.tsx` (discovery + enriched cards + refresh), `app/genie/[spaceId]/benchmarks/page.tsx` (optimization review integration), `lib/dbx/genie.ts` (OBO auth), `docs/GENIE_HEALTHCHECK_ENGINE.md` (updated documentation), plus 7 new files: `app/api/genie-spaces/discover/route.ts`, `app/api/genie-spaces/[spaceId]/detail/route.ts`, `app/genie/[spaceId]/page.tsx`, `components/genie/optimization-review.tsx`, `components/genie/space-config-viewer.tsx`, `components/genie/space-diff-viewer.tsx`, `lib/genie/space-metadata.ts`.

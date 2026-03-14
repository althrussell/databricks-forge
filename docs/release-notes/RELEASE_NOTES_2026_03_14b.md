# Release Notes -- 2026-03-14

**Databricks Forge v0.32.1**

---

## Improvements

### Demo Mode -- Comprehensive Fix and Enhancement

A broad set of fixes and enhancements to the Demo Mode feature introduced in v0.32.0, addressing issues discovered during real-world customer demos.

### Customer Insight Page
New dedicated page at `/demo/sessions/{sessionId}` with a polished, presentation-ready view of all research output -- company overview, SWOT analysis, industry landscape, data strategy, demo flow, killer moments, and competitive positioning. Each section renders conditionally based on the research preset used.

### PPTX and PDF Export
Research results can now be exported as a branded PPTX slide deck (10--12 slides) or a PDF document from the Customer Insight Page or the sessions table. Both formats skip sections where data is unavailable.

### Demo Sessions Listing Page
New `/demo` page with a full sessions table replacing the previous inline list in Settings. Supports row-click navigation, export actions, and delete with confirmation.

### Sidebar Navigation
Demo section appears in the sidebar when `FORGE_DEMO_MODE_ENABLED=true`, with a `useDemoModeEnabled()` hook and `requiresDemoMode` flag for consistent feature gating.

### Research Progress Timeline
Step-by-step timeline in the wizard with completed/active/pending phase indicators, elapsed timer, and human-readable detail messages at every micro-boundary.

### Industry Dropdown
Replaced the free-text industry input with a Select dropdown fetching from `/api/industries`, preventing ID normalization mismatches.

### Enrichment-Only Generation
Outcome map logic now has three cases: skip if both outcome and enrichment exist, generate enrichment only if outcome exists but enrichment is missing, and full generation only when neither exists. Prevents unnecessary regeneration.

---

## Bug Fixes

- **FK constraint violation** -- removed `upsertJobStatus` calls from both demo engine-status modules; demo jobs now use in-memory tracking only (no writes to `ForgeBackgroundJob` which has an FK to `ForgeRun`).
- **Missing table descriptions** -- seed and fact generation now apply `COMMENT ON TABLE` and `ALTER TABLE ... ALTER COLUMN ... COMMENT` via `buildTableCommentDDL`/`buildColumnCommentDDL` after each table creation.
- **LLM token limit failure** -- changed seed and fact generation from `resolveEndpoint("generation")` to `resolveEndpoint("sql")` for 128K output capacity models.
- **Health endpoint caching** -- moved `demoModeEnabled` into the base (unauthenticated) response object in `/api/health` so the demo flag is always available.
- **Industry ID normalization** -- added `normalizeIndustryId()` with kebab-case, starts-with, and name-based fuzzy matching to prevent "Water Utility" vs "water-utilities" mismatches.

---

## Other Changes

- Simplified `demo-settings.tsx` to a link card pointing to `/demo`
- Replaced free-text catalog/schema inputs with `CatalogBrowser` component + "Create new catalog" toggle
- Added `DemoIcon` SVG to sidebar icon set
- Updated `docs/DEMO_MODE.md` with all new features, routes, and file references
- Dense progress messages throughout the Research Engine analytical pipeline

---

## Commits (1)

| Hash | Summary |
|---|---|
| (pending) | fix: Demo Mode comprehensive enhancements -- insight page, export, progress, industry matching, FK fix, table comments |

**Uncommitted changes:** 14 modified files + 4 new files (demo listing page, insight page, export route, PPTX generator, PDF generator).

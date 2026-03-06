# Release Notes -- 2026-03-06

**Databricks Forge AI v0.10.0**

---

## New Features

### SQL Quality Review (LLM-as-Reviewer)
New `lib/ai/sql-reviewer.ts` module uses a dedicated review model (`databricks-gpt-5-4` via `serving-endpoint-review`) to validate generated SQL. Provides `reviewSql()` for single queries, `reviewAndFixSql()` for auto-repair, and `reviewBatch()` for parallel batch review. Opt-in per surface via `isReviewEnabled()`. Shared Databricks SQL quality rules consolidated in `lib/ai/sql-rules.ts` (`DATABRICKS_SQL_RULES`, `DATABRICKS_SQL_RULES_COMPACT`, `DATABRICKS_SQL_REVIEW_CHECKLIST`).

### Shared API Utilities
New `lib/api-utils.ts` provides `handleApiError()`, `requireRun()`, `requireSafeId()`, `assertOk()`, and `isErrorResponse()` -- eliminating ~200 lines of duplicated boilerplate across API routes.

### Genie Deploy Shared Module
Extracted ~600 lines of DDL rewriting, metric view deployment, validation, and space preparation logic from two API routes into `lib/genie/deploy.ts`. Includes `stripFqnPrefixes`, `rewriteDdlTarget`, `sanitizeMetricViewDdl`, `deployAsset`, `deployMetricViews`, `validatePreExistingMetricViews`, `prepareSerializedSpace`, `validateFinalSpace`, and more.

---

## Improvements

### Security Hardening (9 items resolved)
- **HSTS header** -- Added `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` to `next.config.ts`.
- **Rate limiting activated** -- Re-wired `proxy.ts` as Next.js middleware; in-memory sliding-window limiter now active on all `/api/*` routes (3k/min for LLM routes, 12k/min general).
- **Health endpoint tiered response** -- Unauthenticated callers receive only `{ status, version, uptime, timestamp }`; full diagnostics (checks, auth runtime, host) restricted to authenticated users.
- **Error message sanitisation** -- New `lib/error-utils.ts` with `safeErrorMessage()` applied across 80+ API routes. Raw `error.message` no longer leaked to clients in production.
- **Ask Forge prompt injection mitigation** -- User questions wrapped in `---BEGIN USER QUESTION---` / `---END USER QUESTION---` delimiters with marker stripping in `lib/assistant/prompts.ts`.
- **CI security audit** -- Added `npm audit --audit-level=critical` step to `.github/workflows/ci.yml`.
- **Sample data audit logging** -- `fetchSampleData()` now logs structured audit context (run ID, user email, step, sampled table FQNs).
- **Per-user run isolation (Phase 1)** -- `listRuns()` accepts optional `userEmail` parameter; `GET /api/runs` and the runs page now scope results to the logged-in user.
- **SECURITY_ARCHITECTURE.md updated** -- 9 items moved to Resolved section; remaining limitations and recommendations refined.

### Codebase Decomposition (4 mega files split)
- **`app/runs/[runId]/page.tsx`** (1,493 → 246 lines) -- Extracted 11 components (`OverviewTabContent`, `UseCasesTabContent`, `RunHeader`, `IndustryBanner`, `RunProgressCard`, `RunFailedCard`, `RunCancelledCard`, `SummaryCardsSection`, `RunCompletedTabs`, `PbiResultBanner`, `PbiScanDialog`) and 2 hooks (`useRunDetail`, `useUseCaseUpdate`) into `components/pipeline/run-detail/` and `lib/hooks/`.
- **`app/settings/page.tsx`** (1,227 → 248 lines) -- Extracted 9 section components (`ProfileSettings`, `DataSamplingSettings`, `EstateScanSettings`, `SemanticSearchSettings`, `DiscoveryDepthSettings`, `GenieDefaultsSettings`, `ExportSettings`, `AboutSettings`, `DataManagementSettings`) and `useSettingsState` hook into `components/settings/`.
- **`components/pipeline/genie-spaces-tab.tsx`** (1,387 → 211 lines) -- Extracted 7 components (`GenieV1WarningBanner`, `GenieRecommendationRow`, `GenieRecommendationTable`, `GenieSelectionBar`, `GenieDetailAccordion`, `GenieDetailSheet`, `GenieTrashDialog`) and `useGenieSpacesTab` hook.
- **`lib/ai/templates.ts`** (1,433 → 233 lines) -- Split into 9 step-specific modules (`templates-shared`, `templates-business-context`, `templates-filtering`, `templates-usecase-gen`, `templates-domain`, `templates-scoring`, `templates-sql-gen`, `templates-env`, `templates-misc`). Barrel file preserves all existing imports.

### Dead Code Removal & Type Centralisation
- Deleted unused `lib/api-error.ts`.
- Replaced inline pgvector DDL in backfill route with `ensureEmbeddingSchema()` from `lib/embeddings/schema.ts`.
- Removed unused `getPendingSqlQualityChecks()` export.
- Centralised `JoinSpecInput` (5 definitions → 1 in `lib/genie/types.ts`), `SpaceJson` (5 → 1), and `ConversationTurn` (2 → 1).

### Health Check Test Resilience
Updated `perfectSpace` fixture to satisfy all 20 checks in `default-checks.yaml`. Relaxed `emptySpace` test expectations to accept the correct D/F range. Embedded default checks YAML into the registry for bundled environment compatibility.

---

## Bug Fixes
- **Missing middleware** -- `proxy.ts` was disconnected from Next.js during a prior cleanup; re-wired via `middleware.ts` to restore auth guard and rate limiting.
- **AlertDialogFooter closing tag** -- Fixed unclosed JSX tag in `data-management-settings.tsx`.
- **IndustryOutcome type mismatch** -- Fixed `undefined` vs `null` coercion in `RunCompletedTabs` props after decomposition.

---

## Other Changes
- `app.yaml` updated with `serving-endpoint-review` resource binding for SQL quality review model.
- `AGENTS.md` updated with SQL review infrastructure, model routing, and review endpoint documentation.
- Health check registry now reads YAML from embedded string constant rather than filesystem for Databricks Apps compatibility.

---

## Commits (9)

| Hash | Summary |
|---|---|
| `ec7b706` | Enhance Genie Spaces user experience with new features and optimizations |
| `a11923b` | Remove unused import from page.tsx to streamline code and improve maintainability |
| `448aac8` | Update health check registry to embed default checks YAML and improve compatibility with bundled environments |
| `7e29da4` | Enhance SQL quality review capabilities and update related configurations |
| `f3ec910` | Enhance security and error handling across the application |
| `cb64e26` | Update versioning and enhance CI security checks |
| `5cd76a4` | Refactor health check tests and enhance perfectSpace fixture |
| `ae84676` | Remove middleware.ts file as it is no longer needed in the project structure |
| `f155a50` | Standardize error handling across API routes with safeErrorMessage utility |

**Uncommitted changes:** `package.json` (version bump to 0.10.0), plus codebase health audit work: `lib/api-utils.ts` (new), `lib/genie/deploy.ts` (new), `components/pipeline/genie-detail-accordion.tsx` (new), 9 new `lib/ai/templates-*.ts` modules, 11 new `components/pipeline/run-detail/*.tsx` components, 9 new `components/settings/*.tsx` components, 2 new `lib/hooks/use-*.ts` hooks, type centralisations in `lib/genie/types.ts` and `lib/assistant/context-builder.ts`, dead code removal (`lib/api-error.ts` deleted, evaluators cleanup, backfill route simplified).

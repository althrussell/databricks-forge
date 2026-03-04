# Release Notes -- 2026-03-04

**Databricks Forge AI v0.5.0**

---

## New Features

### Pipeline Cancellation
Users can now cancel in-progress pipeline runs directly from the UI. A new `cancelled` status has been added to the run lifecycle, and the pipeline engine gracefully halts step execution when cancellation is requested. Cancelled runs can be resumed later.

### Genie Builder Modal & Question Complexity
Introduced a dedicated Genie Builder modal component (`genie-builder-modal.tsx`) extracted from the inline page, providing a cleaner UX for creating Genie Spaces from Ask Forge. Users can now configure question complexity (simple, medium, complex) when generating example queries, allowing tailored output for different audience levels.

### Custom App Name for Deployments
The `deploy.sh` script now accepts an `--app-name` option for multi-instance Databricks App deployments, enabling isolated naming across environments. Updated `QUICKSTART.md` with usage documentation.

### Superannuation Industry Outcomes
Added a new superannuation-specific industry outcomes module with domain-relevant KPIs and use case templates.

---

## Improvements

### Standardised LLM JSON Parsing
Replaced ad-hoc `parseJSONResponse` calls across all pipeline steps with the robust `parseLLMJson` utility. This provides consistent multi-strategy parsing (direct parse, fence extraction, bracket extraction, repair, and truncation recovery) with structured error logging throughout the codebase.

### `parseLLMJson` Caller Diagnostics *(in progress)*
Added an optional `caller` parameter to `parseLLMJson` and `tryRepairAndParse` so that log entries and error messages identify which pipeline step or module triggered the failure, significantly improving debuggability.

### SQL Generation: Hallucinated Column Detection & Fix Cycle *(in progress)*
The SQL validation step now detects hallucinated columns (columns referenced in generated SQL that don't exist in the schema). When found, a targeted fix prompt is sent to the LLM with an explicit list of valid columns per table. If the fix still contains invalid columns, the SQL is rejected rather than returned with errors.

### SQL Fix Prompt Now Includes Sample Data *(in progress)*
The SQL error-fix template and `attemptSqlFix` function now pass sample data context to the LLM, giving it concrete examples of actual column values when repairing broken queries.

### maxTokens Tuning
Increased `maxTokens` across 17 components including environment intelligence, Genie passes (benchmarks, queries, instructions, joins, titles, trusted assets), pipeline steps (domain clustering, scoring, table filtering, use case generation), assistant engine, and export summaries to accommodate larger and more complex LLM responses.

### AI Query Result Metadata
Added `finishReason` to the `AIQueryResult` interface, capturing whether model output was complete or truncated -- enabling downstream logic to detect and handle incomplete generations.

### Environment Page Component Extraction
Refactored the monolithic environment page (1,400+ lines) into focused components: `aggregate-summary`, `data-maturity-card`, `executive-summary`, `governance-quality-view`, `scan-progress-card`, `scan-trends-panel`, `single-scan-summary`, `stat-card`, and `table-coverage-view`.

### API Error Standardisation
Introduced `lib/api-error.ts` and `lib/fetch-json.ts` utilities for consistent error response formatting across all API routes.

### Genie Space Refactoring
Cleaned up `mergeSpaces` by removing unused `trackedBySpaceId` mapping. Switched `NewGenieSpacePage` to use a ref for `jobId` instead of state to prevent unnecessary re-renders. Removed the `buildGenieUrl` helper in favour of inline logic.

---

## Bug Fixes

- **SQL column validation threshold lowered** -- Previously, unknown column warnings only fired when more than one hallucinated column was detected. Now triggers on any unknown column, catching single-column hallucinations that were previously silently passed through.
- **Removed stale middleware.ts** -- Eliminated the unused authentication/rate-limiting middleware that was interfering with Next.js routing. The file has been renamed to `proxy.ts` to preserve any reusable logic.

---

## Other Changes

- Added `iaisweb.org` to the public host allowlist for benchmark source fetching.
- Added Prettier configuration (`.prettierrc`, `.prettierignore`) for consistent code formatting.
- Added rate-limiting utility (`lib/rate-limit.ts`) for API route protection.
- Genie trash preview component added for space deletion confirmation UX.
- Pipeline run detail page now includes config field, coverage gap card, and summary card sub-components.

---

## Commits (8)

| Hash | Summary |
|------|---------|
| `89ba443` | Enhance deployment script and API functionality |
| `5427ba0` | Add iaisweb.org to public host allowlist |
| `5051052` | Refactor Genie space handling and update API routes |
| `77dd219` | Enhance Genie query generation and question complexity |
| `bb7447f` | Remove middleware.ts, rename to proxy.ts |
| `bf103b6` | Update AI query handling and response parsing |
| `8a51124` | Implement pipeline cancellation feature |
| `d811362` | Update maxTokens parameters across components |

**Uncommitted changes:** `lib/ai/templates.ts`, `lib/genie/passes/parse-llm-json.ts`, `lib/pipeline/steps/sql-generation.ts` (SQL hallucination fix cycle, sample data in fix prompts, parseLLMJson caller diagnostics).

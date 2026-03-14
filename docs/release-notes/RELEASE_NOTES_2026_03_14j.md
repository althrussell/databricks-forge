# Release Notes -- 2026-03-14

**Databricks Forge v0.35.2**

---

## Bug Fixes

- **Demo Data Generator: CTE column scoping error** -- Added a CTE Column Scoping rule to the SQL generation prompt so the LLM no longer references aliased-away column names in downstream CTEs. Also wired the runtime SQL error into the reviewer so retry attempts are informed fixes instead of blind re-reviews.

- **Demo Wizard: auto-launch without pause** -- The completion step no longer auto-launches the discovery pipeline immediately. Users now see the generation summary (tables, rows, duration) and must click "Start Discovery Run" to proceed.

- **Pipeline SQL generation: excessive review latency** -- Removed the per-use-case LLM review call during pipeline SQL generation. EXPLAIN validation and column-hallucination checks still catch runtime errors; the review was adding ~10-15s per use case for mostly cosmetic warnings.

- **SQL generation progress bar premature completion** -- Fixed the progress interpolation range (67-95 changed to 67-79) so the UI no longer marks SQL generation as "done" when only half the use cases are processed.

---

## Other Changes

- `ReviewOptions` in `lib/ai/sql-reviewer.ts` now supports an optional `runtimeError` field, injected as a priority section in the review prompt for any consumer that needs error-targeted fixes.

---

## Commits (1)

| Hash | Summary |
|---|---|
| *(uncommitted)* | fix: demo data retry, wizard pause, pipeline SQL speed, progress bar accuracy |

**Uncommitted changes:** `components/demo/steps/complete-step.tsx`, `lib/ai/sql-reviewer.ts`, `lib/demo/data-engine/engine.ts`, `lib/demo/data-engine/prompts.ts`, `lib/pipeline/steps/sql-generation.ts`, `package.json`

# Release Notes -- 2026-03-14

**Databricks Forge v0.35.1**

---

## Bug Fixes

- **SQL reviewer severity inflation** -- The LLM-based SQL reviewer was classifying stylistic and idiom issues (e.g. missing COLLATE, no explicit window frame) as "error" severity, which forced expensive fix cycles on functional SQL. Added explicit severity classification guidance so only runtime failures (syntax errors, hallucinated columns, wrong JOINs) produce `fixed_sql`. Warnings and info issues are reported but no longer trigger rewrites. Affects all engines: pipeline, dashboard, and Genie.

- **Missing skill injection in pipeline SQL generator** -- The `{skill_reference}` placeholder was computed by the pipeline SQL generation step but never actually inserted into the `USE_CASE_SQL_GEN_PROMPT` template. The generator was operating without the SQL craft knowledge from the skills system. Now wired correctly.

---

## Improvements

### Databricks SQL dialect context block
Added a compact quick-reference of Databricks SQL dialect differences (e.g. `PERCENTILE_APPROX` not `MEDIAN`, `array_join(collect_list(...))` not `STRING_AGG`, named window limitations) directly in the pipeline SQL generator prompt. This reduces first-pass errors from generators unfamiliar with Databricks idioms.

### Pre-response self-check for SQL generators
New `DATABRICKS_SQL_SELF_CHECK` exported from `lib/toolkit/sql-rules.ts` -- a structured checklist (correctness, performance, readability, Databricks idioms) that the generator must verify before responding. Injected into the pipeline SQL generation prompt.

### Enhanced SQL review fix logging
When the reviewer applies a fix in the pipeline, logs now include `qualityScore`, `verdict`, `issueCount`, and the top 3 issues sorted by severity. This improves observability for diagnosing persistent review failures.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `24c5d79` | fix: reduce SQL review severity inflation and inject missing skill reference into pipeline generator |

**Uncommitted changes:** Version bump to 0.35.1 + this release notes file.

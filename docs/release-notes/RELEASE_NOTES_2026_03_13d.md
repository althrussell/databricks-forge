# Release Notes -- 2026-03-13

**Databricks Forge v0.30.0**

---

## New Features

### Hierarchical Domain Progress UI
Added a rich, collapsible per-domain progress panel to the Genie Engine workbench. Each domain shows its current phase (expressions, joins, assets, assembly), a thin progress bar, status icon, and elapsed time. The top-level bar remains for overall progress while the detail panel provides granular visibility into long-running generation jobs.

---

## Improvements

### Genie Engine Performance Overhaul
Dramatic runtime reduction targeting sub-5 minutes (from ~17 minutes) through six optimization strategies:
- **Parallel subdomain processing**: Metric view generation now runs up to 3 subdomains concurrently via `mapWithConcurrency` instead of sequentially.
- **Parallel dry-run validation**: All metric view dry-runs execute concurrently via `Promise.all` instead of one-by-one.
- **Smarter model routing**: Opus models restricted to reasoning-only tier; semantic expressions downgraded to classification tier for faster inference.
- **Reduced SQL review overhead**: Metric view and join inference reviews disabled by default (validated by YAML parser + dry-run instead); `SQL_REVIEW_CONCURRENCY` bumped from 4 to 6.
- **Lower token budgets**: `maxTokens` reduced across all passes -- semantic expressions (8K to 4K), trusted assets (32K to 12K), benchmarks (32K to 8K), metric views (32K to 16K), column intelligence (32K to 12K).
- **Skip metric view planning**: New `skipMetricViewPlanning` config option (default: true) eliminates an LLM call per domain.

### Empty LLM Response Resilience
- Empty content from Model Serving is now detected inside the retry loop, triggering genuine retries with exponential backoff (up to 3 attempts).
- Empty responses are never cached, preventing cache poisoning that caused downstream parse failures.
- Diagnostic logging added in `model-serving.ts` and `sql-reviewer.ts` for traceability.
- Review surface env var is restored in a `finally` block to prevent cross-feature side effects.

---

## Commits (2)

| Hash | Summary |
|---|---|
| `ea69642` | feat: Genie Engine performance overhaul + hierarchical progress UI + empty response resilience |
| `94f6448` | chore: format codebase with Prettier |

**Uncommitted changes:** Version bump to 0.30.0 and this release notes file.

# Release Notes -- 2026-03-13

**Databricks Forge v0.29.1**

---

## Improvements

### Scoped Structured Logging
Introduced `createScopedLogger` factory that produces loggers carrying immutable structured context -- `origin`, `task`, `module`, `fn`, `runId`, `errorCategory`, and `phase` -- through every log entry. Replaced the flat singleton logger across 51 files covering the full stack:

- **Pipeline Engine** -- root logger per run with per-step children carrying `task` and `module`; automatic lifecycle `start`/`end` entries with `durationMs` via the `logStep` wrapper.
- **All 10 pipeline steps** -- use `ctx.logger` with `fn` and `errorCategory` on every warn/error; removed manual `[step-name]` prefixes and redundant `{ runId }` metadata.
- **Genie, Comment, Dashboard, and Estate Scan engines** -- orchestrators create scoped loggers with `origin` set to `GenieEngine`, `CommentEngine`, `DashboardEngine`, or `EstateScan`; sub-passes receive child loggers.
- **9 high-priority API routes** -- use `apiLogger(route, method, { runId })` for request-scoped logging.
- **8 infrastructure modules** -- `prisma.ts`, `provision.ts`, `embed-pipeline.ts`, `assistant/engine.ts`, `context-builder.ts`, `rate-limiter.ts`, `sql-reviewer.ts`, `llm-cache.ts`.

Key capabilities:
- **`child(extra)`** -- nest loggers by adding task/module context without losing parent context.
- **`timed(message, work)`** -- auto-emit paired `start`/`end` entries with `durationMs`.
- **Error categories** -- standardised `errorCategory` values (`llm_timeout`, `sql_hallucination`, `schema_validation`, `auth`, `db`, `network`, etc.) for pattern matching.
- **Dev breadcrumbs** -- human-readable `origin > task > fn | message (phase)` format with correlation ID tags.
- **Production JSON** -- every entry includes `origin`, `task`, `module`, `fn`, `runId`, `phase`, `errorCategory` for structured querying.
- **Backward compatible** -- the singleton `logger` continues to work; unmigrated files function unchanged.

### Updated Logger Port Interface
`ScopedLogger` extends `Logger` with `child()`, `timed()`, and `context` -- any code typed `Logger` accepts a `ScopedLogger` without changes.

---

## Other Changes
- Added optional `logger` field to `PipelineContext` for scoped logger injection.
- Updated 9 test files to include `createScopedLogger` in logger mocks.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `2e3f70d` | refactor: introduce scoped logging with origin, module, and error category tracking |

**Uncommitted changes:** Version bump to 0.29.1, release notes.

# Changelog

All notable changes to Databricks Inspire AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2026-02-16

### Added

- **Error boundaries**: `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` for graceful error handling
- **Health check endpoint**: `GET /api/health` with database and warehouse connectivity checks
- **Structured logging**: `lib/logger.ts` with JSON output in production, log levels, and correlation IDs
- **Fetch timeouts**: `AbortController`-based timeouts on all Databricks API calls (SQL, OAuth, Workspace)
- **Input validation**: Zod schemas for API route inputs (`POST /api/runs`, `GET /api/metadata`)
- **SQL injection prevention**: Strict identifier regex validation for catalog/schema names
- **UUID validation**: All `runId` params validated as UUIDs before database lookup
- **Security headers**: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
- **Mobile navigation**: Sheet-based hamburger menu for small screens
- **Settings skeleton**: Loading state for settings page during hydration
- **Test infrastructure**: Vitest setup with 45 tests covering scoring, templates, parsers, validation
- **CI pipeline**: GitHub Actions workflow for lint, typecheck, test, and build
- **Versioning**: App version surfaced in `/api/health`, sidebar footer, and pipeline run metadata
- **Database indexes**: Indexes on `InspireUseCase(runId)`, `InspireExport(runId)`, `InspireMetadataCache(cachedAt)`
- **Retry discrimination**: AI agent only retries on 5xx/timeout/network errors, not 4xx
- **Atomic persistence**: Pipeline use case persistence wrapped in Prisma `$transaction`
- **Nested error handling**: Pipeline engine catch block now handles `updateRunStatus` failures

### Changed

- `next.config.ts`: Added `output: 'standalone'`, `reactStrictMode: true`, `poweredByHeader: false`
- Polling in runs list and run detail pages now uses `AbortController` and only polls when runs are active
- Pipeline engine migrated from `console.*` to structured `logger.*` calls

### Fixed

- Docker build failure due to missing `output: 'standalone'` in Next.js config
- Potential SQL injection via unvalidated catalog/schema names in metadata queries
- Race conditions in frontend polling (overlapping fetches, stale closures)
- Non-atomic delete+insert of use cases could leave runs in inconsistent state
- Settings page blank screen during hydration (now shows skeleton loader)

## [0.1.0] - Initial Release

### Added

- Pipeline engine with 7 steps (business context, metadata extraction, table filtering, use case generation, domain clustering, scoring, SQL generation)
- LLM integration via Databricks `ai_query()` with temperature and token control
- Export to Excel, PDF, PowerPoint, and SQL notebooks
- Prompt engineering with JSON output, negative examples, and quantity guidance
- Lakebase persistence with Prisma ORM
- shadcn/ui frontend with dark mode, sidebar navigation

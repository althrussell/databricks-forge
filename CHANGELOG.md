# Changelog

All notable changes to Databricks Forge AI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-02-17

### Changed

- **LLM integration migrated to Model Serving REST API**: Replaced `ai_query()` SQL function with direct calls to Databricks Model Serving chat completions endpoint (`/serving-endpoints/{endpoint}/invocations`). This eliminates SQL Warehouse overhead for LLM inference, reducing latency and improving reliability.
- **JSON mode for structured outputs**: Table filtering and use case generation now use `response_format: json_object` instead of CSV parsing, improving parse reliability and eliminating regex-based extraction.
- **Streaming support for SQL generation**: Step 7 now uses SSE streaming via Model Serving, improving perceived latency for long SQL generation calls.
- **Token usage tracking**: All LLM calls now capture prompt, completion, and total token counts from Model Serving responses and persist them in prompt logs for cost analysis.
- **Chain-of-thought prompts**: Table filtering and scoring prompt templates now include explicit reasoning workflow sections, improving LLM decision quality.
- **System/user message separation**: Prompts now use the chat completions format with separate system and user messages, providing better prompt hygiene and structural isolation.
- Updated all documentation (AGENTS.md, README.md, SECURITY_ARCHITECTURE.md, FORGE_ANALYSIS.md, FORGE_V1_vs_V2.md, docs/ARCHITECTURE.md, docs/PIPELINE.md, docs/DEPLOYMENT.md) to reflect the new Model Serving architecture.
- Updated Cursor rules (01-architecture, 04-ai-guardrails, 05-testing) for new architecture conventions.

### Added

- `lib/dbx/model-serving.ts` -- new Model Serving client with chat completions, streaming, token usage, and custom error handling.
- `promptTokens`, `completionTokens`, `totalTokens` fields on `ForgePromptLog` Prisma model.

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
- **Database indexes**: Indexes on `ForgeUseCase(runId)`, `ForgeExport(runId)`, `ForgeMetadataCache(cachedAt)`
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

# AGENTS.md -- Databricks Forge AI

> Single source of truth for any AI agent working on this codebase.

## Project Purpose

Databricks Forge AI is a web application that discovers data-driven use cases
from Unity Catalog metadata using LLM-powered analysis. Customers configure a
business context, point at their UC catalogs/schemas, and the app generates
scored, categorised use cases with optional SQL code, exported as Excel, PDF,
PowerPoint, or deployed as SQL notebooks.

## Tech Stack

| Layer          | Technology                                           |
| -------------- | ---------------------------------------------------- |
| Frontend       | Next.js 16 App Router, React 19, shadcn/ui, Tailwind CSS 4 |
| Language       | TypeScript (strict)                                  |
| SQL Execution  | Databricks SQL Statement Execution API via SQL Warehouse |
| LLM Calls      | Databricks Model Serving REST API (chat completions) |
| Embeddings     | Databricks Model Serving (databricks-qwen3-embedding-0-6b, 1024-dim) |
| Vector Search  | pgvector extension in Lakebase (HNSW index)          |
| Persistence    | Lakebase (Unity Catalog managed tables)              |
| Deployment     | Databricks Apps (auto-auth via env vars)             |
| Export         | exceljs, pdfkit, pptxgenjs, Workspace REST API       |

## Deployment Model

This app runs as a **Databricks App**. Authentication is automatic:

- `DATABRICKS_HOST` and token are injected by the platform.
- `DATABRICKS_APP_PORT` controls the listen port (fallback: 3000).
- SQL Warehouse is bound as an app resource (no hardcoded warehouse IDs).
- Embedding endpoint (`serving-endpoint-embedding`) defaults to `databricks-qwen3-embedding-0-6b`.
- Review endpoint (`serving-endpoint-review`) defaults to `databricks-gpt-5-4` for LLM-as-reviewer SQL quality checks.
- Lakebase scale-to-zero is enforced at every startup (default: 300s timeout). Override with `LAKEBASE_SCALE_TO_ZERO_TIMEOUT` or `--lakebase-no-scale-to-zero`.
- Local dev uses `DATABRICKS_TOKEN` (PAT) in `.env.local`.

## Folder Contract

```
/app          Routes + UI (pages, layouts, API routes)
/components   Shared UI components (shadcn primitives, pipeline-specific)
/lib          Data, auth, config, scoring, AI, pipeline logic
  /ports      Abstract interfaces for DI (LLMClient, SqlExecutor, SkillResolver, Logger, EngineProgress)
    /defaults Databricks wiring: concrete port implementations
  /toolkit    Shared cross-engine utilities (concurrency, parse-llm-json, llm-cache, sql-rules, token-budget, retry)
  /sql-engine Unified SQL generation + validation + review pipeline
  /dbx        Databricks SQL client, Model Serving client, Workspace API
  /queries    SQL text + row-to-type mappers
  /domain     TypeScript types + scoring logic
  /ai         Prompt template building + Model Serving execution
    /comment-engine  Multi-pass Comment Engine (table + column + consistency)
  /metadata   Shared schema context layer (reusable across features)
  /pipeline   Pipeline engine + step modules
  /lakebase   Lakebase table schema + CRUD operations
  /embeddings Embedding client, pgvector store, text composition, RAG retriever
  /export     Excel, PDF, PPTX, notebook generators
/docs         Specs, references, and deployment docs
/__tests__    Unit and integration tests
```

## Domain Types

These are the core TypeScript types used throughout the app:

| Type               | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `PipelineRun`      | A single pipeline execution (config + status)    |
| `UseCase`          | A generated use case with scores and metadata    |
| `BusinessContext`   | LLM-generated business context (goals, priorities, value chain) |
| `MetadataSnapshot` | Cached UC metadata (tables, columns, FKs)        |
| `ExportRecord`     | Record of an export (format, path, timestamp)    |
| `PipelineStep`     | Enum of pipeline step identifiers                |
| `EnvironmentScan`  | A completed estate scan (scope, counts, scores)  |
| `TableDetail`      | Per-table structural + LLM metadata              |
| `TableHistorySummary` | Delta history insights per table              |
| `LineageEdge`      | Directed edge in the data lineage graph          |
| `ERDGraph`         | Entity-relationship graph (nodes + edges)        |
| `TableHealthInsight` | Health score + issues + recommendations        |
| `ValueEstimate`    | Per-use-case financial estimate (low/mid/high)   |
| `RoadmapPhaseAssignment` | Delivery phase + effort + dependencies     |
| `UseCaseTrackingEntry` | Lifecycle stage from discovered to measured   |
| `StakeholderProfile` | Role/department impact profile with champion flags |
| `ExecutiveSynthesis` | Board-ready findings, recommendations, risks   |
| `BusinessValuePortfolio` | Cross-run portfolio aggregation             |
| `StrategyDocument` | Uploaded strategy with parsed initiatives         |
| `SchemaContext`    | Enriched schema view: tables, columns, domains, roles, tiers, relationships, lineage, naming profile (`lib/metadata/types.ts`) |
| `EnrichedTable`    | Table with deterministic + LLM classifications (domain, role, tier, data asset mapping, write frequency) |
| `EnrichedColumn`   | Column with inferred role (pk, fk, timestamp, flag, measure, code) and FK target |
| `InferredRelationship` | Cross-table relationship from naming patterns, FK constraints, or LLM inference |
| `CommentEngineResult` | Output of the Comment Engine: table + column comments, schema context, consistency fixes, stats |

## Pipeline Steps (Discover Usecases)

The core pipeline runs these steps sequentially:

1. **business-context** -- Generate business context via Model Serving (goals, priorities, value chain) **[fast]**
2. **metadata-extraction** -- Query `information_schema` for catalogs, schemas, tables, columns
3. **table-filtering** -- Classify tables as business vs technical via Model Serving (JSON mode) **[fast]**
4. **usecase-generation** -- Generate use cases in parallel batches via Model Serving (JSON mode) **[premium]**
5. **domain-clustering** -- Assign domains and subdomains via Model Serving (JSON mode) **[fast]**
6. **scoring** -- Score **[premium]**, deduplicate **[fast]**, calibrate **[premium]**, and rank use cases
7. **sql-generation** -- Generate bespoke SQL for each use case via Model Serving (streaming) **[premium]**
8. **business-value-analysis** -- Financial quantification, roadmap phasing, executive synthesis, stakeholder analysis via Model Serving (JSON mode) **[fast]**

Each step updates progress in Lakebase. The frontend polls for status.

## Genie Engine (Post-Pipeline)

The Genie Engine (`lib/genie/engine.ts`) generates Databricks Genie Space
recommendations from pipeline results. See `docs/GENIE_ENGINE.md` for full documentation.

Key modules:
- `lib/genie/engine.ts` -- orchestrator (table selection + up to 8 LLM passes)
- `lib/genie/assembler.ts` -- assembles pass outputs into `SerializedSpace` v2 payload (alias-based join SQL, relationship type encoding)
- `lib/genie/types.ts` -- all Genie types (`GenieEngineConfig`, `SerializedSpace`, etc.)
- `lib/genie/time-periods.ts` -- auto-generated date filters/dimensions with fiscal year support
- `lib/genie/entity-extraction.ts` -- sample-data-driven entity matching
- `lib/genie/schema-allowlist.ts` -- grounded generation (only scraped columns/tables, CREATE DDL exclusion)
- `lib/genie/passes/` -- individual LLM pass modules (column intelligence, semantic expressions, trusted assets, benchmarks, metric views)
- `lib/genie/passes/parse-llm-json.ts` -- robust LLM JSON parsing utility
- `lib/genie/recommend.ts` -- legacy (non-engine) Genie recommendation fallback
- `lib/genie/engine-status.ts` -- in-memory progress tracker
- `lib/genie/llm-cache.ts` -- in-memory LLM response cache with retry logic
- `lib/genie/concurrency.ts` -- bounded-concurrency execution utility
- `lib/ai/sql-rules.ts` -- shared Databricks SQL quality rules (`DATABRICKS_SQL_RULES`, `DATABRICKS_SQL_RULES_COMPACT`, `DATABRICKS_SQL_REVIEW_CHECKLIST`)
- `lib/ai/sql-reviewer.ts` -- LLM-as-reviewer SQL quality module (`reviewSql`, `reviewAndFixSql`, `reviewBatch`) using `serving-endpoint-review`
- `lib/dbx/genie.ts` -- Databricks Genie REST API client (create/update/trash spaces, payload sanitization)
- `lib/lakebase/genie-recommendations.ts` -- persistence for generated recommendations
- `lib/lakebase/genie-engine-config.ts` -- versioned engine config per run
- `lib/lakebase/genie-spaces.ts` -- deployed space tracking

Data model: `GenieEngineConfig`, `GenieEnginePassOutputs`, `SerializedSpace`,
`GenieSpaceRecommendation`, `GenieEngineRecommendation` (see `lib/genie/types.ts`).

## Business Value Engine (Post-Pipeline)

The Business Value Engine (`lib/pipeline/steps/business-value-analysis.ts`) runs
as pipeline step 8, producing financially-grounded deliverables from scored use
cases. See `docs/BUSINESS_VALUE.md` for full documentation.

Key modules:
- `lib/pipeline/steps/business-value-analysis.ts` -- orchestrator (4 LLM passes)
- `lib/ai/templates-business-value.ts` -- prompt templates (financial quantification, roadmap phasing, executive synthesis, stakeholder analysis)
- `lib/lakebase/value-estimates.ts` -- CRUD for `ForgeValueEstimate`
- `lib/lakebase/roadmap-phases.ts` -- CRUD for `ForgeRoadmapPhase`
- `lib/lakebase/use-case-tracking.ts` -- CRUD for `ForgeUseCaseTracking`
- `lib/lakebase/value-captures.ts` -- CRUD for `ForgeValueCapture`
- `lib/lakebase/strategy-documents.ts` -- CRUD for `ForgeStrategyDocument` + `ForgeStrategyAlignment`
- `lib/lakebase/stakeholder-profiles.ts` -- CRUD for `ForgeStakeholderProfile`
- `lib/lakebase/portfolio.ts` -- cross-run portfolio aggregation

Data model: `ForgeValueEstimate`, `ForgeRoadmapPhase`, `ForgeUseCaseTracking`,
`ForgeValueCapture`, `ForgeStrategyDocument`, `ForgeStrategyAlignment`,
`ForgeStakeholderProfile` (see Prisma schema). `ForgeRun.synthesisJson` stores
executive synthesis output.

## Genie Health Check Engine

The Health Check Engine (`lib/genie/space-health-check.ts`) provides a deterministic
scoring system for any Genie Space, an automated Fix Workflow, and an iterative
Benchmark Feedback Loop. See `docs/GENIE_HEALTHCHECK_ENGINE.md` for full documentation.

Key modules:
- `lib/genie/health-checks/default-checks.yaml` -- 20 built-in check definitions (YAML DSL)
- `lib/genie/health-checks/evaluators.ts` -- 11 deterministic evaluator functions
- `lib/genie/health-checks/registry.ts` -- YAML parser, merge defaults + user overrides
- `lib/genie/health-checks/types.ts` -- TypeScript types for the health check system
- `lib/genie/space-health-check.ts` -- scorer (pure function, no LLM calls)
- `lib/genie/space-fixer.ts` -- fix strategy router, metadata builder for off-platform spaces
- `lib/genie/space-cache.ts` -- in-memory serialized_space cache (5min TTL)
- `lib/genie/benchmark-feedback.ts` -- feedback-to-fix analysis
- `lib/lakebase/space-health.ts` -- CRUD for health scores, benchmark runs, config
- `components/genie/health-detail-sheet.tsx` -- health report slide-out panel

Data model: `ForgeSpaceBenchmarkRun`, `ForgeSpaceHealthScore`, `ForgeHealthCheckConfig`
(see Prisma schema).

## Estate Scan Pipeline (Environment Intelligence)

The estate pipeline (`lib/pipeline/standalone-scan.ts`) scans Unity Catalog
metadata and applies LLM intelligence to produce a comprehensive view of the
data estate. See `ESTATE_ANALYSIS.md` for full documentation.

Key modules:
- `lib/queries/metadata.ts` -- table/column discovery from `information_schema`
- `lib/queries/metadata-detail.ts` -- DESCRIBE DETAIL/HISTORY/TBLPROPERTIES
- `lib/queries/lineage.ts` -- BFS lineage walking via `system.access.table_lineage`
- `lib/domain/health-score.ts` -- rule-based health scoring (10 rules)
- `lib/pipeline/environment-intelligence.ts` -- 8 LLM passes (domains, PII, descriptions, redundancy, relationships, tiers, data products, governance)
- `lib/export/erd-generator.ts` -- ERD graph builder + Mermaid export
- `lib/export/environment-excel.ts` -- 12-sheet Excel report
- `lib/lakebase/environment-scans.ts` -- persistence + aggregate estate view
- `lib/pipeline/scan-progress.ts` -- in-memory progress tracker

Data model: `ForgeEnvironmentScan`, `ForgeTableDetail`, `ForgeTableHistorySummary`,
`ForgeTableLineage`, `ForgeTableInsight` (see Prisma schema).

## Shared Metadata Context Layer

The `lib/metadata/` module provides a reusable, extractable schema understanding
layer. Any feature that needs to understand a Unity Catalog schema holistically
can call `buildSchemaContext()` to get a fully classified, relationship-aware,
lineage-enriched view. Zero Forge-specific dependencies -- could be extracted
as a standalone package.

Key modules:
- `lib/metadata/types.ts` -- `SchemaContext`, `EnrichedTable`, `EnrichedColumn`, `NamingSignals`, `InferredRelationship` (zero internal imports)
- `lib/metadata/deterministic.ts` -- pure functions: tier/role detection from naming prefixes, column role inference (`_id`→FK, `_at`→timestamp, `is_`→flag, `_amount`→measure), FK target inference, write frequency analysis, schema naming profile
- `lib/metadata/fetcher.ts` -- orchestrates `lib/queries/` modules to fetch tables, columns, FKs, comments, types, tags, lineage (`walkLineage`), and history (`enrichTablesInBatches`); all enrichments gracefully optional
- `lib/metadata/classifier.ts` -- LLM-based schema intelligence: domain, role, tier, and industry data asset mapping per table; token-aware batching for large schemas; deterministic fallback on LLM failure
- `lib/metadata/context-builder.ts` -- `buildSchemaContext(scope, options)` top-level orchestrator producing `SchemaContext`

Current consumer: Comment Engine. Future consumers: Genie Engine, Ask Forge,
data quality rules, documentation generation.

## AI Comments (Industry-Aware Catalog Documentation)

The Comment Engine (`lib/ai/comment-engine/engine.ts`) generates the highest-quality
table and column descriptions by building holistic schema understanding before
describing any individual table. Optimised for Genie Space discoverability.

Architecture (4 phases):
1. **Phase 0+1: Schema Context** -- `buildSchemaContext()` fetches all metadata, runs deterministic analysis (naming patterns, FK inference), then LLM classification (domain, role, tier, data asset mapping)
2. **Phase 2: Table Comments** -- batched table descriptions with full schema summary, industry Reference Data Assets, use case linkages, lineage, and write-frequency signals
3. **Phase 3: Column Comments** -- parallel per-table column descriptions with domain context, related tables, data asset descriptions, and deterministic role hints
4. **Phase 4: Consistency Review** -- terminology consistency, cross-table reference accuracy, and Genie-readiness audit (optional, on by default)

Comment Engine modules:
- `lib/ai/comment-engine/engine.ts` -- main orchestrator (wires schema context + industry knowledge through all passes)
- `lib/ai/comment-engine/prompts.ts` -- prompt templates for table, column, and consistency review passes (Genie-optimised)
- `lib/ai/comment-engine/table-pass.ts` -- Phase 2 implementation
- `lib/ai/comment-engine/column-pass.ts` -- Phase 3 implementation
- `lib/ai/comment-engine/consistency-pass.ts` -- Phase 4 implementation
- `lib/ai/comment-engine/types.ts` -- `CommentEngineConfig`, `CommentEngineResult`, `ConsistencyFix`

Industry knowledge (enriches all prompts):
- `lib/domain/industry-outcomes-server.ts` -- `buildDataAssetContext()` renders Reference Data Assets; `buildUseCaseLinkageContext()` maps assets to use cases with criticality and benchmark impacts

DDL + persistence layer:
- `lib/ai/comment-generator.ts` -- facade: delegates to Comment Engine, persists proposals to Lakebase
- `lib/ai/comment-applier.ts` -- DDL execution, permission checking, undo
- `lib/lakebase/comment-jobs.ts` -- CRUD for `ForgeCommentJob`
- `lib/lakebase/comment-proposals.ts` -- CRUD for `ForgeCommentProposal`

UI modules:
- `app/environment/comments/page.tsx` -- main AI Comments page (setup, review, apply)
- `components/environment/comment-table-nav.tsx` -- table navigator panel
- `components/environment/comment-review-panel.tsx` -- old-vs-new review with inline editing
- `components/environment/comment-action-bar.tsx` -- bulk apply/undo sticky bar

Data model: `ForgeCommentJob`, `ForgeCommentProposal` (see Prisma schema).

API routes:
- `POST /api/environment/comments` -- create job
- `GET /api/environment/comments` -- list jobs
- `POST /api/environment/comments/generate` -- SSE generation stream
- `GET /api/environment/comments/[jobId]` -- job detail + proposals
- `PATCH /api/environment/comments/[jobId]/proposals` -- accept/reject/edit
- `POST /api/environment/comments/[jobId]/apply` -- apply DDL to UC
- `POST /api/environment/comments/[jobId]/undo` -- restore original comments
- `POST /api/environment/comments/check-permissions` -- SHOW GRANTS pre-check

## Ask Forge (Conversational Assistant)

Ask Forge is a RAG-powered conversational AI assistant. See `ASK_FORGE.md`
for full documentation.

Key modules:
- `lib/assistant/engine.ts` -- orchestrator (intent → context → LLM → actions)
- `lib/assistant/intent.ts` -- LLM-based intent classification with heuristic fallback
- `lib/assistant/context-builder.ts` -- dual-strategy context pipeline (Lakebase + RAG)
- `lib/assistant/prompts.ts` -- system prompt, user template, message builder
- `lib/assistant/sql-proposer.ts` -- SQL extraction, validation (EXPLAIN)
- `lib/assistant/dashboard-proposer.ts` -- dashboard intent detection and proposal extraction
- `lib/lakebase/assistant-log.ts` -- CRUD for `ForgeAssistantLog` table
- `lib/lakebase/conversations.ts` -- CRUD for `ForgeConversation` (per-user chat history)
- `components/assistant/ask-forge-chat.tsx` -- main chat component (SSE streaming, actions)
- `components/assistant/ask-forge-context-panel.tsx` -- side panel (tables, sources, enrichments)
- `components/assistant/conversation-history.tsx` -- ChatGPT-like history sidebar
- `components/assistant/answer-stream.tsx` -- real-time markdown rendering (`react-markdown` + `remark-gfm`)
- `app/ask-forge/page.tsx` -- thin client shell with dynamic import (`ssr: false`)
- `app/ask-forge/ask-forge-content.tsx` -- main page content (history, chat, context panel)

Data model: `ForgeAssistantLog`, `ForgeConversation`, `ConversationMessage`,
`TableEnrichmentData`, `SourceData`, `ActionCardData` (see `lib/assistant/` and Prisma schema).

API routes:
- `POST /api/assistant` -- SSE streaming endpoint
- `POST /api/assistant/feedback` -- thumbs up/down feedback
- `GET /api/assistant/conversations` -- list user conversations
- `POST /api/assistant/conversations` -- create conversation
- `GET /api/assistant/conversations/[id]` -- load conversation with messages
- `PATCH /api/assistant/conversations/[id]` -- rename conversation
- `DELETE /api/assistant/conversations/[id]` -- delete conversation and logs

## Infrastructure

| Concern            | Implementation                                              |
| ------------------ | ----------------------------------------------------------- |
| Logging            | `lib/logger.ts` -- structured JSON in prod, formatted in dev |
| Validation         | `lib/validation.ts` -- Zod schemas, SQL identifier safety   |
| Fetch timeouts     | `lib/dbx/fetch-with-timeout.ts` -- AbortController wrappers |
| Error boundaries   | `app/error.tsx`, `app/global-error.tsx`, `app/not-found.tsx` |
| Health check       | `GET /api/health` -- DB + warehouse connectivity            |
| Security headers   | Via `next.config.ts` `headers()` function                   |
| Versioning         | `package.json` version in `/api/health`, sidebar, run metadata |
| Model routing      | `getFastServingEndpoint()` routes classification/enrichment to fast model across all pipelines; falls back to premium if `serving-endpoint-fast` is not configured |
| SQL review         | `getReviewEndpoint()` routes SQL quality review to dedicated review model (`databricks-gpt-5-4` via `serving-endpoint-review`); `lib/ai/sql-reviewer.ts` provides `reviewSql()`, `reviewAndFixSql()`, `reviewBatch()`; opt-in per surface via `isReviewEnabled()` |
| Embeddings         | `lib/embeddings/client.ts` -- `databricks-qwen3-embedding-0-6b` (1024-dim) via `getEmbeddingEndpoint()`; batched (16/req) with 429/5xx retry |
| Vector search      | `lib/embeddings/store.ts` -- pgvector in Lakebase; `forge_embeddings` table with HNSW index; 12 entity kinds covering all estate + pipeline data |
| LLM cache + retry  | `lib/toolkit/llm-cache.ts` -- in-memory SHA-256-keyed cache (10min TTL) with 429/5xx retry |
| Concurrency        | `lib/toolkit/concurrency.ts` -- bounded-concurrency utility for parallel domains and batches |
| Toolkit            | `lib/toolkit/` -- shared utilities relocated from engine-specific paths for cross-engine reuse |
| Port interfaces    | `lib/ports/` -- abstract DI interfaces (LLMClient, SqlExecutor, SkillResolver, Logger, EngineProgress) |
| SQL Engine         | `lib/sql-engine/` -- unified generate/validate/review/fix pipeline behind LLMClient port |

## Engine Portability Architecture

All four primary engines (Comment, Genie, Dashboard, Health Check) accept optional
`deps` objects for dependency injection:

- **`CommentEngineDeps`** -- LLM client, logger, pre-built schema context, industry context
- **`GenieEngineDeps`** -- LLM client, logger
- **`DashboardEngineDeps`** -- LLM client, logger, reviewAndFixSql, isReviewEnabled
- **Health Check** -- injectable `reviewBatch` and `isReviewEnabled` functions via setter

Default Databricks implementations live in `lib/ports/defaults/` and wire the
ports to the concrete infrastructure (`model-serving`, `sql.ts`, `logger`, `skills/resolver`).

Shared utilities live in `lib/toolkit/` with deprecated re-export stubs at the
original paths for backward compatibility.

## Key Constraints

- **No raw SQL in components** -- all SQL lives in `/lib/queries/` (rule 01)
- **No hardcoded credentials** -- use Databricks Apps env vars (rule 00)
- **Loading/empty/error states** on every page and async component (rule 00)
- **Primary CTA per page** must be visually dominant (rule 02, rule 06)
- **Prompt templates** must include business context, metadata scope, and output format spec
- **SQL quality rules** -- all SQL-generating prompts must import rules from `lib/ai/sql-rules.ts` (never inline ad-hoc rules)
- **Privacy** -- only metadata (schemas, table/column names) is read; no row-level data access

## New Feature Integration Checklist

Every new feature that adds Prisma models, Lakebase tables, API routes, or UI
pages **must** complete all items below before the work is considered done.

| # | Integration Point | What to Do |
|---|---|---|
| 1 | **Factory reset** (`lib/lakebase/reset.ts`) | Add `prisma.<model>.deleteMany()` to `deleteAllData()`. Child tables with `onDelete: Cascade` are handled automatically. |
| 2 | **Activity logging** (`lib/lakebase/activity-log.ts`) | Add new `ActivityAction` members for user actions (create, apply, delete, etc.) and call `logActivity()` from API routes. |
| 3 | **Navigation** (`components/pipeline/sidebar-nav.tsx`) | Add the page to the appropriate nav section. |
| 4 | **Documentation** (`AGENTS.md`) | Document key modules, data model, and API routes in this file. |
| 5 | **Prisma schema** (`prisma/schema.prisma`) | Define models with indexes, relations, `@@map`. Run `npx prisma generate` after changes. |
| 6 | **SQL injection protection** | Identifiers → `validateFqn()` / `validateIdentifier()`. String literals → `escapeComment()`. Destructive patterns → blocklist. Never interpolate user input into raw SQL. |
| 7 | **Reuse existing components** | Catalog selection → `CatalogBrowser`. Industry list → `GET /api/industries`. Never use `value=""` on Radix `<SelectItem>`. |

Optional (case-by-case):

| # | Integration Point | When Needed |
|---|---|---|
| 8 | **Stats** (`app/api/stats/route.ts`) | If the feature should show counts on the main dashboard. |
| 9 | **Embeddings** (`lib/embeddings/store.ts`) | If the data should be searchable via Ask Forge RAG. |

## Testing Expectations

- Unit tests for prompt template building (snapshot tests)
- Unit tests for use case scoring logic
- Unit tests for SQL query mappers (row-to-type)
- Unit tests for input validation (identifiers, UUIDs, Zod schemas)
- Integration test stubs for each pipeline step
- CI: lint + typecheck + tests (GitHub Actions at `.github/workflows/ci.yml`)
- Test runner: Vitest (`npm test` / `npm run test:watch`)
- Type checking: `npm run typecheck`

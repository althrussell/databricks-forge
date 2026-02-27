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
| Embeddings     | Databricks Model Serving (databricks-gte-large-en, 1024-dim) |
| Vector Search  | pgvector extension in Lakebase (HNSW index)          |
| Persistence    | Lakebase (Unity Catalog managed tables)              |
| Deployment     | Databricks Apps (auto-auth via env vars)             |
| Export         | exceljs, pdfkit, pptxgenjs, Workspace REST API       |

## Deployment Model

This app runs as a **Databricks App**. Authentication is automatic:

- `DATABRICKS_HOST` and token are injected by the platform.
- `DATABRICKS_APP_PORT` controls the listen port (fallback: 3000).
- SQL Warehouse is bound as an app resource (no hardcoded warehouse IDs).
- Embedding endpoint (`serving-endpoint-embedding`) defaults to `databricks-gte-large-en`.
- Local dev uses `DATABRICKS_TOKEN` (PAT) in `.env.local`.

## Folder Contract

```
/app          Routes + UI (pages, layouts, API routes)
/components   Shared UI components (shadcn primitives, pipeline-specific)
/lib          Data, auth, config, scoring, AI, pipeline logic
  /dbx        Databricks SQL client, Model Serving client, Workspace API
  /queries    SQL text + row-to-type mappers
  /domain     TypeScript types + scoring logic
  /ai         Prompt template building + Model Serving execution
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

## Pipeline Steps (Discover Usecases)

The core pipeline runs these steps sequentially:

1. **business-context** -- Generate business context via Model Serving (goals, priorities, value chain) **[fast]**
2. **metadata-extraction** -- Query `information_schema` for catalogs, schemas, tables, columns
3. **table-filtering** -- Classify tables as business vs technical via Model Serving (JSON mode) **[fast]**
4. **usecase-generation** -- Generate use cases in parallel batches via Model Serving (JSON mode) **[premium]**
5. **domain-clustering** -- Assign domains and subdomains via Model Serving (JSON mode) **[fast]**
6. **scoring** -- Score **[premium]**, deduplicate **[fast]**, calibrate **[premium]**, and rank use cases
7. **sql-generation** -- Generate bespoke SQL for each use case via Model Serving (streaming) **[premium]**

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
- `lib/ai/sql-rules.ts` -- shared Databricks SQL quality rules (`DATABRICKS_SQL_RULES`, `DATABRICKS_SQL_RULES_COMPACT`)
- `lib/dbx/genie.ts` -- Databricks Genie REST API client (create/update/trash spaces, payload sanitization)
- `lib/lakebase/genie-recommendations.ts` -- persistence for generated recommendations
- `lib/lakebase/genie-engine-config.ts` -- versioned engine config per run
- `lib/lakebase/genie-spaces.ts` -- deployed space tracking

Data model: `GenieEngineConfig`, `GenieEnginePassOutputs`, `SerializedSpace`,
`GenieSpaceRecommendation`, `GenieEngineRecommendation` (see `lib/genie/types.ts`).

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
| Embeddings         | `lib/embeddings/client.ts` -- `databricks-gte-large-en` (1024-dim) via `getEmbeddingEndpoint()`; batched (16/req) with 429/5xx retry |
| Vector search      | `lib/embeddings/store.ts` -- pgvector in Lakebase; `forge_embeddings` table with HNSW index; 12 entity kinds covering all estate + pipeline data |
| LLM cache + retry  | `lib/genie/llm-cache.ts` -- in-memory SHA-256-keyed cache (10min TTL) with 429/5xx retry |
| Concurrency        | `lib/genie/concurrency.ts` -- bounded-concurrency utility for parallel domains and batches |

## Key Constraints

- **No raw SQL in components** -- all SQL lives in `/lib/queries/` (rule 01)
- **No hardcoded credentials** -- use Databricks Apps env vars (rule 00)
- **Loading/empty/error states** on every page and async component (rule 00)
- **Primary CTA per page** must be visually dominant (rule 02, rule 06)
- **Prompt templates** must include business context, metadata scope, and output format spec
- **SQL quality rules** -- all SQL-generating prompts must import rules from `lib/ai/sql-rules.ts` (never inline ad-hoc rules)
- **Privacy** -- only metadata (schemas, table/column names) is read; no row-level data access

## Testing Expectations

- Unit tests for prompt template building (snapshot tests)
- Unit tests for use case scoring logic
- Unit tests for SQL query mappers (row-to-type)
- Unit tests for input validation (identifiers, UUIDs, Zod schemas)
- Integration test stubs for each pipeline step
- CI: lint + typecheck + tests (GitHub Actions at `.github/workflows/ci.yml`)
- Test runner: Vitest (`npm test` / `npm run test:watch`)
- Type checking: `npm run typecheck`

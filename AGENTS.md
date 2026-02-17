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
| Persistence    | Lakebase (Unity Catalog managed tables)              |
| Deployment     | Databricks Apps (auto-auth via env vars)             |
| Export         | exceljs, pdfkit, pptxgenjs, Workspace REST API       |

## Deployment Model

This app runs as a **Databricks App**. Authentication is automatic:

- `DATABRICKS_HOST` and token are injected by the platform.
- `DATABRICKS_APP_PORT` controls the listen port (fallback: 3000).
- SQL Warehouse is bound as an app resource (no hardcoded warehouse IDs).
- Local dev uses `DATABRICKS_TOKEN` (PAT) in `.env.local`.

## Reference Notebook

`docs/references/databricks_inspire_v34.ipynb` contains the original Databricks
notebook with all prompt templates, pipeline logic, and data structures. It is
the authoritative source when porting logic to TypeScript.

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

## Pipeline Steps (Discover Usecases)

The core pipeline runs these steps sequentially:

1. **business-context** -- Generate business context via Model Serving (goals, priorities, value chain)
2. **metadata-extraction** -- Query `information_schema` for catalogs, schemas, tables, columns
3. **table-filtering** -- Classify tables as business vs technical via Model Serving (JSON mode)
4. **usecase-generation** -- Generate use cases in parallel batches via Model Serving (JSON mode)
5. **domain-clustering** -- Assign domains and subdomains via Model Serving (JSON mode)
6. **scoring** -- Score, deduplicate (per-domain + cross-domain), calibrate, and rank use cases via Model Serving (JSON mode)
7. **sql-generation** -- Generate bespoke SQL for each use case via Model Serving (streaming)

Each step updates progress in Lakebase. The frontend polls for status.

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

## Key Constraints

- **No raw SQL in components** -- all SQL lives in `/lib/queries/` (rule 01)
- **No hardcoded credentials** -- use Databricks Apps env vars (rule 00)
- **Loading/empty/error states** on every page and async component (rule 00)
- **Primary CTA per page** must be visually dominant (rule 02, rule 06)
- **Prompt templates** must include business context, metadata scope, and output format spec
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

# Architecture

## Overview

Databricks Forge AI follows a **ports-and-adapters** architecture. The web app
is a Next.js 15 App Router application deployed as a Databricks App. All
Databricks interactions go through a thin adapter layer (`lib/dbx/`), keeping
business logic independent of transport details.

```
┌─────────────────────────────────────────────────────────┐
│  Next.js App (Databricks App)                           │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ app/     │  │ components/  │  │ lib/             │  │
│  │ (routes) │──│ (UI)         │──│ (business logic) │  │
│  └──────────┘  └──────────────┘  └────────┬─────────┘  │
│                                           │             │
│  ┌────────────────────────────────────────┘             │
│  │                                                      │
│  │  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐  │
│  │  │ lib/dbx │ │ lib/ai   │ │lib/    │ │lib/      │  │
│  │  │ (SQL)   │ │ (prompts)│ │pipeline│ │export    │  │
│  │  └────┬────┘ └────┬─────┘ └───┬────┘ └────┬─────┘  │
│  │       │           │           │            │         │
└──┼───────┼───────────┼───────────┼────────────┼─────────┘
   │       │           │           │            │
   ▼       ▼           ▼           ▼            ▼
┌──────┐ ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────────┐
│SQL   │ │Model │ │Unity     │ │Lakebase│ │Workspace │
│W/H   │ │Serve │ │Catalog   │ │Tables  │ │API       │
└──────┘ └──────┘ └──────────┘ └────────┘ └──────────┘
```

## Layer Responsibilities

### `/lib/dbx/` -- Databricks Adapter

- `client.ts` -- initialises the Databricks SDK from env vars, auth token management
- `sql.ts` -- executes SQL via Statement Execution API, polls for results,
  maps rows to typed objects
- `model-serving.ts` -- Model Serving REST client (chat completions, streaming)
- `workspace.ts` -- creates/imports notebooks via Workspace REST API

### `/lib/queries/` -- SQL Text + Mappers

All SQL statements live here as tagged template literals. Each query module
exports:

1. The SQL string (parameterised)
2. A mapper function that converts raw rows to domain types

No raw SQL appears anywhere else in the codebase.

### `/lib/domain/` -- Types + Scoring

- `types.ts` -- all shared TypeScript interfaces (`PipelineRun`, `UseCase`, etc.)
- `scoring.ts` -- use case scoring and ranking logic

### `/lib/ai/` -- Prompt Building + Execution

- `templates.ts` -- all prompt templates (ported from the notebook)
- `functions.ts` -- AI_FUNCTIONS and STATISTICAL_FUNCTIONS registries
- `agent.ts` -- wrapper that invokes Model Serving via `lib/dbx/model-serving.ts`
  (chat completions API), parses LLM responses (JSON), handles retries and
  token usage tracking. Supports JSON mode and streaming.

### `/lib/pipeline/` -- Pipeline Engine

- `engine.ts` -- step orchestrator (runs steps in order, updates Lakebase progress)
- `steps/*.ts` -- individual pipeline step modules

### `/lib/lakebase/` -- Persistence

- `schema.ts` -- DDL for Lakebase tables + migration helper
- `runs.ts` -- CRUD for `forge_runs`
- `usecases.ts` -- CRUD for `forge_use_cases`

### `/lib/export/` -- Output Generation

- `excel.ts` -- styled Excel workbook via exceljs
- `pdf.ts` -- PDF catalog via @react-pdf/renderer
- `pptx.ts` -- PowerPoint deck via pptxgenjs
- `notebooks.ts` -- SQL notebook generation + Workspace API deployment

## Lakebase Schema

Four tables in a dedicated schema (e.g. `forge_app`):

### `forge_runs`

| Column             | Type      | Notes                          |
| ------------------ | --------- | ------------------------------ |
| run_id             | STRING    | PK, UUID                      |
| business_name      | STRING    |                                |
| uc_metadata        | STRING    | Catalogs/schemas/tables input  |
| operation          | STRING    |                                |
| business_priorities| STRING    | JSON array                     |
| strategic_goals    | STRING    |                                |
| business_domains   | STRING    |                                |
| ai_model           | STRING    |                                |
| languages          | STRING    | JSON array                     |
| status             | STRING    | pending/running/completed/failed |
| current_step       | STRING    | Active pipeline step           |
| progress_pct       | INT       |                                |
| business_context   | STRING    | JSON blob from LLM             |
| error_message      | STRING    |                                |
| created_at         | TIMESTAMP |                                |
| completed_at       | TIMESTAMP |                                |

### `forge_use_cases`

| Column             | Type   | Notes                     |
| ------------------ | ------ | ------------------------- |
| id                 | STRING | PK                        |
| run_id             | STRING | FK to forge_runs        |
| use_case_no        | INT    |                           |
| name               | STRING |                           |
| type               | STRING | AI / Statistical          |
| analytics_technique| STRING |                           |
| statement          | STRING |                           |
| solution           | STRING |                           |
| business_value     | STRING |                           |
| beneficiary        | STRING |                           |
| sponsor            | STRING |                           |
| domain             | STRING |                           |
| subdomain          | STRING |                           |
| tables_involved    | STRING | JSON array of FQNs        |
| priority_score     | DOUBLE |                           |
| feasibility_score  | DOUBLE |                           |
| impact_score       | DOUBLE |                           |
| overall_score      | DOUBLE |                           |
| sql_code           | STRING |                           |
| sql_status         | STRING |                           |

### `forge_metadata_cache`

| Column        | Type      | Notes                        |
| ------------- | --------- | ---------------------------- |
| cache_key     | STRING    | PK                           |
| uc_path       | STRING    |                              |
| metadata_json | STRING    | Serialised schema markdown   |
| table_count   | INT       |                              |
| column_count  | INT       |                              |
| cached_at     | TIMESTAMP |                              |

### `forge_exports`

| Column     | Type      | Notes                       |
| ---------- | --------- | --------------------------- |
| export_id  | STRING    | PK                          |
| run_id     | STRING    | FK to forge_runs          |
| format     | STRING    | excel/pdf/pptx/notebooks    |
| file_path  | STRING    | Volumes or workspace path   |
| created_at | TIMESTAMP |                             |

## Data Flow

1. User submits configuration via `/configure` page
2. API route creates a `PipelineRun` record in Lakebase (status=pending)
3. Execute endpoint starts the pipeline engine asynchronously
4. Engine runs 6 steps, each updating progress in Lakebase
5. Frontend polls `/api/runs/[runId]` every 3 seconds for status
6. On completion, use cases are persisted in `forge_use_cases`
7. User views results and triggers exports from the run detail page

## Auth Model

| Environment    | Auth Method                                         |
| -------------- | --------------------------------------------------- |
| Databricks App | Auto-injected `DATABRICKS_CLIENT_ID/SECRET` (OAuth) |
| Local Dev      | `DATABRICKS_TOKEN` (PAT) in `.env.local`            |

The app never exposes credentials to the frontend. All Databricks calls happen
server-side in API routes.

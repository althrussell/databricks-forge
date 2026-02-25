# Databricks Forge AI

> **IMPORTANT: This is NOT a Databricks product.** This project was built by the Databricks Field Engineering team as an internal accelerator. It is provided as-is under the Apache 2.0 license with no warranty, no official support, and no liability. **Status: Alpha** -- see [NOTICE](NOTICE) for full disclaimer.

**Transform your Unity Catalog metadata into actionable, AI-generated use cases.**

Databricks Forge AI is a web application deployed as a [Databricks App](https://docs.databricks.com/en/dev-tools/databricks-apps/index.html). Point it at your catalogs and schemas, and it uses LLM-powered analysis (via Databricks Model Serving) to discover, score, and export data-driven use cases -- without ever reading your actual data.

<p align="center">
  <img src="public/forge_home.png" alt="Databricks Forge AI — Home" width="100%" />
</p>

---

## Deployment (Databricks Apps)

The recommended way to deploy is **directly from Git** using the Databricks Apps UI, or via the CLI using the included deploy script. No manual infrastructure setup needed -- Lakebase is auto-provisioned on first boot.

> For background on the "Install from Git" feature, see [Deploy Databricks Apps directly from Git](https://community.databricks.com/t5/technical-blog/deploy-databricks-apps-directly-from-git/ba-p/147766).

### Prerequisites

- [ ] **A Databricks workspace** with Unity Catalog enabled
- [ ] **A SQL Warehouse** (Serverless or Pro) running in that workspace
- [ ] **[Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html)** installed and authenticated
- [ ] **Workspace previews enabled**: **Databricks Apps - On-Behalf-Of User Authorization** must be turned on in your workspace Admin Settings under Previews (optional but recommended)

> **Lakebase is auto-provisioned.** The app creates its own Lakebase Autoscale project on first boot -- no manual database setup, no secret scopes, no resource bindings for the database.

<p align="center">
  <img src="docs/images/previews.png" alt="Required preview features in workspace settings" width="700" />
</p>

### Step 1: Deploy

```bash
git clone <repo-url> databricks-forge
cd databricks-forge
./deploy.sh
```

The deploy script discovers your SQL Warehouses, lets you pick one, creates
the app, uploads the code, and deploys. Models default to
`databricks-claude-sonnet-4-6`. The whole process takes 3-5 minutes.

### Step 2: Deploy completes

The script configures everything automatically -- resource bindings (SQL
warehouse, serving endpoints) and user authorization scopes (`sql`,
`catalog.tables:read`, `catalog.schemas:read`, `catalog.catalogs:read`,
`files.files`). No manual UI steps needed.

The platform will:

1. **Install dependencies** -- runs `npm install`
2. **Build** -- runs `npm run build` (generates Prisma client, builds the Next.js standalone server, copies static assets)
3. **Inject** environment variables from resource bindings
4. **Start** the app using `scripts/start.sh` (from `app.yaml`), which:
   - **Auto-provisions Lakebase** on first deploy (skipped on subsequent deploys)
   - Runs `prisma db push` (creates all tables on first deploy, applies additive changes on subsequent deploys)
   - Starts the Next.js standalone server on port 8000

> First deploy takes 3-5 minutes. Subsequent deploys are faster.

### Step 3: Verify

Open the app URL in your browser. You should see the Forge AI dashboard.

You can also check the health endpoint:

```bash
APP_URL=$(databricks apps get databricks-forge --output json | jq -r '.url')
curl -s "$APP_URL/api/health" | jq .
```

A healthy response:

```json
{
  "status": "healthy",
  "warehouse": "connected",
  "database": "connected"
}
```

---

### Updating the app

Pull the latest changes and re-run `./deploy.sh`. The script detects the existing app and updates it. Schema changes in `prisma/schema.prisma` are applied automatically on the next startup.

### Environment variables at runtime

| Variable | Source | How it's set |
| --- | --- | --- |
| `DATABRICKS_HOST` | Workspace URL | Auto-injected by platform |
| `DATABRICKS_CLIENT_ID` | Service principal OAuth client ID | Auto-injected by platform |
| `DATABRICKS_CLIENT_SECRET` | Service principal OAuth client secret | Auto-injected by platform |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouse ID | Set by `deploy.sh` in `app.yaml` |
| `DATABRICKS_SERVING_ENDPOINT` | Premium Model Serving endpoint name | Set by `deploy.sh` (default: `databricks-claude-sonnet-4-6`) |
| `DATABRICKS_SERVING_ENDPOINT_FAST` | Fast Model Serving endpoint name | Set by `deploy.sh` (default: `databricks-claude-sonnet-4-6`) |
| `DATABASE_URL` | Lakebase connection string | Auto-generated at startup by `scripts/provision-lakebase.mjs` |

> `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`, and `DATABRICKS_CLIENT_SECRET` are injected automatically. `DATABASE_URL` is generated dynamically. You never set these manually.

### Auth model

The app uses **two complementary auth models** ([docs](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/auth)):

**User authorization (OBO)** -- the logged-in user's identity and UC permissions:

| API | Scope | What runs as the user |
| --- | --- | --- |
| SQL Statement Execution | `sql` | All metadata queries, generated SQL, health check |
| Workspace REST API | -- | Notebook export runs as the app service principal (see below) |
| Unity Catalog metadata | `catalog.catalogs:read`, `catalog.schemas:read`, `catalog.tables:read` | `SHOW CATALOGS/SCHEMAS/TABLES`, `information_schema` |

**App authorization (service principal)** -- the app's own identity for background operations:

| Resource | Permission | What runs as the SP |
| --- | --- | --- |
| SQL Warehouse | **Can use** | Background pipeline tasks |
| Model Serving endpoint (premium) | **Can query** | Use case generation, scoring, SQL generation |
| Model Serving endpoint (fast) | **Can query** | Business context, table filtering, domain clustering, deduplication |
| Workspace REST API | **Can manage** | Notebook export (mkdirs + import to `/Shared/forge_gen/`) |
| Unity Catalog | **USE CATALOG / USE SCHEMA / SELECT** | Background metadata queries |
| `system.access.table_lineage` | **SELECT** | Lineage graph walking |
| Genie Spaces | **Can manage** | Create, update, and trash Genie Spaces |

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| "DATABASE_URL is not set and Lakebase auto-provisioning is not available" | Running locally without `.env` | Set `DATABASE_URL` in `.env` for local dev |
| "Lakebase provisioning returned empty URL" | SP lacks permission to create Lakebase projects | Ensure the app's service principal can manage Lakebase resources |
| "Create project failed (403)" | Lakebase Autoscale not available in region | Check [supported regions](https://docs.databricks.com/aws/en/oltp/projects/authentication); fall back to manual `DATABASE_URL` |
| Schema push fails at startup | Lakebase compute still waking from scale-to-zero | Restart the app -- compute wakes automatically and retries succeed |
| "Failed to connect to warehouse" | Warehouse binding missing or stopped | Verify `sql-warehouse` resource is configured and warehouse is running |
| "Model serving request failed" | Serving endpoint binding missing | Verify `serving-endpoint` resource is configured. If fast tasks fail, check `serving-endpoint-fast` or remove it to fall back to premium |
| "USE CATALOG denied" on discovery | User lacks UC grants | The logged-in user needs `USE CATALOG` / `USE SCHEMA` / `SELECT` on the catalogs they want to discover |
| Lineage discovery returns 0 tables | Missing lineage permissions | Grant `SELECT` on `system.access.table_lineage` to the user |

View logs:

```bash
databricks apps logs databricks-forge --follow
```

### Deployment checklist

```
[ ] 1. Databricks CLI installed and authenticated
[ ] 2. ./deploy.sh completed (creates app, binds resources, sets scopes, deploys)
[ ] 3. Health check passes: <app-url>/api/health
```

> Lakebase is auto-provisioned on first deploy -- no manual database setup needed.
> Resources (warehouse, endpoints) and user scopes are configured automatically by deploy.sh.

---

## What It Does

1. **Configure** -- enter your business name, select Unity Catalog scope, and set priorities.
2. **Discover** -- a 7-step AI pipeline extracts metadata, generates use cases, clusters them into business domains, scores them, and generates runnable SQL. See [FORGE_ANALYSIS.md](FORGE_ANALYSIS.md) for the full breakdown.
3. **Export** -- download results as Excel, PowerPoint, or PDF, or deploy SQL notebooks directly to your workspace.

### Key Features

- Discovers both **AI** use cases (ai_forecast, ai_classify, ai_query, etc.) and **Statistical** use cases (anomaly detection, trend analysis, geospatial, etc.)
- Scores every use case on **priority**, **feasibility**, **impact**, and **overall value**
- Automatically clusters use cases into **business domains and subdomains**
- Deduplicates and ranks results so the highest-value opportunities surface first
- Supports **20+ languages** for generated documentation
- **Real-time status messages** during pipeline execution (e.g. "Filtering tables (batch 2 of 5)...")
- **Privacy-first**: reads only metadata by default (table/column names and schemas). Optional [data sampling](FORGE_ANALYSIS.md#data-sampling) can be enabled for improved SQL accuracy

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, shadcn/ui, Tailwind CSS 4 |
| Language | TypeScript (strict) |
| SQL Execution | Databricks SQL Statement Execution API via SQL Warehouse |
| LLM | Databricks Model Serving REST API (OpenAI-compatible chat completions) |
| Persistence | [Lakebase Autoscaling](https://docs.databricks.com/aws/en/oltp/projects/authentication) (Postgres-compatible) via Prisma ORM |
| Deployment | Databricks Apps (automatic OAuth, resource bindings) |
| Export | exceljs, pptxgenjs, Workspace REST API |

---

## Pipeline Steps

The "Discover Usecases" pipeline runs 7 steps sequentially. The frontend polls for progress in real time.

| Step | Name | What it does | Progress |
| --- | --- | --- | --- |
| 1 | **Business Context** | Generates strategic goals, value chain, and revenue model via Model Serving | 10% |
| 2 | **Metadata Extraction** | Queries `information_schema` for tables, columns, and foreign keys | 20% |
| 3 | **Table Filtering** | Classifies tables as business-relevant vs technical via Model Serving (JSON mode) | 30% |
| 4 | **Use Case Generation** | Generates AI and statistical use cases in parallel batches via Model Serving (JSON mode) | 45% |
| 5 | **Domain Clustering** | Assigns domains and subdomains via Model Serving, merges small domains | 55% |
| 6 | **Scoring & Dedup** | Scores on priority/feasibility/impact, removes duplicates via Model Serving | 65% |
| 7 | **SQL Generation** | Generates runnable Databricks SQL per use case via Model Serving (streaming) | 95% |

Each step updates its status and a human-readable **status message** in Lakebase (e.g. "Scanning catalog main...", "Scoring domain: Customer Analytics (14 use cases)..."). The frontend polls every 3 seconds and displays the latest message alongside the progress stepper.

> For the full analysis methodology, scoring formulas, prompt engineering details, and data flow diagrams, see [FORGE_ANALYSIS.md](FORGE_ANALYSIS.md).

---

## Lakebase (Zero-Touch Auto-Provisioning)

The app persists all state (pipeline runs, use cases, exports) in [Lakebase Autoscaling](https://docs.databricks.com/aws/en/oltp/projects/authentication) -- a Postgres-compatible OLTP database managed by Databricks. The schema is managed by [Prisma ORM](https://www.prisma.io/).

### How it works

**No manual database setup is required.** When deployed as a Databricks App, the app automatically:

1. **Creates a Lakebase Autoscale project** (`databricks-forge`) on first boot using the platform-injected service principal credentials
2. **Generates short-lived OAuth DB credentials** for Postgres connections (rotated automatically every ~50 minutes)
3. **Pushes the Prisma schema** (`prisma db push`) to create all tables on first deploy, and applies additive changes on subsequent deploys

There are no Databricks secrets, no password management, and no manual resource bindings for the database. The service principal that Databricks Apps injects (`DATABRICKS_CLIENT_ID` / `DATABRICKS_CLIENT_SECRET` / `DATABRICKS_HOST`) is all the app needs.

### First deploy vs subsequent deploys

| Scenario | What happens | Extra time |
| --- | --- | --- |
| **First deploy** | Creates Lakebase project, waits for it to be ready, creates all tables | ~30-60s |
| **Subsequent deploys** | Detects existing project, skips creation, syncs schema (no-op if unchanged) | ~1-2s |
| **After idle (scale-to-zero)** | Compute wakes automatically on first connection | ~200ms |

### Redeployments are safe

`prisma db push` is idempotent: if the tables already exist and match the schema, it does nothing. If new tables or columns were added to the Prisma schema, it creates them. It never drops existing tables or columns.

---

## Export Formats

| Format | Library | What you get |
| --- | --- | --- |
| **Excel** | exceljs | 3-sheet workbook: Summary, Use Cases (filterable), Domains |
| **PowerPoint** | pptxgenjs | Title slide, executive summary, domain breakdown, top 10 use cases |
| **PDF** | pdfkit | Databricks-branded A4 landscape report with cover page, executive summary, domain breakdown, and individual use case pages |
| **Notebooks** | Workspace REST API | One SQL notebook per domain, deployed to `/Shared/forge_gen/` via the app service principal |

---

## Configuration Options

These map to the form fields on the `/configure` page:

| Field | Required | Default | Description |
| --- | --- | --- | --- |
| **Business Name** | Yes | -- | Organisation or project name |
| **UC Metadata** | Yes | -- | Unity Catalog scope: `catalog`, `catalog.schema`, or comma-separated list |
| **Business Priorities** | No | Increase Revenue | Multi-select from 10 predefined priorities |
| **Strategic Goals** | No | Auto-generated | Custom goals for scoring alignment |
| **Business Domains** | No | Auto-detected | Focus domains (e.g. "Risk, Finance, Marketing") |
| **AI Model** | No | databricks-claude-opus-4-6 | Model Serving endpoint for LLM calls (chat completions) |
| **Languages** | No | English | Target languages for generated documentation |

---

## Development

```bash
npm run dev        # Start development server (Turbopack)
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run typecheck  # TypeScript strict type checking
npm test           # Run tests (Vitest)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full system design, layer responsibilities, and data flow. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for local development setup instructions.

---

## Privacy

By default, Forge reads **metadata only** -- schema names, table names, column names, data types, and comments. All LLM prompts contain only structural metadata.

When **Data Sampling** is enabled in Settings, the app reads a configurable number of rows (5-50) per table during SQL generation. Sampled data is sent to the AI model to improve SQL accuracy but is **not persisted** -- it exists only in memory during the generation step. See [FORGE_ANALYSIS.md - Privacy Model](FORGE_ANALYSIS.md#privacy-model) for the full breakdown.

---

## Further Documentation

| Document | Description |
| --- | --- |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md) | **User guide** -- step-by-step walkthrough of every feature with screenshots |
| [FORGE_ANALYSIS.md](FORGE_ANALYSIS.md) | **Comprehensive analysis guide** -- pipeline logic, scoring methodology, prompt engineering, data flow diagrams |
| [ESTATE_ANALYSIS.md](ESTATE_ANALYSIS.md) | **Estate scan guide** -- environment intelligence pipeline, health scoring, lineage |
| [SECURITY_ARCHITECTURE.md](SECURITY_ARCHITECTURE.md) | **Security architecture** -- data flows, threat mitigations, auth model, compliance posture |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and Lakebase schema |
| [docs/PIPELINE.md](docs/PIPELINE.md) | Pipeline step reference |
| [docs/PROMPTS.md](docs/PROMPTS.md) | Prompt template catalog |
| [docs/GENIE_ENGINE.md](docs/GENIE_ENGINE.md) | Genie Engine architecture, configuration, and best practices |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment and local dev guide |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contribution guidelines and development setup |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting process |
| [CHANGELOG.md](CHANGELOG.md) | Release history |

---

## Disclaimer

**This project is NOT an official Databricks product, feature, or service.** It was developed by the Databricks Field Engineering team as an internal accelerator and is shared as-is for informational and experimental purposes.

- **Status**: Alpha -- incomplete, likely contains bugs, may change or be discontinued without notice
- **No warranty**: Provided "AS IS" without warranties of any kind
- **No support**: No official support, SLAs, or maintenance commitments from Databricks
- **No liability**: Databricks and its contributors accept no liability for any damages or consequences arising from use
- **Not reviewed**: This software has NOT been reviewed or approved by Databricks product, security, or legal teams for production use

**Use at your own risk.** You are solely responsible for evaluating fitness for your use case, testing, and ensuring compliance with your organisation's policies. See [NOTICE](NOTICE) for full details.

---

## License

Licensed under the [Apache License 2.0](LICENSE).

```
Copyright 2024-2026 Databricks, Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

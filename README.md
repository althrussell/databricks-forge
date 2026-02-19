# Databricks Forge AI

> **IMPORTANT: This is NOT a Databricks product.** This project was built by the Databricks Field Engineering team as an internal accelerator. It is provided as-is under the Apache 2.0 license with no warranty, no official support, and no liability. **Status: Alpha** -- see [NOTICE](NOTICE) for full disclaimer.

**Transform your Unity Catalog metadata into actionable, AI-generated use cases.**

Databricks Forge AI is a web application deployed as a [Databricks App](https://docs.databricks.com/en/dev-tools/databricks-apps/index.html). Point it at your catalogs and schemas, and it uses LLM-powered analysis (via Databricks Model Serving) to discover, score, and export data-driven use cases -- without ever reading your actual data.

<p align="center">
  <img src="public/1.png" alt="Forge AI — Main Dashboard" width="100%" />
  <br />
  <em>Main Dashboard — query performance overview with AI insights, impact scoring, and cost analysis</em>
</p>

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

<p align="center">
  <img src="public/3.png" alt="Query Detail — expanded view with AI insights and performance flags" width="100%" />
  <br />
  <em>Query Detail — AI-powered insights, performance flags, I/O stats, and time breakdown at a glance</em>
</p>

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

## Project Structure

```
databricks-forge/
  AGENTS.md                     # AI agent guidance
  app.yaml                      # Databricks App runtime config
  databricks.yml                # Databricks App manifest (bundles)
  Dockerfile                    # Multi-stage Docker build
  prisma/
    schema.prisma               # Prisma schema (Lakebase tables)
  app/                          # Next.js routes + UI
    layout.tsx                  # Root layout with sidebar
    page.tsx                    # Dashboard
    configure/page.tsx          # Pipeline configuration form
    runs/page.tsx               # Runs list
    runs/[runId]/page.tsx       # Run detail + results
    api/
      runs/route.ts             # POST create / GET list
      runs/[runId]/route.ts     # GET run details
      runs/[runId]/execute/     # POST start pipeline
      metadata/route.ts         # GET Unity Catalog browser
      export/[runId]/route.ts   # GET export
      migrate/route.ts          # POST run Prisma migrations
  components/
    ui/                         # shadcn primitives
    pipeline/                   # Config form, progress, table, export
  lib/
    prisma.ts                   # Prisma client singleton (OAuth token rotation)
    generated/prisma/           # Generated Prisma client (gitignored)
    dbx/                        # Databricks SQL client + Workspace API
    queries/                    # SQL text + row mappers
    domain/                     # TypeScript types + scoring
    ai/                         # Prompt templates + Model Serving client
    pipeline/                   # Engine + 6 step modules
    lakebase/                   # Prisma-based CRUD for runs + use cases
    export/                     # Excel, PPTX, PDF, notebook generators
  docs/
    ARCHITECTURE.md             # Ports-and-adapters design
    PIPELINE.md                 # Step-by-step pipeline reference
    PROMPTS.md                  # Full prompt template catalog
    DEPLOYMENT.md               # Deployment and local dev guide
    references/                 # Original Databricks notebook
```

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

<p align="center">
  <img src="public/4.png" alt="AI Analysis — root cause analysis with rewrite suggestions" width="100%" />
  <br />
  <em>AI Analysis — deep-dive with root causes, rewrite suggestions, risk assessment, and validation plan</em>
</p>

> For the full analysis methodology, scoring formulas, prompt engineering details, and data flow diagrams, see [FORGE_ANALYSIS.md](FORGE_ANALYSIS.md).

<p align="center">
  <img src="public/2.png" alt="Warehouse Monitor — real-time metrics and query timeline" width="100%" />
  <br />
  <em>Warehouse Monitor — live warehouse metrics, query timeline, duration distribution, and top users</em>
</p>

<p align="center">
  <img src="public/5.png" alt="Warehouse Health Report — sizing recommendations and cost analysis" width="100%" />
  <br />
  <em>Warehouse Health Report — 7-day analysis with sizing recommendations, hourly activity, and cost of inaction</em>
</p>

---

## Lakebase Autoscaling Setup

The app persists all state (pipeline runs, use cases, exports) in [Lakebase Autoscaling](https://docs.databricks.com/aws/en/oltp/projects/authentication) -- a Postgres-compatible OLTP database managed by Databricks. The schema is managed by [Prisma ORM](https://www.prisma.io/).

### 1. Create a Lakebase project

In your Databricks workspace, navigate to **SQL > Lakebase** and create a new project (or use an existing one). Note the **pooler** and **direct** endpoint hostnames from the **Connect** dialog.

### 2. Create a Postgres role for the app

Connect to your Lakebase database as the project owner (via the Lakebase UI SQL editor, `psql`, or any Postgres client) and create a dedicated role:

```sql
-- Create the application role with a native Postgres password
CREATE ROLE databricks_forge WITH LOGIN PASSWORD 'your-secure-password';

-- Allow connecting to the database
GRANT CONNECT ON DATABASE databricks_postgres TO databricks_forge;

-- Allow using the public schema
GRANT USAGE ON SCHEMA public TO databricks_forge;

-- Table-level permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO databricks_forge;

-- Future tables in the schema (so Prisma can create tables)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO databricks_forge;

-- Allow Prisma to run DDL (CREATE TABLE, ALTER TABLE, etc.)
GRANT CREATE ON SCHEMA public TO databricks_forge;
```

Tables are created automatically by the app at startup. Since the app connects as `databricks_forge`, it already owns the tables it creates -- no manual ownership transfer is needed.

> **Note:** Using a native Postgres password (rather than OAuth tokens) is recommended for application roles. Native passwords don't expire hourly and are simpler to manage. See [Lakebase authentication docs](https://docs.databricks.com/aws/en/oltp/projects/authentication) for details.

### 3. Build the connection string

Your `DATABASE_URL` follows the standard Postgres format:

```
postgresql://<role>:<password>@<host>/<database>?sslmode=verify-full
```

Use the **direct** endpoint (not pooler) so that automatic schema migrations work at startup:

| Endpoint | Hostname pattern | Used for |
| --- | --- | --- |
| **Direct** | `ep-xxx.database.<region>.cloud.databricks.com` | Application queries + auto-migration at startup |
| **Pooler** | `ep-xxx-pooler.database.<region>.cloud.databricks.com` | Not used (pooler cannot run DDL for migrations) |

Example:

```
postgresql://databricks_forge:your-password@ep-xxx.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=verify-full
```

### 4. Store the connection string as a Databricks secret

The `DATABASE_URL` contains credentials and must not be committed to the repo. Store it in a [Databricks secret scope](https://docs.databricks.com/en/security/secrets/index.html):

```bash
# Create a secret scope for the app
databricks secrets create-scope forge-secrets

# Store the direct connection string (direct endpoint required for auto-migration)
databricks secrets put-secret forge-secrets DATABASE_URL \
  --string-value "postgresql://databricks_forge:your-password@ep-xxx.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=verify-full"
```

### 5. Add the secret as an App resource

In the **Databricks App UI**:

1. Open your app's **Configure** page
2. Under **App resources**, click **+ Add resource**
3. Select **Secret**
4. Set scope to `forge-secrets`, key to `DATABASE_URL`
5. Set the **Resource key** to `db-secret`
6. Permission: **Can read**

The `app.yaml` maps this resource to the `DATABASE_URL` environment variable:

```yaml
env:
  - name: DATABASE_URL
    valueFrom: db-secret
```

At runtime, Databricks injects the actual connection string -- it never appears in your code.

### 6. Schema migration (automatic)

The database schema is pushed **automatically** every time the server starts. The startup script (`scripts/start.sh`) runs `prisma db push` before launching Next.js, creating tables on first deploy and applying additive changes on subsequent deploys.

> **Important:** `DATABASE_URL` must point to the **direct** Lakebase endpoint (without `-pooler`). The pooler endpoint does not support DDL operations. Since the app now runs migrations at startup, the direct endpoint is required for both schema sync and normal queries.

If you ever need to push the schema manually (e.g. during local development):

```bash
DATABASE_URL="postgresql://databricks_forge:your-password@ep-xxx.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=verify-full" \
  npx prisma db push
```

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js 18+**
- A **Databricks workspace** with:
  - A running **SQL Warehouse** (Serverless or Pro)
  - Access to **Unity Catalog** metadata you want to analyse
  - A **Model Serving endpoint** (e.g. `databricks-claude-sonnet-4-5`) with pay-per-token enabled
- A **Databricks Personal Access Token (PAT)**
- A **Lakebase Autoscaling** project (see [Lakebase setup](#lakebase-autoscaling-setup) above)

### 1. Clone and install

```bash
git clone <repo-url> databricks-forge
cd databricks-forge
npm install
```

### 2. Configure environment

Create a `.env` file:

```env
# Lakebase connection (direct endpoint — required for auto-migration at startup)
DATABASE_URL="postgresql://databricks_forge:<password>@ep-xxx.database.<region>.cloud.databricks.com/databricks_postgres?sslmode=verify-full"

# Databricks workspace (for SQL Warehouse + Model Serving)
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_personal_access_token
DATABRICKS_WAREHOUSE_ID=abc123def456
DATABRICKS_SERVING_ENDPOINT=databricks-claude-sonnet-4-5
```

| Variable | Where to find it |
| --- | --- |
| `DATABASE_URL` | Built from your Lakebase project (see [step 3](#3-build-the-connection-string) above) |
| `DATABRICKS_HOST` | Your workspace URL |
| `DATABRICKS_TOKEN` | User Settings > Developer > Access Tokens > Generate New Token |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouses > click your warehouse > Connection Details |
| `DATABRICKS_SERVING_ENDPOINT` | The Model Serving endpoint name (e.g. `databricks-claude-sonnet-4-5`) |

### 3. Generate Prisma client

```bash
npx prisma generate
```

> Schema is pushed automatically when the server starts (`npm run dev` or `npm start`). No manual `prisma db push` needed.

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Start New Discovery**.

---

## Deployment (Databricks Apps)

Databricks Apps runs your web application inside the workspace with **automatic OAuth authentication** and resource bindings. No PAT tokens or manual credential management required.

This section is a **complete, copy-paste guide** from zero to a running app. Follow every step in order.

---

### Prerequisites

Before you start, ensure you have:

- [ ] **Databricks CLI v0.200+** installed and authenticated against your target workspace
- [ ] **A Databricks workspace** with Unity Catalog enabled
- [ ] **A SQL Warehouse** (Serverless or Pro) running in that workspace
- [ ] **A Model Serving endpoint** (e.g. `databricks-claude-sonnet-4-5`) with pay-per-token enabled
- [ ] **A Lakebase Autoscaling project** created (see [Lakebase setup](#lakebase-autoscaling-setup) above)

Verify your CLI is authenticated:

```bash
databricks auth describe
# Should show your workspace URL and authentication method
```

---

### Step 1: Create the Databricks App

```bash
databricks apps create databricks-forge \
  --description "Discover AI-powered use cases from Unity Catalog metadata"
```

> If the app already exists, skip this step.

---

### Step 2: Create the secret scope and store DATABASE_URL

The `DATABASE_URL` contains your Lakebase connection string with credentials. It must be stored securely in a Databricks secret scope -- **never committed to code**.

```bash
# Create a secret scope (one-time setup)
databricks secrets create-scope forge-secrets
```

```bash
# Store the connection string
# IMPORTANT: Use the DIRECT endpoint (without -pooler) -- required for auto-migration
databricks secrets put-secret forge-secrets DATABASE_URL \
  --string-value "postgresql://databricks_forge:<YOUR_PASSWORD>@<YOUR_ENDPOINT>.database.<REGION>.cloud.databricks.com/databricks_postgres?sslmode=verify-full"
```

**Example** (replace placeholders):

```bash
databricks secrets put-secret forge-secrets DATABASE_URL \
  --string-value "postgresql://databricks_forge:MySecurePass123@ep-abc123.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=verify-full"
```

Verify the secret was stored:

```bash
databricks secrets list-secrets forge-secrets
# Should show: DATABASE_URL
```

> **Where do I get this URL?** See [Lakebase Setup - Step 3](#3-build-the-connection-string) above. You must use the **direct** endpoint hostname (e.g. `ep-xxx.database.us-west-2.cloud.databricks.com`) so that automatic schema migrations can run DDL statements at startup.

---

### Step 3: Configure app resources

The app requires three Databricks resource bindings. These are configured in the **Databricks App UI** or via the CLI.

#### Option A: Configure via the App UI

Navigate to **Workspace > Apps > databricks-forge > Configure** and add:

| # | Resource type | Resource key | Configuration |
| --- | --- | --- | --- |
| 1 | **SQL Warehouse** | `sql-warehouse` | Select your warehouse. Permission: **Can use** |
| 2 | **Serving Endpoint** | `serving-endpoint` | Select your Model Serving endpoint. Permission: **Can query** |
| 3 | **Secret** | `db-secret` | Scope: `forge-secrets`, Key: `DATABASE_URL`. Permission: **Can read** |

#### Option B: Configure via CLI

If you prefer to script everything:

```bash
# Bind the SQL Warehouse
databricks apps update-resources databricks-forge \
  --resource-name sql-warehouse \
  --resource-type sql_warehouse \
  --resource-id <YOUR_WAREHOUSE_ID>

# Bind the Model Serving endpoint
databricks apps update-resources databricks-forge \
  --resource-name serving-endpoint \
  --resource-type serving_endpoint \
  --resource-id <YOUR_SERVING_ENDPOINT_NAME>

# Bind the DATABASE_URL secret
databricks apps update-resources databricks-forge \
  --resource-name db-secret \
  --resource-type secret \
  --resource-secret-scope forge-secrets \
  --resource-secret-key DATABASE_URL
```

---

### Step 4: Deploy the app

```bash
databricks apps deploy databricks-forge --source-code-path .
```

The platform will:

1. **Build** the container from the `Dockerfile` (runs `prisma generate` at build time)
2. **Inject** environment variables from resource bindings (see table below)
3. **Start** the app using `scripts/start.sh`, which:
   - Runs `prisma db push` automatically (creates all tables on first deploy, applies additive schema changes on subsequent deploys)
   - Starts the Next.js production server on port 8000

> First deploy takes 3-5 minutes. Subsequent deploys are faster.

Monitor the deployment:

```bash
# Check deployment status
databricks apps get databricks-forge

# Stream logs
databricks apps logs databricks-forge --follow
```

---

### Step 5: Verify the deployment

```bash
# Get the app URL
databricks apps get databricks-forge --output json | jq -r '.url'
```

Open the URL in your browser. You should see the Forge AI dashboard.

You can also hit the health endpoint:

```bash
APP_URL=$(databricks apps get databricks-forge --output json | jq -r '.url')
curl -s "$APP_URL/api/health" | jq .
```

A healthy response shows connectivity to both the SQL Warehouse and Lakebase:

```json
{
  "status": "healthy",
  "warehouse": "connected",
  "database": "connected"
}
```

---

### How it all fits together

The app uses two config files that map resources to environment variables:

**`databricks.yml`** (bundle manifest -- declares the app and its resource types):

```yaml
apps:
  databricks-forge:
    resources:
      - name: sql-warehouse        # → DATABRICKS_WAREHOUSE_ID
        type: sql_warehouse
      - name: serving-endpoint     # → DATABRICKS_SERVING_ENDPOINT
        type: serving_endpoint
```

**`app.yaml`** (runtime config -- startup command + additional env vars):

```yaml
command:
  - "sh"
  - "scripts/start.sh"           # runs prisma db push, then starts Next.js

env:
  - name: DATABRICKS_WAREHOUSE_ID
    valueFrom: sql-warehouse
  - name: DATABASE_URL
    valueFrom: db-secret          # from the secret resource binding
```

### Environment variables at runtime

| Variable | Source | How it's set |
| --- | --- | --- |
| `DATABRICKS_HOST` | Workspace URL | Auto-injected by Databricks Apps platform |
| `DATABRICKS_CLIENT_ID` | Service principal OAuth client ID | Auto-injected by Databricks Apps platform |
| `DATABRICKS_CLIENT_SECRET` | Service principal OAuth client secret | Auto-injected by Databricks Apps platform |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouse ID | From `sql-warehouse` resource binding |
| `DATABRICKS_SERVING_ENDPOINT` | Model Serving endpoint name | From `serving-endpoint` resource binding |
| `DATABASE_URL` | Lakebase connection string | From `db-secret` secret resource binding |

> `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`, and `DATABRICKS_CLIENT_SECRET` are injected automatically by the Databricks Apps runtime. You never need to set these manually.

---

### Permissions summary

The app's service principal needs these permissions in the workspace:

| Resource | Permission | Why |
| --- | --- | --- |
| SQL Warehouse | **Can use** | Execute metadata queries and generated SQL |
| Model Serving endpoint | **Can query** | Send LLM inference requests (chat completions) |
| Unity Catalog (catalogs/schemas) | **USE CATALOG / USE SCHEMA** | Read `information_schema` for metadata discovery |
| `system.access.table_lineage` | **SELECT** | Walk data lineage graphs during discovery |
| Secret scope `forge-secrets` | **Can read** | Read the `DATABASE_URL` at runtime |
| Workspace folders | **Can manage** | Create folders and deploy SQL notebooks on export |

Grant Unity Catalog permissions to the app's service principal:

```sql
-- Replace <service_principal_name> with your app's service principal
-- Replace <catalog> with each catalog the app should discover

GRANT USE CATALOG ON CATALOG <catalog> TO `<service_principal_name>`;
GRANT USE SCHEMA ON CATALOG <catalog> TO `<service_principal_name>`;
GRANT SELECT ON CATALOG <catalog> TO `<service_principal_name>`;

-- Lineage access (required for lineage-based discovery)
GRANT USE SCHEMA ON SCHEMA system.access TO `<service_principal_name>`;
GRANT SELECT ON TABLE system.access.table_lineage TO `<service_principal_name>`;
```

> **Tip:** To find the service principal name, check the app's settings in the Databricks App UI, or run: `databricks apps get databricks-forge --output json | jq '.service_principal'`

---

### Updating the app

After making code changes, redeploy:

```bash
databricks apps deploy databricks-forge --source-code-path .
```

Schema changes in `prisma/schema.prisma` are applied automatically on the next startup -- no manual migration step required.

---

### Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| App starts but shows "DATABASE_URL is not set" | Secret binding missing | Verify `db-secret` resource is configured (Step 3) |
| Schema push fails at startup | DATABASE_URL uses pooler endpoint | Update the secret to use the **direct** endpoint (without `-pooler`) |
| "permission denied for schema public" | Lakebase role lacks DDL grants | Run `GRANT CREATE ON SCHEMA public TO databricks_forge;` |
| "Failed to connect to warehouse" | Warehouse binding missing or stopped | Verify `sql-warehouse` resource is configured and warehouse is running |
| "Model serving request failed" | Serving endpoint binding missing | Verify `serving-endpoint` resource is configured (Step 3) |
| "USE CATALOG denied" on discovery | Service principal lacks UC grants | Grant `USE CATALOG`, `USE SCHEMA`, `SELECT` (see Permissions above) |
| Lineage discovery returns 0 tables | Missing lineage permissions | Grant `SELECT` on `system.access.table_lineage` |

View logs for detailed error messages:

```bash
databricks apps logs databricks-forge --follow
```

---

### Complete deployment checklist

```
[ ] 1. Databricks CLI installed and authenticated
[ ] 2. Lakebase project created with databricks_forge role
[ ] 3. Secret scope created: databricks secrets create-scope forge-secrets
[ ] 4. DATABASE_URL stored: databricks secrets put-secret forge-secrets DATABASE_URL ...
[ ] 5. App created: databricks apps create databricks-forge
[ ] 6. SQL Warehouse resource bound (key: sql-warehouse, permission: Can use)
[ ] 7. Serving Endpoint resource bound (key: serving-endpoint, permission: Can query)
[ ] 8. Secret resource bound (key: db-secret, scope: forge-secrets, permission: Can read)
[ ] 9. UC grants applied to the app's service principal
[ ] 10. Deployed: databricks apps deploy databricks-forge --source-code-path .
[ ] 11. Health check passes: curl <app-url>/api/health
```

---

## Docker (Local / Manual)

If you want to build and run the container locally (outside Databricks Apps):

```bash
# Build
docker build -t databricks-forge .

# Run (provide all env vars manually)
docker run -p 8000:8000 \
  -e DATABASE_URL="postgresql://databricks_forge:<password>@ep-xxx.database.<region>.cloud.databricks.com/databricks_postgres?sslmode=verify-full" \
  -e DATABRICKS_HOST=https://your-workspace.cloud.databricks.com \
  -e DATABRICKS_TOKEN=dapi_your_pat_token \
  -e DATABRICKS_WAREHOUSE_ID=abc123def456 \
  -e DATABRICKS_SERVING_ENDPOINT=databricks-claude-sonnet-4-5 \
  databricks-forge
```

The container runs `scripts/start.sh`, which auto-migrates the database and starts the server on port 8000.

---

## API Reference

All API routes are server-side only. The frontend calls them via `fetch()`.

| Method | Route | Description |
| --- | --- | --- |
| `POST` | `/api/runs` | Create a new pipeline run |
| `GET` | `/api/runs` | List all runs (supports `?limit=` and `?offset=`) |
| `GET` | `/api/runs/[runId]` | Get run status, config, and use cases (if completed) |
| `POST` | `/api/runs/[runId]/execute` | Start pipeline execution asynchronously |
| `GET` | `/api/metadata?type=catalogs` | List Unity Catalog catalogs |
| `GET` | `/api/metadata?type=schemas&catalog=X` | List schemas in a catalog |
| `GET` | `/api/metadata?type=tables&catalog=X&schema=Y` | List tables |
| `GET` | `/api/export/[runId]?format=excel` | Download Excel workbook |
| `GET` | `/api/export/[runId]?format=pptx` | Download PowerPoint deck |
| `GET` | `/api/export/[runId]?format=pdf` | Download PDF catalog (JSON for now) |
| `GET` | `/api/export/[runId]?format=notebooks` | Deploy SQL notebooks to workspace |
| `POST` | `/api/migrate` | Trigger Prisma schema sync |

---

## Export Formats

| Format | Library | What you get |
| --- | --- | --- |
| **Excel** | exceljs | 3-sheet workbook: Summary, Use Cases (filterable), Domains |
| **PowerPoint** | pptxgenjs | Title slide, executive summary, domain breakdown, top 10 use cases |
| **PDF** | pdfkit | Databricks-branded A4 landscape report with cover page, executive summary, domain breakdown, and individual use case pages |
| **Notebooks** | Workspace REST API | One SQL notebook per use case, organised by domain, deployed to your workspace |

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

## Lakebase Schema (Prisma)

All app state is stored in four tables in the Lakebase `public` schema, managed by Prisma.

| Table | Purpose |
| --- | --- |
| `forge_runs` | Pipeline execution records (config, status, progress, status message, business context) |
| `forge_use_cases` | Generated use cases (name, scores, domain, SQL, tables involved) |
| `forge_metadata_cache` | Cached UC metadata snapshots |
| `forge_exports` | Export history |

Schema is defined in `prisma/schema.prisma`. To update:

```bash
# Edit prisma/schema.prisma, then:
npx prisma generate  # regenerate the TypeScript client
# Schema is pushed automatically on next server start
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for full column definitions.

---

## Development

### Available scripts

```bash
npm run dev      # Start development server (Turbopack)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
```

### Prisma commands

```bash
npx prisma generate    # Regenerate client after schema changes
npx prisma db push     # Push schema manually (auto-runs at startup)
npx prisma studio      # Open Prisma Studio (visual DB browser)
```

### Architecture

The app follows a **ports-and-adapters** pattern. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design, including:

- Layer responsibilities (`lib/dbx`, `lib/queries`, `lib/domain`, `lib/ai`, `lib/pipeline`, `lib/lakebase`, `lib/export`)
- Lakebase table schemas with column definitions
- Data flow from configuration to export
- Auth model for Databricks Apps vs local dev

### Pipeline reference

See [docs/PIPELINE.md](docs/PIPELINE.md) for detailed documentation of each pipeline step, including inputs, prompts used, expected outputs, and error handling strategies.

### Prompt templates

See [docs/PROMPTS.md](docs/PROMPTS.md) for a catalog of all 17+ prompt templates, their variables, output formats, and which pipeline step uses them.

### Adding shadcn components

```bash
npx shadcn@latest add <component-name>
```

---

## Privacy

By default, Forge reads **metadata only** -- schema names, table names, column names, data types, and comments. All LLM prompts contain only structural metadata.

When **Data Sampling** is enabled in Settings, the app reads a configurable number of rows (5-50) per table during SQL generation. Sampled data is sent to the AI model to improve SQL accuracy but is **not persisted** -- it exists only in memory during the generation step. See [FORGE_ANALYSIS.md - Privacy Model](FORGE_ANALYSIS.md#privacy-model) for the full breakdown.

---

## Further Documentation

| Document | Description |
| --- | --- |
| [FORGE_ANALYSIS.md](FORGE_ANALYSIS.md) | **Comprehensive analysis guide** -- pipeline logic, scoring methodology, prompt engineering, data flow diagrams |
| [AGENTS.md](AGENTS.md) | AI agent guidance (folder contract, domain types, constraints) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and Lakebase schema |
| [docs/PIPELINE.md](docs/PIPELINE.md) | Pipeline step reference |
| [docs/PROMPTS.md](docs/PROMPTS.md) | Prompt template catalog |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment and local dev guide |

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

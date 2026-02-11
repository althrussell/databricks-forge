# Databricks Inspire AI

**Transform your Unity Catalog metadata into actionable, AI-generated use cases.**

Databricks Inspire AI is a web application deployed as a [Databricks App](https://docs.databricks.com/en/dev-tools/databricks-apps/index.html). Point it at your catalogs and schemas, and it uses LLM-powered analysis (via `ai_query()`) to discover, score, and export data-driven use cases -- without ever reading your actual data.

---

## What It Does

1. **Configure** -- enter your business name, select Unity Catalog scope, and set priorities.
2. **Discover** -- a 6-step AI pipeline extracts metadata, generates use cases, clusters them into business domains, and scores them on ROI, feasibility, and strategic alignment.
3. **Export** -- download results as Excel, PowerPoint, or PDF, or deploy SQL notebooks directly to your workspace.

### Key Features

- Discovers both **AI** use cases (ai_forecast, ai_classify, ai_query, etc.) and **Statistical** use cases (anomaly detection, trend analysis, geospatial, etc.)
- Scores every use case on **priority**, **feasibility**, **impact**, and **overall value**
- Automatically clusters use cases into **business domains and subdomains**
- Deduplicates and ranks results so the highest-value opportunities surface first
- Supports **20+ languages** for generated documentation
- **Privacy-first**: reads only metadata (table/column names and schemas) -- never your actual row data

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 (App Router), React 19, shadcn/ui, Tailwind CSS 4 |
| Language | TypeScript (strict) |
| SQL Execution | Databricks SQL Statement Execution API via SQL Warehouse |
| LLM | `ai_query()` SQL function on Databricks Model Serving |
| Persistence | [Lakebase Autoscaling](https://docs.databricks.com/aws/en/oltp/projects/authentication) (Postgres-compatible) via Prisma ORM |
| Deployment | Databricks Apps (automatic OAuth, resource bindings) |
| Export | exceljs, pptxgenjs, Workspace REST API |

---

## Project Structure

```
databricks-inspire/
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
    ai/                         # Prompt templates + ai_query wrapper
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

The "Discover Usecases" pipeline runs 6 steps sequentially. The frontend polls for progress in real time.

| Step | Name | What it does | Progress |
| --- | --- | --- | --- |
| 1 | **Business Context** | Generates strategic goals, value chain, and revenue model via `ai_query` | 15% |
| 2 | **Metadata Extraction** | Queries `information_schema` for tables, columns, and foreign keys | 30% |
| 3 | **Table Filtering** | Classifies tables as business-relevant vs technical via `ai_query` | 45% |
| 4 | **Use Case Generation** | Generates AI and statistical use cases in parallel batches via `ai_query` | 65% |
| 5 | **Domain Clustering** | Assigns domains and subdomains via `ai_query`, merges small domains | 80% |
| 6 | **Scoring & Dedup** | Scores on priority/feasibility/impact, removes duplicates via `ai_query` | 100% |

Each step updates its status in Lakebase, so the UI can show a live progress stepper even though the pipeline runs asynchronously on the server.

---

## Lakebase Autoscaling Setup

The app persists all state (pipeline runs, use cases, exports) in [Lakebase Autoscaling](https://docs.databricks.com/aws/en/oltp/projects/authentication) -- a Postgres-compatible OLTP database managed by Databricks. The schema is managed by [Prisma ORM](https://www.prisma.io/).

### 1. Create a Lakebase project

In your Databricks workspace, navigate to **SQL > Lakebase** and create a new project (or use an existing one). Note the **pooler** and **direct** endpoint hostnames from the **Connect** dialog.

### 2. Create a Postgres role for the app

Connect to your Lakebase database as the project owner (via the Lakebase UI SQL editor, `psql`, or any Postgres client) and create a dedicated role:

```sql
-- Create the application role with a native Postgres password
CREATE ROLE databricks_inspire WITH LOGIN PASSWORD 'your-secure-password';

-- Allow connecting to the database
GRANT CONNECT ON DATABASE databricks_postgres TO databricks_inspire;

-- Allow using the public schema
GRANT USAGE ON SCHEMA public TO databricks_inspire;

-- Table-level permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO databricks_inspire;

-- Future tables in the schema (so Prisma can create tables)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO databricks_inspire;
```

> **Note:** Using a native Postgres password (rather than OAuth tokens) is recommended for application roles. Native passwords don't expire hourly and are simpler to manage. See [Lakebase authentication docs](https://docs.databricks.com/aws/en/oltp/projects/authentication) for details.

### 3. Build the connection string

Your `DATABASE_URL` follows the standard Postgres format:

```
postgresql://<role>:<password>@<host>/<database>?sslmode=require
```

You'll have **two** endpoints:

| Endpoint | Hostname pattern | Used for |
| --- | --- | --- |
| **Pooler** | `ep-xxx-pooler.database.<region>.cloud.databricks.com` | Application queries (connection pooling) |
| **Direct** | `ep-xxx.database.<region>.cloud.databricks.com` | Schema migrations (`prisma db push`) |

Example:

```
# Pooler (for the app)
postgresql://databricks_inspire:your-password@ep-xxx-pooler.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=require

# Direct (for migrations)
postgresql://databricks_inspire:your-password@ep-xxx.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=require
```

### 4. Store the connection string as a Databricks secret

The `DATABASE_URL` contains credentials and must not be committed to the repo. Store it in a [Databricks secret scope](https://docs.databricks.com/en/security/secrets/index.html):

```bash
# Create a secret scope for the app
databricks secrets create-scope inspire-secrets

# Store the pooler connection string
databricks secrets put-secret inspire-secrets DATABASE_URL \
  --string-value "postgresql://databricks_inspire:your-password@ep-xxx-pooler.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=require"
```

### 5. Add the secret as an App resource

In the **Databricks App UI**:

1. Open your app's **Configure** page
2. Under **App resources**, click **+ Add resource**
3. Select **Secret**
4. Set scope to `inspire-secrets`, key to `DATABASE_URL`
5. Set the **Resource key** to `db-secret`
6. Permission: **Can read**

The `app.yaml` maps this resource to the `DATABASE_URL` environment variable:

```yaml
env:
  - name: DATABASE_URL
    valueFrom: db-secret
```

At runtime, Databricks injects the actual connection string -- it never appears in your code.

### 6. Push the schema

Using the **direct** endpoint (not the pooler), create the tables:

```bash
# Set the direct URL for migrations
DATABASE_URL="postgresql://databricks_inspire:your-password@ep-xxx.database.us-west-2.cloud.databricks.com/databricks_postgres?sslmode=require" \
  npx prisma db push
```

This creates four tables: `inspire_runs`, `inspire_use_cases`, `inspire_metadata_cache`, and `inspire_exports`.

> **Important:** Always use the **direct** endpoint (without `-pooler`) for `prisma db push`. The pooler endpoint does not support DDL operations.

---

## Quick Start (Local Development)

### Prerequisites

- **Node.js 18+**
- A **Databricks workspace** with:
  - A running **SQL Warehouse** (Serverless or Pro)
  - Access to **Unity Catalog** metadata you want to analyse
  - A **Model Serving endpoint** that supports `ai_query()` (e.g. `databricks-claude-sonnet-4-5`)
- A **Databricks Personal Access Token (PAT)**
- A **Lakebase Autoscaling** project (see [Lakebase setup](#lakebase-autoscaling-setup) above)

### 1. Clone and install

```bash
git clone <repo-url> databricks-inspire
cd databricks-inspire
npm install
```

### 2. Configure environment

Create a `.env` file:

```env
# Lakebase connection (pooler endpoint)
DATABASE_URL="postgresql://databricks_inspire:<password>@ep-xxx-pooler.database.<region>.cloud.databricks.com/databricks_postgres?sslmode=require"

# Databricks workspace (for SQL Warehouse + ai_query)
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_personal_access_token
DATABRICKS_WAREHOUSE_ID=abc123def456
```

| Variable | Where to find it |
| --- | --- |
| `DATABASE_URL` | Built from your Lakebase project (see [step 3](#3-build-the-connection-string) above) |
| `DATABRICKS_HOST` | Your workspace URL |
| `DATABRICKS_TOKEN` | User Settings > Developer > Access Tokens > Generate New Token |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouses > click your warehouse > Connection Details |

### 3. Generate Prisma client and push schema

```bash
# Generate the Prisma client
npx prisma generate

# Push schema to Lakebase (use the DIRECT endpoint, not pooler)
DATABASE_URL="postgresql://databricks_inspire:<password>@ep-xxx.database.<region>.cloud.databricks.com/databricks_postgres?sslmode=require" \
  npx prisma db push
```

### 4. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and click **Start New Discovery**.

---

## Deployment (Databricks Apps)

Databricks Apps runs your web application inside the workspace with automatic OAuth authentication and resource bindings. No PAT tokens or manual credential management required.

### Prerequisites

- [Databricks CLI](https://docs.databricks.com/en/dev-tools/cli/install.html) v0.200+ installed and authenticated
- A SQL Warehouse available in the target workspace
- Lakebase project set up with a Postgres role (see [Lakebase setup](#lakebase-autoscaling-setup))
- `DATABASE_URL` stored in a Databricks secret scope (see [step 4](#4-store-the-connection-string-as-a-databricks-secret))

### 1. Configure app resources

In the Databricks App UI, add two resources:

| Resource type | Resource key | Configuration |
| --- | --- | --- |
| **SQL Warehouse** | `sql-warehouse` | Select your warehouse, permission: Can use |
| **Secret** | `db-secret` | Scope: `inspire-secrets`, Key: `DATABASE_URL`, permission: Can read |

### 2. Deploy

```bash
# Deploy from git repo or local source
databricks apps deploy --app-name databricks-inspire
```

The platform will:
1. Build the container from the `Dockerfile`
2. Run `prisma db push --skip-generate` on startup (syncs schema automatically)
3. Bind the SQL Warehouse and inject credentials
4. Inject `DATABASE_URL` from the secret
5. Start the Next.js server

### 3. Access the app

After deployment, find the app URL in:
- Databricks Workspace > Apps
- Or via CLI: `databricks apps get databricks-inspire`

### Auto-injected environment variables

These are provided automatically by the Databricks Apps runtime:

| Variable | Source |
| --- | --- |
| `DATABRICKS_HOST` | Workspace URL (no `https://` prefix) |
| `DATABRICKS_CLIENT_ID` | Service principal OAuth client ID |
| `DATABRICKS_CLIENT_SECRET` | Service principal OAuth client secret |
| `DATABRICKS_WAREHOUSE_ID` | From `sql-warehouse` resource binding via `app.yaml` |
| `DATABASE_URL` | From `db-secret` resource binding via `app.yaml` |

---

## Docker (Manual)

If you want to build and run the container locally:

```bash
# Build
docker build -t databricks-inspire .

# Run (provide env vars)
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e DATABRICKS_HOST=https://your-workspace.cloud.databricks.com \
  -e DATABRICKS_TOKEN=dapi_xxx \
  -e DATABRICKS_WAREHOUSE_ID=abc123 \
  databricks-inspire
```

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
| **PDF** | (planned) | Structured JSON catalog; full PDF rendering via `@react-pdf/renderer` coming soon |
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
| **AI Model** | No | databricks-claude-sonnet-4-5 | Model Serving endpoint for `ai_query()` calls |
| **Languages** | No | English | Target languages for generated documentation |

---

## Lakebase Schema (Prisma)

All app state is stored in four tables in the Lakebase `public` schema, managed by Prisma.

| Table | Purpose |
| --- | --- |
| `inspire_runs` | Pipeline execution records (config, status, progress, business context) |
| `inspire_use_cases` | Generated use cases (name, scores, domain, SQL, tables involved) |
| `inspire_metadata_cache` | Cached UC metadata snapshots |
| `inspire_exports` | Export history |

Schema is defined in `prisma/schema.prisma`. To update:

```bash
# Edit prisma/schema.prisma, then:
npx prisma db push   # sync to Lakebase (use direct endpoint)
npx prisma generate  # regenerate the TypeScript client
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
npx prisma db push     # Push schema to database (use direct endpoint)
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

Inspire reads **metadata only** -- schema names, table names, column names, data types, and comments. It does **not** access, query, or sample your actual data rows. All LLM prompts contain only structural metadata.

---

## Further Documentation

| Document | Description |
| --- | --- |
| [AGENTS.md](AGENTS.md) | AI agent guidance (folder contract, domain types, constraints) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System architecture and Lakebase schema |
| [docs/PIPELINE.md](docs/PIPELINE.md) | Pipeline step reference |
| [docs/PROMPTS.md](docs/PROMPTS.md) | Prompt template catalog |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deployment and local dev guide |

---

## License

Private. Internal use only.

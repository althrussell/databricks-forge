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
| Persistence | Lakebase (Unity Catalog managed tables) |
| Deployment | Databricks Apps (automatic OAuth, resource bindings) |
| Export | exceljs, pptxgenjs, Workspace REST API |

---

## Project Structure

```
databricks-inspire/
  AGENTS.md                     # AI agent guidance
  databricks.yml                # Databricks App manifest
  Dockerfile                    # Multi-stage Docker build
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
      migrate/route.ts          # POST create Lakebase tables
  components/
    ui/                         # shadcn primitives
    pipeline/                   # Config form, progress, table, export
  lib/
    dbx/                        # Databricks SQL client + Workspace API
    queries/                    # SQL text + row mappers
    domain/                     # TypeScript types + scoring
    ai/                         # Prompt templates + ai_query wrapper
    pipeline/                   # Engine + 6 step modules
    lakebase/                   # Table DDL + CRUD
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

## Quick Start (Local Development)

### Prerequisites

- **Node.js 18+**
- A **Databricks workspace** with:
  - A running **SQL Warehouse** (Serverless or Pro)
  - Access to **Unity Catalog** metadata you want to analyse
  - A **Model Serving endpoint** that supports `ai_query()` (e.g. `databricks-claude-sonnet-4-5`)
- A **Databricks Personal Access Token (PAT)**

### 1. Clone and install

```bash
git clone <repo-url> databricks-inspire
cd databricks-inspire
npm install
```

### 2. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_personal_access_token
DATABRICKS_WAREHOUSE_ID=abc123def456
DATABRICKS_APP_PORT=3000
```

| Variable | Where to find it |
| --- | --- |
| `DATABRICKS_HOST` | Your workspace URL (e.g. `https://adb-1234567890.1.azuredatabricks.net`) |
| `DATABRICKS_TOKEN` | User Settings > Developer > Access Tokens > Generate New Token |
| `DATABRICKS_WAREHOUSE_ID` | SQL Warehouses page > click your warehouse > copy the ID from the URL or Connection Details |

### 3. Create Lakebase tables

The app stores pipeline runs and results in Unity Catalog managed tables. Run the migration on first setup:

```bash
# Start the dev server
npm run dev

# In another terminal, trigger the migration:
curl -X POST http://localhost:3000/api/migrate
```

This creates the `inspire_app` schema with four tables: `inspire_runs`, `inspire_use_cases`, `inspire_metadata_cache`, and `inspire_exports`.

Alternatively, run the DDL from `lib/lakebase/schema.ts` manually in a Databricks SQL editor.

### 4. Open the app

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

### 1. Configure the app manifest

The `databricks.yml` in the project root defines the app:

```yaml
bundle:
  name: databricks-inspire

apps:
  databricks-inspire:
    name: "Databricks Inspire AI"
    description: "Discover AI-powered use cases from Unity Catalog metadata"
    source_code_path: .

    resources:
      - name: sql-warehouse
        type: sql_warehouse
        description: "SQL Warehouse for query execution, ai_query, and Lakebase"

    env:
      - name: DATABRICKS_WAREHOUSE_ID
        value_from:
          resource: sql-warehouse
          key: id
```

The platform automatically injects `DATABRICKS_HOST`, `DATABRICKS_CLIENT_ID`, `DATABRICKS_CLIENT_SECRET`, and `DATABRICKS_APP_PORT`.

### 2. Build and deploy

```bash
# Build the production bundle
npm run build

# Deploy to Databricks
databricks apps deploy --app-name databricks-inspire
```

The platform will:
1. Build the Docker container from the `Dockerfile`
2. Bind the SQL Warehouse resource
3. Inject authentication credentials
4. Start the app and assign a URL

### 3. Access the app

After deployment, find the app URL in:
- Databricks Workspace > Apps
- Or via CLI: `databricks apps get databricks-inspire`

### 4. Run migrations

On first deployment, create the Lakebase tables by calling the migration endpoint:

```bash
curl -X POST https://<your-app-url>/api/migrate
```

---

## Docker (Manual)

If you want to build and run the container locally:

```bash
# Build
docker build -t databricks-inspire .

# Run (provide env vars)
docker run -p 3000:3000 \
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
| `POST` | `/api/migrate` | Create Lakebase schema and tables |

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

## Lakebase Schema

All app state is stored in four Unity Catalog managed tables under the `inspire_app` schema.

| Table | Purpose |
| --- | --- |
| `inspire_runs` | Pipeline execution records (config, status, progress, business context) |
| `inspire_use_cases` | Generated use cases (name, scores, domain, SQL, tables involved) |
| `inspire_metadata_cache` | Cached UC metadata snapshots |
| `inspire_exports` | Export history |

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

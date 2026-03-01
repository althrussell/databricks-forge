# Deployment Guide

## Quick Deploy (Recommended)

The supported deployment path is the interactive deploy script. It discovers
your resources, creates the app, uploads code, and deploys -- all in one
command with a single prompt (which SQL Warehouse to use).

```bash
./deploy.sh
```

Models default to `databricks-claude-sonnet-4-6` for both premium and fast
endpoints. Override with flags if needed:

```bash
./deploy.sh --warehouse "My Warehouse" --endpoint "my-model" --fast-endpoint "my-fast-model"
```

Native password auth and rotation examples:

```bash
# Default deployment path (repo startup default is native_password)
./deploy.sh

# Rotate native DB password during deploy
./deploy.sh --rotate-lakebase-native-password

# Provide explicit native password (non-rotating)
./deploy.sh --lakebase-auth-mode native_password --lakebase-native-user forge_app_runtime --lakebase-native-password "<password>"

# Emergency rollback to OAuth runtime mode
./deploy.sh --lakebase-auth-mode oauth
```

To remove the app:

```bash
./deploy.sh --destroy
```

See [QUICKSTART.md](../QUICKSTART.md) for the full three-step setup.

---

## How It Works

Databricks Forge AI is deployed as a **Databricks App** -- a containerised web
application that runs inside a Databricks workspace with automatic
authentication.

### What `deploy.sh` does

1. Validates the Databricks CLI is installed and authenticated
2. Lists SQL Warehouses and lets you pick one
3. Creates the app (or detects an existing one)
4. Binds resources (SQL warehouse, serving endpoints) and sets user
   authorization scopes via the Apps API `create-update` endpoint
5. Syncs the project source code to a workspace folder
6. Deploys the app from that workspace folder

No manual UI configuration is needed. The script handles everything.

### Lakebase auth/secret controls

Use `deploy.sh` to keep auth and password lifecycle auditable:

- `--lakebase-auth-mode native_password|oauth` (optional override)
- `--lakebase-native-user <user>` (requires native mode)
- `--lakebase-native-password <password>` (requires native mode)
- `--rotate-lakebase-native-password` (native mode only; generates and applies a new password)
- `--print-generated-native-password` (only with rotate; use with caution)

Validation rules enforced by the script:

- Native user/password flags require `native_password` mode.
- Rotate cannot be combined with explicit `--lakebase-native-password`.
- Print-generated-password requires rotate.

### Resource bindings

The script binds three resources to the app via the API. The `app.yaml`
references these using `valueFrom:` keys, which the platform resolves to
environment variables at runtime.

| Resource key | Type | Default | Permission |
|---|---|---|---|
| `sql-warehouse` | SQL Warehouse | Customer-selected | CAN_USE |
| `serving-endpoint` | Serving Endpoint | `databricks-claude-sonnet-4-6` | CAN_QUERY |
| `serving-endpoint-fast` | Serving Endpoint | `databricks-claude-sonnet-4-6` | CAN_QUERY |

### User authorization scopes

The script configures these OAuth scopes so the app can act on behalf of the
logged-in user, enforcing their Unity Catalog permissions:

| Scope | Purpose |
|---|---|
| `sql` | Execute SQL via warehouse |
| `catalog.tables:read` | Read tables in Unity Catalog |
| `catalog.schemas:read` | Read schemas in Unity Catalog |
| `catalog.catalogs:read` | Read catalogs in Unity Catalog |
| `files.files` | Manage files and directories |
| `dashboards.genie` | Manage Genie Spaces (create, update, trash as user) |

### Platform-injected variables

These are set automatically by the Databricks Apps platform at runtime:

| Variable | Description |
|---|---|
| `DATABRICKS_HOST` | Workspace URL |
| `DATABRICKS_CLIENT_ID` | OAuth client ID (app service principal) |
| `DATABRICKS_CLIENT_SECRET` | OAuth client secret |
| `DATABRICKS_APP_PORT` | Port the app must listen on |

---

## Build and Start Sequence

Databricks Apps builds the application from `package.json`. No Dockerfile is
needed -- the platform handles containerisation.

1. `npm install` (runs `postinstall` which triggers `prisma generate`)
2. `npm run build` (runs `prisma generate && next build && sh scripts/postbuild.sh`)
3. `scripts/start.sh`:
   - Auto-provisions Lakebase Autoscale (if `DATABRICKS_CLIENT_ID` is set)
   - Uses the direct endpoint for startup DDL/schema sync
   - Bootstraps native runtime DB role/password/grants in `native_password` mode
   - Passes pooler runtime metadata (`LAKEBASE_ENDPOINT_NAME`, `LAKEBASE_POOLER_HOST`, `LAKEBASE_USERNAME`) plus auth mode/runtime credentials to the server
   - Starts the Next.js standalone server on `DATABRICKS_APP_PORT`

### Rotation runbook

1. Rotate:
   - `./deploy.sh --rotate-lakebase-native-password`
2. Verify runtime mode and health:
   - `curl -s "$APP_URL/api/health" | jq '.authRuntime'`
3. Confirm logs show:
   - `Client created (native password mode)`
   - pooler host + `forge_app_runtime`
4. Rollback (if needed):
   - `./deploy.sh --lakebase-auth-mode oauth`

---

## Local Development

### Prerequisites

- Node.js 20+
- A Databricks workspace with a SQL Warehouse
- A Databricks Personal Access Token (PAT)

### Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env.local`:
   ```env
   DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
   DATABRICKS_TOKEN=dapi_xxxxxxxxxxxxx
   DATABRICKS_WAREHOUSE_ID=your_warehouse_id
   DATABRICKS_APP_PORT=3000
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```
5. Open `http://localhost:3000`

### Lakebase Setup

On first run, the app creates its Lakebase tables automatically. If that
fails, visit `/api/migrate` to run the migration endpoint.

---

## CI/CD

Recommended pipeline:

1. **Lint** -- `npm run lint`
2. **Type check** -- `npm run typecheck`
3. **Test** -- `npm test`
4. **Build** -- `npm run build`
5. **Deploy** -- `./deploy.sh --warehouse "Production Warehouse"`

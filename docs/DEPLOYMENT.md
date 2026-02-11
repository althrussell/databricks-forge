# Deployment Guide

## Databricks App Deployment

This application is deployed as a **Databricks App**. Databricks Apps are
containerised web applications that run inside a Databricks workspace with
automatic authentication and resource bindings.

### App Manifest (`databricks.yml`)

The app manifest declares:

- **App name and description**
- **Resource bindings** -- SQL Warehouse for query execution
- **Environment variables** -- injected automatically by the platform
- **Port** -- `DATABRICKS_APP_PORT` (default 3000)

### Resource Bindings

| Resource | Type | Purpose |
|----------|------|---------|
| SQL Warehouse | `sql_warehouse` | Execute SQL queries, ai_query() calls, and Lakebase operations |

The SQL Warehouse ID is injected via environment variables. Never hardcode it.

### Environment Variables (Auto-injected)

| Variable | Description |
|----------|-------------|
| `DATABRICKS_HOST` | Workspace URL (e.g. `https://xxx.cloud.databricks.com`) |
| `DATABRICKS_CLIENT_ID` | OAuth client ID (app identity) |
| `DATABRICKS_CLIENT_SECRET` | OAuth client secret |
| `DATABRICKS_APP_PORT` | Port the app must listen on |

### Deployment Steps

1. Ensure `databricks.yml` is in the project root
2. Build the Next.js app: `npm run build`
3. Deploy via Databricks CLI:
   ```bash
   databricks apps deploy --app-name databricks-inspire
   ```
4. The platform builds the container and starts the app
5. Access via the workspace Apps page or the app URL

---

## Local Development

### Prerequisites

- Node.js 18+
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

On first run, the app needs to create its Lakebase tables. Either:

- Visit `/api/migrate` to run the migration endpoint, or
- Run the DDL statements from `lib/lakebase/schema.ts` manually in a SQL editor

---

## Docker Build (for Databricks Apps)

The Dockerfile uses a multi-stage build:

```dockerfile
# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Run
FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
```

The app reads `DATABRICKS_APP_PORT` at runtime and falls back to `PORT` or 3000.

---

## CI/CD

Recommended pipeline:

1. **Lint** -- `npm run lint`
2. **Type check** -- `npm run typecheck`
3. **Test** -- `npm test`
4. **Build** -- `npm run build`
5. **Deploy** -- `databricks apps deploy`

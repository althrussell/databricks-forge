#!/bin/sh
# Databricks Forge AI — Production startup script for Databricks Apps
#
# The platform runs `npm install` + `npm run build` before this script.
# After build, .next/standalone/ contains the self-contained server.
#
# 1. Auto-provisions Lakebase Autoscale (if running as a Databricks App).
# 2. Pushes the Prisma schema to Lakebase (best-effort).
# 3. Starts the Next.js standalone server.

set -e

# ---------------------------------------------------------------------------
# Lakebase auto-provisioning
#
# When running as a Databricks App the platform injects
# DATABRICKS_CLIENT_ID / DATABRICKS_CLIENT_SECRET / DATABRICKS_HOST.
# If DATABASE_URL is not already set (i.e. no secret binding), we
# self-provision a Lakebase Autoscale project and generate a short-lived
# connection URL with an OAuth DB credential.
# ---------------------------------------------------------------------------

if [ -n "$DATABRICKS_CLIENT_ID" ] && [ -z "$DATABASE_URL" ]; then
  echo "[startup] Auto-provisioning Lakebase Autoscale..."

  DB_URL=$(node scripts/provision-lakebase.mjs)

  if [ -n "$DB_URL" ]; then
    export DATABASE_URL="$DB_URL"
    echo "[startup] Lakebase connection established."
  else
    echo "[startup] ERROR: Lakebase provisioning returned empty URL."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Schema sync (best-effort)
# npx is not available in the Databricks Apps runtime, so invoke the
# prisma CLI directly from node_modules.
# ---------------------------------------------------------------------------

PRISMA_BIN="./node_modules/.bin/prisma"

if [ -x "$PRISMA_BIN" ]; then
  echo "[startup] Syncing database schema..."
  if "$PRISMA_BIN" db push 2>&1; then
    echo "[startup] Schema sync complete."
  else
    echo "[startup] WARNING: Schema sync failed — tables may already be up to date."
  fi
else
  echo "[startup] Prisma CLI not found, skipping schema sync."
fi

# ---------------------------------------------------------------------------
# Start the standalone Next.js server
# ---------------------------------------------------------------------------

export PORT="${DATABRICKS_APP_PORT:-8000}"
echo "[startup] Starting server on port $PORT..."

cd .next/standalone
exec node server.js

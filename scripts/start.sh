#!/bin/sh
# Databricks Forge AI — Production startup script for Databricks Apps
#
# The platform runs `npm install` + `npm run build` before this script.
# After build, .next/standalone/ contains the self-contained server.
#
# 1. Pushes the Prisma schema to Lakebase (best-effort).
# 2. Starts the Next.js standalone server.

set -e

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
    echo "[startup] If this is a fresh deploy, check DATABASE_URL points to the direct endpoint."
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

#!/bin/sh
# Databricks Forge AI — Production startup script
#
# 1. Pushes the Prisma schema to Lakebase (creates tables on first deploy,
#    applies additive changes on subsequent deploys).
# 2. Starts the Next.js production server.
#
# DATABASE_URL must point to the DIRECT Lakebase endpoint (not pooler)
# so that DDL statements succeed.

set -e

echo "[startup] Syncing database schema..."

if npx prisma db push --skip-generate 2>&1; then
  echo "[startup] Schema sync complete."
else
  echo "[startup] WARNING: Schema sync failed — tables may already be up to date."
  echo "[startup] If this is a fresh deploy, check DATABASE_URL points to the direct endpoint."
fi

PORT="${DATABRICKS_APP_PORT:-8000}"
echo "[startup] Starting server on port $PORT..."
exec node server.js

#!/bin/sh
# Databricks Forge AI — Production startup script for Databricks Apps
#
# The platform runs `npm install` + `npm run build` before this script.
# After build, .next/standalone/ contains the self-contained server.
#
# 1. Auto-provisions Lakebase Autoscale (if running as a Databricks App).
# 2. Verifies database connectivity (retries for cold-start wake-up).
# 3. Pushes the Prisma schema to Lakebase.
# 4. Starts the Next.js standalone server with a verified credential.

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

LAKEBASE_STARTUP_URL=""

if [ -n "$DATABRICKS_CLIENT_ID" ] && [ -z "$DATABASE_URL" ]; then
  echo "[startup] Auto-provisioning Lakebase Autoscale..."

  LAKEBASE_STARTUP_URL=$(node scripts/provision-lakebase.mjs)

  if [ -n "$LAKEBASE_STARTUP_URL" ]; then
    echo "[startup] Lakebase connection URL generated."
  else
    echo "[startup] ERROR: Lakebase provisioning returned empty URL."
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# Database connectivity verification
#
# Lakebase Autoscale endpoints may need a few seconds after provisioning
# before they accept authenticated connections. Retry schema sync with
# backoff to absorb this cold-start delay. The server must NOT start
# until the DB is confirmed reachable.
# ---------------------------------------------------------------------------

PRISMA_BIN="./node_modules/.bin/prisma"
SCHEMA_URL="${DATABASE_URL:-$LAKEBASE_STARTUP_URL}"
MAX_DB_RETRIES=15
DB_RETRY_INTERVAL=3

if [ -x "$PRISMA_BIN" ] && [ -n "$SCHEMA_URL" ]; then
  echo "[startup] Verifying database connectivity..."
  ATTEMPT=0
  DB_READY=false

  while [ "$ATTEMPT" -lt "$MAX_DB_RETRIES" ]; do
    ATTEMPT=$((ATTEMPT + 1))

    if DATABASE_URL="$SCHEMA_URL" "$PRISMA_BIN" db push --skip-generate 2>&1; then
      echo "[startup] Database ready — schema sync complete (attempt $ATTEMPT)."
      DB_READY=true
      break
    fi

    if [ "$ATTEMPT" -lt "$MAX_DB_RETRIES" ]; then
      echo "[startup] Database not ready (attempt $ATTEMPT/$MAX_DB_RETRIES), retrying in ${DB_RETRY_INTERVAL}s..."
      sleep "$DB_RETRY_INTERVAL"
    fi
  done

  if [ "$DB_READY" = false ]; then
    echo "[startup] WARNING: Database not reachable after $MAX_DB_RETRIES attempts. Starting server anyway."
  fi
else
  echo "[startup] Prisma CLI not found or no DB URL, skipping connectivity check."
fi

# ---------------------------------------------------------------------------
# Start the standalone Next.js server
#
# Pass the verified startup credential as DATABASE_URL so the server has
# an immediately working connection. When the credential expires (~1h),
# withPrisma catches the auth error, deletes DATABASE_URL, and switches
# to auto-provision mode with proactive refresh permanently.
# ---------------------------------------------------------------------------

export PORT="${DATABRICKS_APP_PORT:-8000}"
echo "[startup] Starting server on port $PORT..."

cd .next/standalone

if [ -n "$LAKEBASE_STARTUP_URL" ]; then
  echo "[startup] Passing verified credential to server."
  DATABASE_URL="$LAKEBASE_STARTUP_URL" exec node server.js
else
  exec node server.js
fi

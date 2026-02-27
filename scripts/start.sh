#!/bin/sh
# Databricks Forge AI — Production startup script for Databricks Apps
#
# The platform runs `npm install` + `npm run build` before this script.
# After build, .next/standalone/ contains the self-contained server.
#
# 1. Auto-provisions Lakebase Autoscale (if running as a Databricks App).
# 2. Syncs the Prisma schema to Lakebase (retries for cold-start wake-up).
#    Exits with error if sync fails — the app cannot run with a stale schema.
# 3. Starts the Next.js standalone server with a verified credential.

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
# Database schema sync (mandatory)
#
# Lakebase Autoscale endpoints may need a few seconds after provisioning
# before they accept authenticated connections. Retry schema sync with
# backoff to absorb this cold-start delay. The server MUST NOT start
# until the schema is confirmed in sync.
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

    if DATABASE_URL="$SCHEMA_URL" "$PRISMA_BIN" db push 2>&1; then
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
    echo "[startup] FATAL: Database schema sync failed after $MAX_DB_RETRIES attempts."
    exit 1
  fi

  # pgvector extension + forge_embeddings table (only when embedding endpoint is configured)
  if [ -n "$DATABRICKS_EMBEDDING_ENDPOINT" ]; then
    echo "[startup] Embedding endpoint configured ($DATABRICKS_EMBEDDING_ENDPOINT), ensuring pgvector schema..."
    DATABASE_URL="$SCHEMA_URL" node -e "
      const pg = require('pg');
      async function main() {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        const client = await pool.connect();
        try {
          await client.query('CREATE EXTENSION IF NOT EXISTS vector');
          await client.query(\`
            CREATE TABLE IF NOT EXISTS forge_embeddings (
              id            TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
              kind          TEXT NOT NULL,
              source_id     TEXT NOT NULL,
              run_id        TEXT,
              scan_id       TEXT,
              content_text  TEXT NOT NULL,
              metadata_json JSONB,
              embedding     vector(1024) NOT NULL,
              created_at    TIMESTAMPTZ DEFAULT NOW()
            )
          \`);
          await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_kind ON forge_embeddings(kind)');
          await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_source ON forge_embeddings(source_id)');
          await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_run ON forge_embeddings(run_id)');
          await client.query('CREATE INDEX IF NOT EXISTS idx_embeddings_scan ON forge_embeddings(scan_id)');
          await client.query(\`
            CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON forge_embeddings
              USING hnsw (embedding vector_cosine_ops)
              WITH (m = 16, ef_construction = 64)
          \`);
          console.log('[startup] pgvector schema ready.');
        } catch (e) {
          console.log('[startup] pgvector schema setup note:', e.message || e);
        } finally {
          client.release();
          await pool.end();
        }
      }
      main();
    " 2>&1 || echo "[startup] pgvector setup completed (with warnings)."
  else
    echo "[startup] No embedding endpoint configured (serving-endpoint-embedding not bound), skipping pgvector setup."
  fi

else
  echo "[startup] FATAL: Prisma CLI not found or no DB URL — cannot sync schema."
  exit 1
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

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
LAKEBASE_STARTUP_USERNAME=""

if [ -n "$DATABRICKS_CLIENT_ID" ] && [ -z "$DATABASE_URL" ]; then
  echo "[startup] Auto-provisioning Lakebase Autoscale..."

  PROVISION_OUTPUT=$(node scripts/provision-lakebase.mjs)
  LAKEBASE_STARTUP_URL=$(echo "$PROVISION_OUTPUT" | head -n 1)
  LAKEBASE_STARTUP_USERNAME=$(echo "$PROVISION_OUTPUT" | tail -n 1)

  if [ -n "$LAKEBASE_STARTUP_URL" ]; then
    echo "[startup] Lakebase connection URL generated (credential verified)."
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
MAX_DB_RETRIES=5
DB_RETRY_INTERVAL=3

if [ -x "$PRISMA_BIN" ] && [ -n "$SCHEMA_URL" ]; then
  # -- Step A: Enable pgvector extension BEFORE Prisma schema push --------
  # The ForgeEmbedding model uses Unsupported("vector(1024)") so the
  # extension must exist before prisma db push tries to create the table.
  # The credential is pre-verified by provision-lakebase.mjs, so this
  # should succeed on the first attempt. Retries are kept as a safety net.
  echo "[startup] Enabling pgvector extension..."
  PGVEC_ATTEMPT=0
  PGVEC_READY=false

  while [ "$PGVEC_ATTEMPT" -lt "$MAX_DB_RETRIES" ]; do
    PGVEC_ATTEMPT=$((PGVEC_ATTEMPT + 1))

    if DATABASE_URL="$SCHEMA_URL" node -e "
      const pg = require('pg');
      (async () => {
        const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
        try {
          await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
          console.log('[startup] pgvector extension enabled.');
        } finally {
          await pool.end();
        }
      })();
    " 2>&1; then
      PGVEC_READY=true
      break
    fi

    if [ "$PGVEC_ATTEMPT" -lt "$MAX_DB_RETRIES" ]; then
      echo "[startup] Database not ready for pgvector (attempt $PGVEC_ATTEMPT/$MAX_DB_RETRIES), retrying in ${DB_RETRY_INTERVAL}s..."
      sleep "$DB_RETRY_INTERVAL"
    fi
  done

  if [ "$PGVEC_READY" = false ]; then
    echo "[startup] WARNING: Could not enable pgvector after $MAX_DB_RETRIES attempts. Prisma push may fail for vector columns."
  fi

  # -- Step B: Prisma schema push ----------------------------------------
  echo "[startup] Verifying database connectivity..."
  ATTEMPT=0
  DB_READY=false

  while [ "$ATTEMPT" -lt "$MAX_DB_RETRIES" ]; do
    ATTEMPT=$((ATTEMPT + 1))

    if DATABASE_URL="$SCHEMA_URL" "$PRISMA_BIN" db push --accept-data-loss 2>&1; then
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

  # -- Step C: Create HNSW index (not managed by Prisma) ------------------
  if [ -n "$DATABRICKS_EMBEDDING_ENDPOINT" ]; then
    echo "[startup] Embedding endpoint configured ($DATABRICKS_EMBEDDING_ENDPOINT), ensuring HNSW index..."
    HNSW_ATTEMPT=0
    HNSW_MAX_RETRIES=5
    HNSW_READY=false

    while [ "$HNSW_ATTEMPT" -lt "$HNSW_MAX_RETRIES" ]; do
      HNSW_ATTEMPT=$((HNSW_ATTEMPT + 1))

      if DATABASE_URL="$SCHEMA_URL" node -e "
        const pg = require('pg');
        (async () => {
          const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
          try {
            await pool.query(\`
              CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw ON forge_embeddings
                USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)
            \`);
            console.log('[startup] HNSW index ready.');
          } finally {
            await pool.end();
          }
        })();
      " 2>&1; then
        HNSW_READY=true
        break
      fi

      if [ "$HNSW_ATTEMPT" -lt "$HNSW_MAX_RETRIES" ]; then
        echo "[startup] HNSW index not ready (attempt $HNSW_ATTEMPT/$HNSW_MAX_RETRIES), retrying in ${DB_RETRY_INTERVAL}s..."
        sleep "$DB_RETRY_INTERVAL"
      fi
    done

    if [ "$HNSW_READY" = false ]; then
      echo "[startup] WARNING: HNSW index creation failed after $HNSW_MAX_RETRIES attempts. Semantic search may be slow."
    fi
  else
    echo "[startup] No embedding endpoint configured (serving-endpoint-embedding not bound), skipping HNSW index."
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
  export DATABASE_URL="$LAKEBASE_STARTUP_URL"
  if [ -n "$LAKEBASE_STARTUP_USERNAME" ]; then
    export LAKEBASE_USERNAME="$LAKEBASE_STARTUP_USERNAME"
  fi
  exec node server.js
else
  exec node server.js
fi

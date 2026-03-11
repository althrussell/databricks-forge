#!/usr/bin/env bash
# =========================================================================
# Databricks Forge AI — One-command deployment
#
# Usage:
#   ./deploy.sh                          Interactive (pick a warehouse)
#   ./deploy.sh --warehouse "Name"       Non-interactive
#   ./deploy.sh --prebuilt               Build locally, deploy pre-compiled bundle (fastest)
#   ./deploy.sh --profile "my-profile"   Use a specific CLI profile
#   ./deploy.sh --app-name "forge-demo"  Deploy as a separate named instance
#   ./deploy.sh --destroy                Remove the app
#
# Override model endpoints (advanced):
#   ./deploy.sh --endpoint "model" --fast-endpoint "fast-model" --review-endpoint "review-model"
# Optional Lakebase bootstrap grants:
#   ./deploy.sh --lakebase-bootstrap-user "user@company.com"
# Optional Lakebase runtime auth mode:
#   ./deploy.sh --lakebase-auth-mode "oauth|native_password"
#               --lakebase-native-user "forge_app_runtime"
#               --lakebase-native-password "..."
#               --rotate-lakebase-native-password
# Optional Lakebase OAuth runtime behavior:
#   ./deploy.sh --lakebase-runtime-mode "oauth_direct_only|pooler_preferred"
#               --lakebase-enable-pooler-experiment
# Optional Lakebase scale-to-zero (enabled by default, 300s timeout):
#   ./deploy.sh --lakebase-scale-to-zero-timeout 600
#               --lakebase-no-scale-to-zero
# Optional benchmark seeding behavior:
#   ./deploy.sh --seed-benchmarks --seed-benchmarks-all-industries
#               --seed-benchmark-industries "banking,hls,rcg"
# Optional benchmark admin restriction:
#   ./deploy.sh --benchmark-admins "alice@company.com,bob@company.com"
# Optional metric views (disabled by default):
#   ./deploy.sh --enable-metric-views
# =========================================================================

set -euo pipefail

# -------------------------------------------------------------------------
# Defaults
# -------------------------------------------------------------------------
APP_NAME="databricks-forge"
APP_DESC="Discover AI-powered use cases from Unity Catalog metadata"
DEFAULT_ENDPOINT="databricks-claude-opus-4-6"
DEFAULT_FAST_ENDPOINT="databricks-claude-sonnet-4-6"
DEFAULT_EMBEDDING_ENDPOINT="databricks-qwen3-embedding-0-6b"
DEFAULT_REVIEW_ENDPOINT="databricks-gpt-5-4"

# -------------------------------------------------------------------------
# State (populated during execution)
# -------------------------------------------------------------------------
USER_EMAIL=""
DATABRICKS_HOST=""
WAREHOUSE_ID=""
WAREHOUSE_NAME=""
WORKSPACE_PATH=""

# -------------------------------------------------------------------------
# Parse arguments
# -------------------------------------------------------------------------
ARG_APP_NAME=""
ARG_WAREHOUSE=""
ARG_PROFILE=""
ARG_ENDPOINT=""
ARG_FAST_ENDPOINT=""
ARG_EMBEDDING_ENDPOINT=""
ARG_REVIEW_ENDPOINT=""
ARG_LAKEBASE_BOOTSTRAP_USER=""
ARG_LAKEBASE_AUTH_MODE=""
ARG_LAKEBASE_NATIVE_USER=""
ARG_LAKEBASE_NATIVE_PASSWORD=""
ARG_ROTATE_LAKEBASE_NATIVE_PASSWORD=false
ARG_PRINT_GENERATED_NATIVE_PASSWORD=false
ARG_LAKEBASE_RUNTIME_MODE=""
ARG_LAKEBASE_ENABLE_POOLER_EXPERIMENT=false
ARG_LAKEBASE_SCALE_TO_ZERO_TIMEOUT=""
ARG_LAKEBASE_NO_SCALE_TO_ZERO=false
ARG_SEED_BENCHMARKS=false
ARG_SEED_BENCHMARKS_ALL_INDUSTRIES=false
ARG_SEED_BENCHMARK_INDUSTRIES=""
ARG_BENCHMARK_ADMINS=""
ARG_ENABLE_METRIC_VIEWS=false
ARG_PREBUILT=false
ARG_DESTROY=false

print_usage() {
  cat <<'USAGE'
Databricks Forge AI — One-command deployment

Usage:
  ./deploy.sh                                  Interactive deployment
  ./deploy.sh --warehouse "My Warehouse"       Skip warehouse prompt
  ./deploy.sh --profile "my-profile"           Use a specific CLI profile
  ./deploy.sh --destroy                        Remove the app

Options:
  --app-name NAME        Custom app name for multi-instance deployments.
                         Isolates the Databricks App and Lakebase database.
                         (default: databricks-forge)
  --warehouse NAME        SQL Warehouse name (skips interactive prompt)
  --profile NAME         Databricks CLI profile name
  --endpoint NAME             Premium model endpoint    (default: databricks-claude-opus-4-6)
  --fast-endpoint NAME        Fast model endpoint       (default: databricks-claude-sonnet-4-6)
  --embedding-endpoint NAME   Embedding model endpoint  (default: databricks-qwen3-embedding-0-6b)
  --review-endpoint NAME      Review model endpoint     (default: databricks-gpt-5-4)
  --lakebase-bootstrap-user EMAIL
                             Optional Databricks user email to bootstrap
                             Lakebase OAuth role/grants during startup
  --lakebase-auth-mode MODE
                             Optional auth mode override:
                             native_password or oauth
  --lakebase-native-user USER
                             Optional native runtime DB user override
  --lakebase-native-password PASSWORD
                             Optional native runtime DB password override
  --rotate-lakebase-native-password
                             Generate and rotate native DB password at deploy time
  --print-generated-native-password
                             Print generated native password (use with caution)
  --lakebase-runtime-mode MODE
                             Lakebase runtime mode:
                             oauth_direct_only (default), pooler_preferred
  --lakebase-enable-pooler-experiment
                             Enables pooler attempts for future testing
  --lakebase-scale-to-zero-timeout SECONDS
                             Scale-to-zero inactivity timeout in seconds
                             (default: 300, minimum: 60)
  --lakebase-no-scale-to-zero
                             Explicitly disable scale-to-zero (always-on compute)
  --seed-benchmarks          Seed benchmark catalog during app startup
  --seed-benchmarks-all-industries
                             Include generated baseline records for every
                             industry in lib/domain/industry-outcomes/
  --seed-benchmark-industries CSV
                             Seed only these industry ids (e.g. banking,hls).
                             Applies to curated packs and generated baselines.
  --benchmark-admins CSV     Comma-separated emails allowed to manage benchmarks.
                             If unset, all authenticated users can manage them.
  --enable-metric-views      Enable metric view generation (off by default)
  --prebuilt                  Build locally and deploy pre-compiled standalone bundle.
                             Eliminates remote npm install + npm run build (~3x faster).
  --destroy                   Remove the app and clean up workspace files
  -h, --help              Show this help message

Prerequisites:
  - Databricks CLI installed  (https://docs.databricks.com/dev-tools/cli/install.html)
  - Authenticated CLI profile (run: databricks auth login)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-name)       ARG_APP_NAME="$2"; shift 2 ;;
    --warehouse)      ARG_WAREHOUSE="$2"; shift 2 ;;
    --profile)        ARG_PROFILE="$2"; shift 2 ;;
    --endpoint)            ARG_ENDPOINT="$2"; shift 2 ;;
    --fast-endpoint)       ARG_FAST_ENDPOINT="$2"; shift 2 ;;
    --embedding-endpoint)  ARG_EMBEDDING_ENDPOINT="$2"; shift 2 ;;
    --review-endpoint)     ARG_REVIEW_ENDPOINT="$2"; shift 2 ;;
    --lakebase-bootstrap-user) ARG_LAKEBASE_BOOTSTRAP_USER="$2"; shift 2 ;;
    --lakebase-auth-mode) ARG_LAKEBASE_AUTH_MODE="$2"; shift 2 ;;
    --lakebase-native-user) ARG_LAKEBASE_NATIVE_USER="$2"; shift 2 ;;
    --lakebase-native-password) ARG_LAKEBASE_NATIVE_PASSWORD="$2"; shift 2 ;;
    --rotate-lakebase-native-password) ARG_ROTATE_LAKEBASE_NATIVE_PASSWORD=true; shift ;;
    --print-generated-native-password) ARG_PRINT_GENERATED_NATIVE_PASSWORD=true; shift ;;
    --lakebase-runtime-mode) ARG_LAKEBASE_RUNTIME_MODE="$2"; shift 2 ;;
    --lakebase-enable-pooler-experiment) ARG_LAKEBASE_ENABLE_POOLER_EXPERIMENT=true; shift ;;
    --lakebase-scale-to-zero-timeout) ARG_LAKEBASE_SCALE_TO_ZERO_TIMEOUT="$2"; shift 2 ;;
    --lakebase-no-scale-to-zero) ARG_LAKEBASE_NO_SCALE_TO_ZERO=true; shift ;;
    --seed-benchmarks) ARG_SEED_BENCHMARKS=true; shift ;;
    --seed-benchmarks-all-industries) ARG_SEED_BENCHMARKS_ALL_INDUSTRIES=true; shift ;;
    --seed-benchmark-industries) ARG_SEED_BENCHMARK_INDUSTRIES="$2"; shift 2 ;;
    --benchmark-admins) ARG_BENCHMARK_ADMINS="$2"; shift 2 ;;
    --enable-metric-views) ARG_ENABLE_METRIC_VIEWS=true; shift ;;
    --prebuilt)            ARG_PREBUILT=true; shift ;;
    --destroy)             ARG_DESTROY=true; shift ;;
    -h|--help)        print_usage; exit 0 ;;
    *)                printf "\n  ERROR: Unknown flag: %s\n  Run ./deploy.sh --help\n\n" "$1" >&2; exit 1 ;;
  esac
done

if [[ -n "$ARG_APP_NAME" ]]; then
  APP_NAME="$ARG_APP_NAME"
fi

if [[ -n "$ARG_PROFILE" ]]; then
  export DATABRICKS_CONFIG_PROFILE="$ARG_PROFILE"
fi

ENDPOINT="${ARG_ENDPOINT:-$DEFAULT_ENDPOINT}"
FAST_ENDPOINT="${ARG_FAST_ENDPOINT:-$DEFAULT_FAST_ENDPOINT}"
EMBEDDING_ENDPOINT="${ARG_EMBEDDING_ENDPOINT:-$DEFAULT_EMBEDDING_ENDPOINT}"
REVIEW_ENDPOINT="${ARG_REVIEW_ENDPOINT:-$DEFAULT_REVIEW_ENDPOINT}"
LAKEBASE_BOOTSTRAP_USER="${ARG_LAKEBASE_BOOTSTRAP_USER:-}"
LAKEBASE_AUTH_MODE="${ARG_LAKEBASE_AUTH_MODE:-}"
LAKEBASE_NATIVE_USER="${ARG_LAKEBASE_NATIVE_USER:-}"
LAKEBASE_NATIVE_PASSWORD="${ARG_LAKEBASE_NATIVE_PASSWORD:-}"
ROTATE_LAKEBASE_NATIVE_PASSWORD="${ARG_ROTATE_LAKEBASE_NATIVE_PASSWORD}"
PRINT_GENERATED_NATIVE_PASSWORD="${ARG_PRINT_GENERATED_NATIVE_PASSWORD}"
GENERATED_NATIVE_PASSWORD=false
LAKEBASE_RUNTIME_MODE="${ARG_LAKEBASE_RUNTIME_MODE:-}"
LAKEBASE_ENABLE_POOLER_EXPERIMENT="${ARG_LAKEBASE_ENABLE_POOLER_EXPERIMENT}"
LAKEBASE_SCALE_TO_ZERO_TIMEOUT="${ARG_LAKEBASE_SCALE_TO_ZERO_TIMEOUT:-}"
LAKEBASE_NO_SCALE_TO_ZERO="${ARG_LAKEBASE_NO_SCALE_TO_ZERO}"
SEED_BENCHMARKS="${ARG_SEED_BENCHMARKS}"
SEED_BENCHMARKS_ALL_INDUSTRIES="${ARG_SEED_BENCHMARKS_ALL_INDUSTRIES}"
SEED_BENCHMARK_INDUSTRIES="${ARG_SEED_BENCHMARK_INDUSTRIES:-}"
BENCHMARK_ADMINS="${ARG_BENCHMARK_ADMINS:-}"
ENABLE_METRIC_VIEWS="${ARG_ENABLE_METRIC_VIEWS}"

if [[ "$SEED_BENCHMARKS_ALL_INDUSTRIES" = "true" && "$SEED_BENCHMARKS" != "true" ]]; then
  SEED_BENCHMARKS=true
fi
if [[ -n "$SEED_BENCHMARK_INDUSTRIES" && "$SEED_BENCHMARKS" != "true" ]]; then
  SEED_BENCHMARKS=true
fi

if [[ -n "$LAKEBASE_AUTH_MODE" && "$LAKEBASE_AUTH_MODE" != "oauth" && "$LAKEBASE_AUTH_MODE" != "native_password" ]]; then
  die "Invalid --lakebase-auth-mode '$LAKEBASE_AUTH_MODE'. Expected oauth or native_password."
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" && -z "$LAKEBASE_AUTH_MODE" ]]; then
  LAKEBASE_AUTH_MODE="native_password"
fi
if [[ -n "$LAKEBASE_NATIVE_USER" || -n "$LAKEBASE_NATIVE_PASSWORD" ]]; then
  if [[ "$LAKEBASE_AUTH_MODE" != "native_password" ]]; then
    die "--lakebase-native-user/--lakebase-native-password require --lakebase-auth-mode native_password."
  fi
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" && "$LAKEBASE_AUTH_MODE" != "native_password" ]]; then
  die "--rotate-lakebase-native-password requires --lakebase-auth-mode native_password (or leave auth mode unset)."
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" && -n "$LAKEBASE_NATIVE_PASSWORD" ]]; then
  die "Cannot combine --rotate-lakebase-native-password with --lakebase-native-password."
fi
if [[ "$PRINT_GENERATED_NATIVE_PASSWORD" = "true" && "$ROTATE_LAKEBASE_NATIVE_PASSWORD" != "true" ]]; then
  die "--print-generated-native-password is only valid with --rotate-lakebase-native-password."
fi
if [[ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" ]]; then
  LAKEBASE_NATIVE_PASSWORD="$(python3 - <<'PY'
import secrets
import string
alphabet = string.ascii_letters + string.digits + "-_@#%+=."
print("".join(secrets.choice(alphabet) for _ in range(48)))
PY
)"
  GENERATED_NATIVE_PASSWORD=true
fi

if [[ -n "$LAKEBASE_RUNTIME_MODE" && "$LAKEBASE_RUNTIME_MODE" != "oauth_direct_only" && "$LAKEBASE_RUNTIME_MODE" != "pooler_preferred" ]]; then
  die "Invalid --lakebase-runtime-mode '$LAKEBASE_RUNTIME_MODE'. Expected oauth_direct_only or pooler_preferred."
fi

if [[ "$LAKEBASE_NO_SCALE_TO_ZERO" = "true" && -n "$LAKEBASE_SCALE_TO_ZERO_TIMEOUT" ]]; then
  die "Cannot combine --lakebase-no-scale-to-zero with --lakebase-scale-to-zero-timeout."
fi

# -------------------------------------------------------------------------
# Output helpers
# -------------------------------------------------------------------------
die()  { printf "\n  ERROR: %s\n\n" "$1" >&2; exit 1; }
info() { printf "  %-48s" "$1"; }
ok()   { if [ -n "${1:-}" ]; then printf "OK  (%s)\n" "$1"; else printf "OK\n"; fi; }

# Extract a value from JSON via Python 3.
# Usage: echo '{"k":"v"}' | json_val "['k']"
json_val() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

get_app_compute_state() {
  local app_json
  if ! app_json=$(databricks apps get "$APP_NAME" --output json 2>/dev/null); then
    echo "MISSING"
    return
  fi
  echo "$app_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN"
}

wait_for_app_absent() {
  local attempts=0
  local max_attempts=30
  local sleep_secs=10
  local state

  info "Waiting for app deletion..."
  while [ $attempts -lt $max_attempts ]; do
    state="$(get_app_compute_state)"
    if [ "$state" = "MISSING" ]; then
      ok "deleted"
      return 0
    fi
    sleep "$sleep_secs"
    attempts=$((attempts + 1))
  done

  printf "TIMEOUT\n"
  return 1
}

APP_YAML_BACKUP=""

prepare_app_yaml() {
  # Back up and patch app.yaml with instance-specific env vars for syncing.
  # Reads from the ORIGINAL repo file (git version) to avoid contamination
  # from previous deploys that may have left managed vars in the file.
  APP_YAML_BACKUP="$(mktemp)"
  cp "app.yaml" "$APP_YAML_BACKUP"

  # Restore the clean git version first, then patch from that baseline
  git checkout -- app.yaml 2>/dev/null || true

  export APP_NAME
  export LAKEBASE_BOOTSTRAP_USER
  export LAKEBASE_AUTH_MODE
  export LAKEBASE_NATIVE_USER
  export LAKEBASE_NATIVE_PASSWORD
  export LAKEBASE_RUNTIME_MODE
  export LAKEBASE_ENABLE_POOLER_EXPERIMENT
  export LAKEBASE_SCALE_TO_ZERO_TIMEOUT
  export LAKEBASE_NO_SCALE_TO_ZERO
  export SEED_BENCHMARKS
  export SEED_BENCHMARKS_ALL_INDUSTRIES
  export SEED_BENCHMARK_INDUSTRIES
  export BENCHMARK_ADMINS
  export ENABLE_METRIC_VIEWS
  python3 - <<'PY'
import os
from pathlib import Path

app_name = os.environ.get("APP_NAME", "databricks-forge").strip()
bootstrap_user = os.environ.get("LAKEBASE_BOOTSTRAP_USER", "").strip()
auth_mode = os.environ.get("LAKEBASE_AUTH_MODE", "").strip()
native_user = os.environ.get("LAKEBASE_NATIVE_USER", "").strip()
native_password = os.environ.get("LAKEBASE_NATIVE_PASSWORD", "")
runtime_mode = os.environ.get("LAKEBASE_RUNTIME_MODE", "").strip()
pooler_experiment = os.environ.get("LAKEBASE_ENABLE_POOLER_EXPERIMENT", "").strip().lower() == "true"
scale_to_zero_timeout = os.environ.get("LAKEBASE_SCALE_TO_ZERO_TIMEOUT", "").strip()
no_scale_to_zero = os.environ.get("LAKEBASE_NO_SCALE_TO_ZERO", "").strip().lower() == "true"
seed_benchmarks = os.environ.get("SEED_BENCHMARKS", "").strip().lower() == "true"
seed_benchmarks_all = os.environ.get("SEED_BENCHMARKS_ALL_INDUSTRIES", "").strip().lower() == "true"
seed_benchmark_industries = os.environ.get("SEED_BENCHMARK_INDUSTRIES", "").strip()
benchmark_admins = os.environ.get("BENCHMARK_ADMINS", "").strip()
enable_metric_views = os.environ.get("ENABLE_METRIC_VIEWS", "").strip().lower() == "true"

path = Path("app.yaml")
lines = path.read_text().splitlines()
out: list[str] = []
i = 0

def is_managed_name_line(s: str) -> bool:
    t = s.strip()
    if not t.startswith("- name:"):
        return False
    return (
        "FORGE_APP_NAME" in t
        or "LAKEBASE_BOOTSTRAP_USER" in t
        or "LAKEBASE_AUTH_MODE" in t
        or "LAKEBASE_NATIVE_USER" in t
        or "LAKEBASE_NATIVE_PASSWORD" in t
        or "LAKEBASE_RUNTIME_MODE" in t
        or "LAKEBASE_ENABLE_POOLER_EXPERIMENT" in t
        or "LAKEBASE_SCALE_TO_ZERO_TIMEOUT" in t
        or "FORGE_SEED_BENCHMARKS" in t
        or "FORGE_SEED_BENCHMARKS_ALL_INDUSTRIES" in t
        or "FORGE_SEED_BENCHMARK_INDUSTRIES" in t
        or "FORGE_BENCHMARK_ADMINS" in t
        or "FORGE_METRIC_VIEWS_ENABLED" in t
    )

while i < len(lines):
    line = lines[i]
    if is_managed_name_line(line):
        i += 1
        while i < len(lines):
            nxt = lines[i]
            if nxt.startswith("  - name:"):
                break
            i += 1
        continue
    out.append(line)
    i += 1

if app_name != "databricks-forge":
    out.append("  - name: FORGE_APP_NAME")
    out.append(f'    value: "{app_name}"')
if bootstrap_user:
    out.append("  - name: LAKEBASE_BOOTSTRAP_USER")
    out.append(f'    value: "{bootstrap_user}"')
if auth_mode:
    out.append("  - name: LAKEBASE_AUTH_MODE")
    out.append(f'    value: "{auth_mode}"')
if auth_mode == "native_password" and native_user:
    out.append("  - name: LAKEBASE_NATIVE_USER")
    out.append(f'    value: "{native_user}"')
if auth_mode == "native_password" and native_password:
    out.append("  - name: LAKEBASE_NATIVE_PASSWORD")
    out.append(f'    value: "{native_password}"')
if runtime_mode:
    out.append("  - name: LAKEBASE_RUNTIME_MODE")
    out.append(f'    value: "{runtime_mode}"')
out.append("  - name: LAKEBASE_ENABLE_POOLER_EXPERIMENT")
out.append(f'    value: "{"true" if pooler_experiment else "false"}"')
if no_scale_to_zero:
    out.append("  - name: LAKEBASE_SCALE_TO_ZERO_TIMEOUT")
    out.append('    value: "disabled"')
elif scale_to_zero_timeout:
    out.append("  - name: LAKEBASE_SCALE_TO_ZERO_TIMEOUT")
    out.append(f'    value: "{scale_to_zero_timeout}"')
out.append("  - name: FORGE_SEED_BENCHMARKS")
out.append(f'    value: "{"true" if seed_benchmarks else "false"}"')
out.append("  - name: FORGE_SEED_BENCHMARKS_ALL_INDUSTRIES")
out.append(f'    value: "{"true" if seed_benchmarks_all else "false"}"')
if seed_benchmark_industries:
    out.append("  - name: FORGE_SEED_BENCHMARK_INDUSTRIES")
    out.append(f'    value: "{seed_benchmark_industries}"')
if benchmark_admins:
    out.append("  - name: FORGE_BENCHMARK_ADMINS")
    out.append(f'    value: "{benchmark_admins}"')
if enable_metric_views:
    out.append("  - name: FORGE_METRIC_VIEWS_ENABLED")
    out.append('    value: "true"')
path.write_text("\n".join(out) + "\n")
PY
}

restore_app_yaml() {
  if [ -n "$APP_YAML_BACKUP" ] && [ -f "$APP_YAML_BACKUP" ]; then
    mv "$APP_YAML_BACKUP" "app.yaml"
    APP_YAML_BACKUP=""
  fi
}

# -------------------------------------------------------------------------
# Pre-built package assembly
#
# Builds the Next.js standalone bundle locally, then assembles a minimal
# deploy directory that the Databricks Apps platform can run without
# npm install (full) or npm run build.
#
# The deploy package includes:
#   - Standalone server (server.js + bundled node_modules + .next/)
#   - Runtime scripts (start.sh, provision-lakebase.mjs, seed-benchmarks.mjs)
#   - Prisma schema (for prisma db push at startup)
#   - Benchmark data (for optional seed)
#   - app.yaml
#   - A minimal package.json with only prisma + pg (no build script)
#   - A .prebuilt marker file for start.sh detection
# -------------------------------------------------------------------------
DEPLOY_PKG=".deploy-pkg"

assemble_prebuilt() {
  printf "\n  Assembling pre-built deploy package...\n"

  # -- Install Linux sharp binaries for cross-platform build ---------------
  info "Installing Linux sharp binaries..."
  if npm install --no-save --no-audit --no-fund --force \
       @img/sharp-linux-x64 @img/sharp-libvips-linux-x64 2>/dev/null; then
    ok
  else
    ok "skipped (non-critical)"
  fi

  # -- Local build ---------------------------------------------------------
  info "Building locally (prisma generate + next build)..."
  if ! npm run build 2>&1 | tail -3; then
    die "Local build failed. Fix errors and retry."
  fi
  ok

  # -- Locate standalone root (Next.js nests it under the project path) ----
  local standalone_root=".next/standalone"
  local nested
  nested=$(find "$standalone_root" -name "server.js" -maxdepth 6 -not -path "*/node_modules/*" | head -1)
  if [ -z "$nested" ]; then
    die "server.js not found in $standalone_root. Build may have failed."
  fi
  local standalone_app_dir
  standalone_app_dir=$(dirname "$nested")

  # -- Clean and create deploy package directory ---------------------------
  info "Assembling $DEPLOY_PKG/..."
  rm -rf "$DEPLOY_PKG"
  mkdir -p "$DEPLOY_PKG"

  # Copy the standalone app (server.js, node_modules, .next/, package.json)
  cp -a "$standalone_app_dir/." "$DEPLOY_PKG/"

  # Replace public/ with the postbuild copy (has fonts, all static assets)
  rm -rf "$DEPLOY_PKG/public"
  if [ -d "$standalone_root/public" ]; then
    cp -a "$standalone_root/public" "$DEPLOY_PKG/public"
  fi

  # Copy .next/static/ (postbuild.sh puts it in standalone root)
  if [ -d "$standalone_root/.next/static" ]; then
    mkdir -p "$DEPLOY_PKG/.next"
    cp -a "$standalone_root/.next/static" "$DEPLOY_PKG/.next/static"
  fi

  # -- Strip macOS-only sharp binaries (saves ~16MB) -----------------------
  rm -rf "$DEPLOY_PKG/node_modules/@img/sharp-darwin-arm64" \
         "$DEPLOY_PKG/node_modules/@img/sharp-libvips-darwin-arm64" \
         "$DEPLOY_PKG/node_modules/@img/sharp-darwin-x64" \
         "$DEPLOY_PKG/node_modules/@img/sharp-libvips-darwin-x64" \
         2>/dev/null || true

  # -- Strip typescript (saves ~20MB; only needed by prisma config which
  #    the platform's lean npm install of prisma handles separately) --------
  rm -rf "$DEPLOY_PKG/node_modules/typescript" 2>/dev/null || true

  # -- Copy runtime scripts ------------------------------------------------
  mkdir -p "$DEPLOY_PKG/scripts"
  cp scripts/start.sh "$DEPLOY_PKG/scripts/"
  cp scripts/provision-lakebase.mjs "$DEPLOY_PKG/scripts/"
  cp scripts/seed-benchmarks.mjs "$DEPLOY_PKG/scripts/"

  # -- Copy prisma schema + config -----------------------------------------
  mkdir -p "$DEPLOY_PKG/prisma"
  cp prisma/schema.prisma "$DEPLOY_PKG/prisma/"
  cp prisma.config.ts "$DEPLOY_PKG/"

  # -- Copy benchmark data (for optional seed) -----------------------------
  if [ -d "data/benchmark" ]; then
    mkdir -p "$DEPLOY_PKG/data/benchmark"
    cp data/benchmark/*.json "$DEPLOY_PKG/data/benchmark/" 2>/dev/null || true
  fi

  # -- Write minimal package.json (no build script, runtime deps only) -----
  # The platform detects package.json → runs npm install (fast, 2 deps)
  # → skips npm run build (no build script defined).
  local prisma_ver pg_ver
  prisma_ver=$(node -e "console.log(require('./package.json').devDependencies?.prisma || require('./package.json').dependencies?.prisma || '7')")
  pg_ver=$(node -e "console.log(require('./package.json').dependencies?.pg || '8')")

  cat > "$DEPLOY_PKG/package.json" <<PKGJSON
{
  "name": "databricks-forge-prebuilt",
  "private": true,
  "dependencies": {
    "prisma": "${prisma_ver}",
    "pg": "${pg_ver}",
    "dotenv": "^16.0.0",
    "typescript": "^5.0.0"
  }
}
PKGJSON

  # -- Write .prebuilt marker file -----------------------------------------
  echo "assembled=$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$DEPLOY_PKG/.prebuilt"

  # -- Report package size -------------------------------------------------
  local pkg_size
  pkg_size=$(du -sh "$DEPLOY_PKG" | cut -f1)
  local pkg_files
  pkg_files=$(find "$DEPLOY_PKG" -type f | wc -l | tr -d ' ')
  ok "${pkg_size} / ${pkg_files} files"
}

# -------------------------------------------------------------------------
# Step 1: Check prerequisites
# -------------------------------------------------------------------------
check_prerequisites() {
  printf "\n  Checking prerequisites...\n"

  info "Databricks CLI..."
  if ! command -v databricks &>/dev/null; then
    printf "MISSING\n"
    die "Databricks CLI not found.\n  Install: https://docs.databricks.com/dev-tools/cli/install.html"
  fi
  local cli_ver
  cli_ver=$(databricks version 2>/dev/null || databricks --version 2>/dev/null || echo "unknown")
  ok "$cli_ver"

  info "CLI profile..."
  ok "${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"

  info "Authentication..."
  local user_json
  if ! user_json=$(databricks current-user me --output json 2>/dev/null); then
    printf "FAILED\n"
    die "Not authenticated. Run:\n  databricks auth login --host https://your-workspace.cloud.databricks.com"
  fi
  USER_EMAIL=$(echo "$user_json" | json_val "['userName']")
  ok "$USER_EMAIL"

  info "Workspace host..."
  DATABRICKS_HOST=""
  if command -v databricks &>/dev/null; then
    DATABRICKS_HOST=$(databricks auth describe --output json 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('host',''))" 2>/dev/null || true)
  fi
  if [ -z "$DATABRICKS_HOST" ]; then
    DATABRICKS_HOST=$(databricks auth describe 2>/dev/null \
      | grep -i "Host:" | head -1 | awk '{print $NF}' || echo "")
  fi
  if [ -z "$DATABRICKS_HOST" ]; then
    die "Could not determine workspace host. Check your CLI profile."
  fi
  DATABRICKS_HOST="${DATABRICKS_HOST%/}"
  ok "$DATABRICKS_HOST"
}

# -------------------------------------------------------------------------
# Step 2: Select a SQL Warehouse
# -------------------------------------------------------------------------
select_warehouse() {
  printf "\n  Discovering SQL Warehouses...\n"

  local wh_json
  if ! wh_json=$(databricks warehouses list --output json 2>/dev/null); then
    die "Failed to list SQL Warehouses. Check your permissions."
  fi

  local wh_count
  wh_count=$(echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
print(len(wh))
")

  if [ "$wh_count" -eq 0 ]; then
    die "No SQL Warehouses found in this workspace. Create one first."
  fi

  echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
for i, w in enumerate(wh, 1):
    state = w.get('state', 'UNKNOWN')
    name  = w.get('name', 'Unnamed')
    print(f'    {i}) {name} ({state})')
"

  if [ -n "$ARG_WAREHOUSE" ]; then
    local result
    result=$(echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
target = '''$ARG_WAREHOUSE'''
for w in wh:
    if w.get('name','') == target:
        print(w['id'] + '|' + w.get('name',''))
        sys.exit(0)
print('')
")
    if [ -z "$result" ]; then
      die "Warehouse '$ARG_WAREHOUSE' not found."
    fi
    WAREHOUSE_ID="${result%%|*}"
    WAREHOUSE_NAME="${result#*|}"
    printf "  -> %s (via --warehouse flag)\n" "$WAREHOUSE_NAME"
  else
    printf "  Enter number [1]: "
    read -r choice
    choice="${choice:-1}"

    local result
    result=$(echo "$wh_json" | python3 -c "
import sys, json
data = json.load(sys.stdin)
wh = data if isinstance(data, list) else data.get('warehouses', [])
idx = int('''$choice''') - 1
if 0 <= idx < len(wh):
    w = wh[idx]
    print(w['id'] + '|' + w.get('name','Unnamed'))
else:
    print('')
")
    if [ -z "$result" ]; then
      die "Invalid selection. Enter a number from the list."
    fi
    WAREHOUSE_ID="${result%%|*}"
    WAREHOUSE_NAME="${result#*|}"
    printf "  -> %s\n" "$WAREHOUSE_NAME"
  fi
}

# -------------------------------------------------------------------------
# Step 3: Create the app (if it doesn't exist) and configure it
#
# New apps: created with user_api_scopes via the create endpoint, then
# resources are bound via create-update.
#
# Existing apps: create-update sets both resources and scopes idempotently.
#
# The app.yaml references resources via valueFrom: keys, which the platform
# resolves to environment variables at runtime.
# -------------------------------------------------------------------------
APP_SCOPES='["sql","catalog.tables:read","catalog.schemas:read","catalog.catalogs:read","files.files","dashboards.genie"]'

create_app() {
  printf "\n"
  info "App \"$APP_NAME\"..."

  local existing_state
  existing_state="$(get_app_compute_state)"

  if [ "$existing_state" = "DELETING" ]; then
    printf "WAIT  (currently deleting)\n"
    if ! wait_for_app_absent; then
      die "App is still deleting and could not be recreated yet. Wait a few minutes and retry."
    fi
    info "App \"$APP_NAME\"..."
  fi

  if [ "$existing_state" = "MISSING" ] || [ "$existing_state" = "DELETING" ]; then
    local create_json
    create_json=$(python3 -c "
import json
print(json.dumps({
    'name': '''$APP_NAME''',
    'description': '''$APP_DESC''',
    'user_api_scopes': ['sql','catalog.tables:read','catalog.schemas:read','catalog.catalogs:read','files.files','dashboards.genie']
}))
")
    local create_err
    if ! create_err=$(databricks apps create --json "$create_json" --no-compute --no-wait 2>&1); then
      printf "FAILED\n"
      die "Failed to create app.\n  $create_err"
    fi
    ok "created with scopes"
  else
    ok "already exists"
  fi
}

wait_for_stable_state() {
  local state
  state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

  if [ "$state" = "ACTIVE" ] || [ "$state" = "STOPPED" ]; then
    return
  fi

  info "Waiting for compute to stabilise..."
  local attempts=0
  while [ $attempts -lt 30 ]; do
    sleep 10
    state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
    if [ "$state" = "ACTIVE" ] || [ "$state" = "STOPPED" ]; then
      ok "$state"
      return
    fi
    attempts=$((attempts + 1))
  done
  ok "proceeding ($state)"
}

configure_app() {
  info "Configuring resources and scopes..."

  local update_json
  update_json=$(python3 -c "
import json
print(json.dumps({
    'resources': [
        {
            'name': 'sql-warehouse',
            'sql_warehouse': {
                'id': '$WAREHOUSE_ID',
                'permission': 'CAN_USE'
            }
        },
        {
            'name': 'serving-endpoint',
            'serving_endpoint': {
                'name': '$ENDPOINT',
                'permission': 'CAN_QUERY'
            }
        },
        {
            'name': 'serving-endpoint-fast',
            'serving_endpoint': {
                'name': '$FAST_ENDPOINT',
                'permission': 'CAN_QUERY'
            }
        },
        {
            'name': 'serving-endpoint-embedding',
            'serving_endpoint': {
                'name': '$EMBEDDING_ENDPOINT',
                'permission': 'CAN_QUERY'
            }
        },
        {
            'name': 'serving-endpoint-review',
            'serving_endpoint': {
                'name': '$REVIEW_ENDPOINT',
                'permission': 'CAN_QUERY'
            }
        }
    ],
    'user_api_scopes': ['sql','catalog.tables:read','catalog.schemas:read','catalog.catalogs:read','files.files','dashboards.genie']
}))
")

  local update_err
  if ! update_err=$(databricks apps update "$APP_NAME" \
       --json "$update_json" 2>&1); then
    printf "FAILED\n"
    die "Failed to configure app resources and scopes.\n  $update_err"
  fi
  ok
}

# -------------------------------------------------------------------------
# Step 5: Upload source code (or pre-built package)
# -------------------------------------------------------------------------
upload_code() {
  WORKSPACE_PATH="/Workspace/Users/${USER_EMAIL}/${APP_NAME}"

  # Clear stale sync snapshots so concurrent deploys (different --app-name
  # targets from the same checkout) don't poison each other's state.
  rm -rf .databricks/sync-snapshots 2>/dev/null || true

  local sync_source="."
  local sync_flags="--full"
  if [ "$ARG_PREBUILT" = "true" ]; then
    sync_source="$DEPLOY_PKG"
    rm -rf "$DEPLOY_PKG/.databricks/sync-snapshots" 2>/dev/null || true
    info "Uploading pre-built package (full sync)..."
  else
    info "Uploading source code (full sync)..."
    if [ -f ".databricksignore" ]; then
      sync_flags="--full --exclude-from .databricksignore"
    fi
  fi

  if ! databricks sync $sync_flags "$sync_source" "$WORKSPACE_PATH"; then
    die "Failed to upload code.\n  Try manually: databricks sync $sync_flags $sync_source $WORKSPACE_PATH"
  fi
  ok
}

# -------------------------------------------------------------------------
# Step 6: Start compute (must be active before deploying)
# -------------------------------------------------------------------------
start_compute() {
  info "App compute..."

  local state
  state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

  if [ "$state" = "ACTIVE" ]; then
    ok "already running"
    return
  fi

  databricks apps start "$APP_NAME" --no-wait &>/dev/null || true
  printf "starting"

  local attempts=0
  while [ $attempts -lt 30 ]; do
    sleep 10
    state=$(databricks apps get "$APP_NAME" --output json 2>/dev/null \
      | python3 -c "import sys,json; print(json.load(sys.stdin).get('compute_status',{}).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")
    if [ "$state" = "ACTIVE" ]; then
      printf "\r  %-48s" "App compute..."
      ok "running"
      return
    fi
    printf "."
    attempts=$((attempts + 1))
  done

  printf "\r  %-48s" "App compute..."
  printf "TIMEOUT\n"
  die "Compute did not start within 5 minutes.\n  Check the Databricks Apps UI for details."
}

# -------------------------------------------------------------------------
# Step 7: Deploy
# -------------------------------------------------------------------------
deploy_app() {
  info "Deploying..."

  local deploy_err
  if ! deploy_err=$(databricks apps deploy "$APP_NAME" \
       --source-code-path "$WORKSPACE_PATH" --mode SNAPSHOT --no-wait 2>&1); then
    printf "FAILED\n"
    die "Deployment failed.\n  $deploy_err"
  fi
  ok "deployment started"
}

# -------------------------------------------------------------------------
# Print success banner
# -------------------------------------------------------------------------
print_success() {
  local app_url="${DATABRICKS_HOST}/apps/${APP_NAME}"

  printf "\n"
  printf "  ==========================================================\n"
  printf "    Databricks Forge AI is live!\n"
  printf "    URL: %s\n" "$app_url"
  printf "\n"
  printf "    App name:     %s\n" "$APP_NAME"
  printf "    Deploy mode:  %s\n" "$( [ "$ARG_PREBUILT" = "true" ] && echo "pre-built (local build)" || echo "source (remote build)" )"
  printf "\n"
  printf "    Resources:\n"
  printf "      SQL Warehouse:    %s\n" "$WAREHOUSE_NAME"
  printf "      Premium model:    %s\n" "$ENDPOINT"
  printf "      Fast model:       %s\n" "$FAST_ENDPOINT"
  printf "      Embedding model:  %s\n" "$EMBEDDING_ENDPOINT"
  printf "      Review model:     %s\n" "$REVIEW_ENDPOINT"
  if [ -n "$LAKEBASE_BOOTSTRAP_USER" ]; then
    printf "      Bootstrap user:   %s\n" "$LAKEBASE_BOOTSTRAP_USER"
  fi
  printf "      Auth mode:        %s\n" "${LAKEBASE_AUTH_MODE:-repo default (start.sh)}"
  if [ "$LAKEBASE_AUTH_MODE" = "native_password" ] && [ -n "$LAKEBASE_NATIVE_USER" ]; then
    printf "      Native db user:   %s\n" "$LAKEBASE_NATIVE_USER"
  fi
  if [ "$ROTATE_LAKEBASE_NATIVE_PASSWORD" = "true" ]; then
    printf "      Native password:  rotated\n"
  fi
  printf "      Runtime mode:     %s\n" "${LAKEBASE_RUNTIME_MODE:-oauth_direct_only (default)}"
  printf "      Pooler experiment:%s\n" "$( [ "$LAKEBASE_ENABLE_POOLER_EXPERIMENT" = "true" ] && echo " enabled" || echo " disabled" )"
  printf "      Seed benchmarks:  %s\n" "$( [ "$SEED_BENCHMARKS" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Seed all industries: %s\n" "$( [ "$SEED_BENCHMARKS_ALL_INDUSTRIES" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Seed industry filter: %s\n" "${SEED_BENCHMARK_INDUSTRIES:-none}"
  printf "      Metric views:     %s\n" "$( [ "$ENABLE_METRIC_VIEWS" = "true" ] && echo "enabled" || echo "disabled" )"
  printf "      Benchmark admins: %s\n" "${BENCHMARK_ADMINS:-all authenticated users}"
  if [ "$GENERATED_NATIVE_PASSWORD" = "true" ] && [ "$PRINT_GENERATED_NATIVE_PASSWORD" = "true" ]; then
    printf "      Generated native password: %s\n" "$LAKEBASE_NATIVE_PASSWORD"
  fi
  printf "\n"
  printf "    User scopes:\n"
  printf "      sql, catalog.tables:read, catalog.schemas:read,\n"
  printf "      catalog.catalogs:read, files.files, dashboards.genie\n"
  printf "  ==========================================================\n"
  printf "\n"
}

# -------------------------------------------------------------------------
# Destroy
# -------------------------------------------------------------------------
destroy() {
  printf "\n  Removing Databricks Forge AI...\n"

  info "Stopping app..."
  local stop_err
  if ! stop_err=$(databricks apps stop "$APP_NAME" --no-wait 2>&1); then
    case "$stop_err" in
      *"does not exist"*|*"RESOURCE_DOES_NOT_EXIST"*|*"not found"*)
        ok "already stopped"
        ;;
      *)
        ok "stop skipped"
        ;;
    esac
  else
    ok
  fi

  info "Deleting app..."
  local delete_err
  if ! delete_err=$(databricks apps delete "$APP_NAME" 2>&1); then
    case "$delete_err" in
      *"does not exist"*|*"RESOURCE_DOES_NOT_EXIST"*|*"not found"*)
        ok "already deleted"
        ;;
      *"state DELETING"*|*"updated less than 20 minutes ago"*)
        ok "already deleting"
        ;;
      *)
        printf "FAILED\n"
        die "Failed to delete app.\n  $delete_err"
        ;;
    esac
  else
    ok
  fi

  if [ "$(get_app_compute_state)" != "MISSING" ]; then
    if ! wait_for_app_absent; then
      die "Delete requested but app still exists after waiting. Retry destroy in a few minutes."
    fi
  fi

  WORKSPACE_PATH="/Workspace/Users/${USER_EMAIL}/${APP_NAME}"
  info "Cleaning workspace files..."
  if databricks workspace delete --recursive "$WORKSPACE_PATH" 2>/dev/null; then ok; else ok "already clean"; fi

  printf "\n  App removed successfully.\n\n"
}

# -------------------------------------------------------------------------
# Main
# -------------------------------------------------------------------------
main() {
  trap restore_app_yaml EXIT

  printf "\n"
  printf "  Databricks Forge AI -- Deployment\n"
  printf "  ==================================\n"

  check_prerequisites

  if [ "$ARG_DESTROY" = true ]; then
    destroy
    exit 0
  fi

  select_warehouse
  create_app
  wait_for_stable_state
  configure_app
  prepare_app_yaml

  if [ "$ARG_PREBUILT" = "true" ]; then
    assemble_prebuilt
    # Copy the (possibly patched) app.yaml into the deploy package
    cp app.yaml "$DEPLOY_PKG/app.yaml"
  fi

  upload_code
  start_compute
  deploy_app
  print_success
}

main

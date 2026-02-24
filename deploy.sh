#!/usr/bin/env bash
# =========================================================================
# Databricks Forge AI — One-command deployment
#
# Usage:
#   ./deploy.sh                          Interactive (pick a warehouse)
#   ./deploy.sh --warehouse "Name"       Non-interactive
#   ./deploy.sh --destroy                Remove the app
#
# Override model endpoints (advanced):
#   ./deploy.sh --endpoint "model" --fast-endpoint "fast-model"
# =========================================================================

set -euo pipefail

# -------------------------------------------------------------------------
# Defaults
# -------------------------------------------------------------------------
APP_NAME="databricks-forge"
APP_DESC="Discover AI-powered use cases from Unity Catalog metadata"
DEFAULT_ENDPOINT="databricks-claude-sonnet-4-6"
DEFAULT_FAST_ENDPOINT="databricks-claude-sonnet-4-6"

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
ARG_WAREHOUSE=""
ARG_ENDPOINT=""
ARG_FAST_ENDPOINT=""
ARG_DESTROY=false

print_usage() {
  cat <<'USAGE'
Databricks Forge AI — One-command deployment

Usage:
  ./deploy.sh                                  Interactive deployment
  ./deploy.sh --warehouse "My Warehouse"       Skip warehouse prompt
  ./deploy.sh --destroy                        Remove the app

Options:
  --warehouse NAME        SQL Warehouse name (skips interactive prompt)
  --endpoint NAME         Premium model endpoint  (default: databricks-claude-sonnet-4-6)
  --fast-endpoint NAME    Fast model endpoint     (default: databricks-claude-sonnet-4-6)
  --destroy               Remove the app and clean up workspace files
  -h, --help              Show this help message

Prerequisites:
  - Databricks CLI installed  (https://docs.databricks.com/dev-tools/cli/install.html)
  - Authenticated CLI profile (run: databricks auth login)
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --warehouse)      ARG_WAREHOUSE="$2"; shift 2 ;;
    --endpoint)       ARG_ENDPOINT="$2"; shift 2 ;;
    --fast-endpoint)  ARG_FAST_ENDPOINT="$2"; shift 2 ;;
    --destroy)        ARG_DESTROY=true; shift ;;
    -h|--help)        print_usage; exit 0 ;;
    *)                printf "\n  ERROR: Unknown flag: %s\n  Run ./deploy.sh --help\n\n" "$1" >&2; exit 1 ;;
  esac
done

ENDPOINT="${ARG_ENDPOINT:-$DEFAULT_ENDPOINT}"
FAST_ENDPOINT="${ARG_FAST_ENDPOINT:-$DEFAULT_FAST_ENDPOINT}"

# -------------------------------------------------------------------------
# Output helpers
# -------------------------------------------------------------------------
die()  { printf "\n  ERROR: %s\n\n" "$1" >&2; exit 1; }
info() { printf "  %-48s" "$1"; }
ok()   { if [ -n "${1:-}" ]; then printf "OK  (%s)\n" "$1"; else printf "OK\n"; fi; }

# Extract a value from JSON via Python 3.
# Usage: echo '{"k":"v"}' | json_val "['k']"
json_val() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

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
APP_SCOPES='["sql","catalog.tables:read","catalog.schemas:read","catalog.catalogs:read","files.files"]'

create_app() {
  printf "\n"
  info "App \"$APP_NAME\"..."

  if databricks apps get "$APP_NAME" &>/dev/null; then
    ok "already exists"
  else
    local create_json
    create_json=$(python3 -c "
import json
print(json.dumps({
    'description': '''$APP_DESC''',
    'user_api_scopes': ['sql','catalog.tables:read','catalog.schemas:read','catalog.catalogs:read','files.files']
}))
")
    if ! databricks apps create "$APP_NAME" --json "$create_json" --no-compute 2>/dev/null; then
      die "Failed to create app. You may need CAN_MANAGE permissions."
    fi
    ok "created with scopes"
  fi
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
        }
    ],
    'user_api_scopes': ['sql','catalog.tables:read','catalog.schemas:read','catalog.catalogs:read','files.files']
}))
")

  if ! databricks apps create-update "$APP_NAME" "resources,user_api_scopes" \
       --json "$update_json" 2>/dev/null; then
    die "Failed to configure app resources and scopes.\n  You may need CAN_MANAGE permissions on the app, warehouse, and endpoints."
  fi
  ok
}

# -------------------------------------------------------------------------
# Step 5: Upload source code
# -------------------------------------------------------------------------
upload_code() {
  info "Uploading source code..."
  WORKSPACE_PATH="/Workspace/Users/${USER_EMAIL}/${APP_NAME}"

  if ! databricks sync . "$WORKSPACE_PATH" 2>/dev/null; then
    die "Failed to upload code.\n  Try manually: databricks sync . $WORKSPACE_PATH"
  fi
  ok
}

# -------------------------------------------------------------------------
# Step 6: Deploy
# -------------------------------------------------------------------------
deploy_app() {
  info "Deploying (takes 3-5 minutes)..."

  if ! databricks apps deploy "$APP_NAME" \
       --source-code-path "$WORKSPACE_PATH" --mode SNAPSHOT 2>/dev/null; then
    die "Deployment failed.\n  Check logs: databricks apps logs $APP_NAME"
  fi
  ok
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
  printf "    Resources:\n"
  printf "      SQL Warehouse:   %s\n" "$WAREHOUSE_NAME"
  printf "      Premium model:   %s\n" "$ENDPOINT"
  printf "      Fast model:      %s\n" "$FAST_ENDPOINT"
  printf "\n"
  printf "    User scopes:\n"
  printf "      sql, catalog.tables:read, catalog.schemas:read,\n"
  printf "      catalog.catalogs:read, files.files\n"
  printf "  ==========================================================\n"
  printf "\n"
}

# -------------------------------------------------------------------------
# Destroy
# -------------------------------------------------------------------------
destroy() {
  printf "\n  Removing Databricks Forge AI...\n"

  info "Stopping app..."
  if databricks apps stop "$APP_NAME" --no-wait 2>/dev/null; then ok; else ok "already stopped"; fi

  info "Deleting app..."
  if ! databricks apps delete "$APP_NAME" 2>/dev/null; then
    die "Failed to delete app. It may not exist or you lack permissions."
  fi
  ok

  WORKSPACE_PATH="/Workspace/Users/${USER_EMAIL}/${APP_NAME}"
  info "Cleaning workspace files..."
  if databricks workspace delete --recursive "$WORKSPACE_PATH" 2>/dev/null; then ok; else ok "already clean"; fi

  printf "\n  App removed successfully.\n\n"
}

# -------------------------------------------------------------------------
# Main
# -------------------------------------------------------------------------
main() {
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
  configure_app
  upload_code
  deploy_app
  print_success
}

main

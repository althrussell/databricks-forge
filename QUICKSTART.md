# Quick Start

Deploy Databricks Forge AI to your workspace in three steps.

## Prerequisites

- A Databricks workspace with a SQL Warehouse
- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/install.html) installed and authenticated

```bash
# Install the CLI (if not already installed)
brew install databricks   # macOS
# or: curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh

# Authenticate
databricks auth login --host https://your-workspace.cloud.databricks.com
```

## Deploy

```bash
git clone <repo-url> databricks-forge
cd databricks-forge
./deploy.sh
```

The script discovers your SQL Warehouses, lets you pick one, and handles
everything else automatically -- resource bindings, user authorization scopes,
code upload, and deployment. Models default to `databricks-claude-sonnet-4-6`.

No manual configuration steps. Zero UI clicks.

## Redeploy

Run `./deploy.sh` again. It detects the existing app and updates it.

## Remove

```bash
./deploy.sh --destroy
```

## Advanced options

All flags are optional. Combine as needed.

### Core

| Flag | Description |
|------|-------------|
| `--app-name "name"` | Custom app name for multi-instance deployments. Isolates the Databricks App and Lakebase database. Default: `databricks-forge` |
| `--warehouse "Name"` | Skip the interactive warehouse prompt |
| `--profile "name"` | Use a specific Databricks CLI profile |
| `--destroy` | Remove the app and clean up workspace files |

### Model endpoints

| Flag | Default |
|------|---------|
| `--endpoint "name"` | `databricks-claude-sonnet-4-6` (premium) |
| `--fast-endpoint "name"` | `databricks-claude-sonnet-4-6` (fast/classification) |
| `--embedding-endpoint "name"` | `databricks-qwen3-embedding-0-6b` (1024-dim) |

### Lakebase (database)

| Flag | Description |
|------|-------------|
| `--lakebase-auth-mode "oauth\|native_password"` | Runtime DB auth mode |
| `--lakebase-native-user "user"` | Native DB user (requires `native_password` mode) |
| `--lakebase-native-password "pw"` | Native DB password (requires `native_password` mode) |
| `--rotate-lakebase-native-password` | Auto-generate and rotate a 48-char password |
| `--print-generated-native-password` | Print the generated password (use with caution) |
| `--lakebase-bootstrap-user "email"` | Bootstrap OAuth role/grants for this user at startup |
| `--lakebase-runtime-mode "oauth_direct_only\|pooler_preferred"` | Connection routing strategy |
| `--lakebase-enable-pooler-experiment` | Enable pooler for future testing |

### Benchmark catalog

| Flag | Description |
|------|-------------|
| `--seed-benchmarks` | Seed benchmark catalog from `data/benchmark/*.json` at startup |
| `--seed-benchmarks-all-industries` | Also generate baseline records for all outcome-map industries |
| `--seed-benchmark-industries "banking,hls,rcg"` | Seed only these industry IDs |
| `--benchmark-admins "a@co.com,b@co.com"` | Restrict benchmark management to these emails. If unset, all authenticated users can manage benchmarks. |

### Examples

```bash
# Non-interactive deploy with a specific warehouse
./deploy.sh --warehouse "My SQL Warehouse"

# Custom model endpoints
./deploy.sh --endpoint "my-custom-model" --fast-endpoint "my-fast-model"

# Seed benchmarks for banking and healthcare
./deploy.sh --seed-benchmarks --seed-benchmark-industries "banking,hls"

# Lock benchmark admin to specific users
./deploy.sh --benchmark-admins "alice@company.com,bob@company.com"

# Full production deploy with native password auth + benchmarks
./deploy.sh \
  --warehouse "Production Warehouse" \
  --lakebase-auth-mode native_password \
  --rotate-lakebase-native-password \
  --seed-benchmarks-all-industries \
  --benchmark-admins "data-team@company.com"

# Deploy a separate demo instance (isolated app + database)
./deploy.sh --app-name "forge-demo" --warehouse "Demo Warehouse"

# Deploy multiple instances side by side
./deploy.sh --app-name "forge-banking-demo" --seed-benchmark-industries "banking"
./deploy.sh --app-name "forge-hls-demo" --seed-benchmark-industries "hls"

# Remove a named instance
./deploy.sh --app-name "forge-demo" --destroy
```

### Manual benchmark seeding (local dev)

```bash
# Seed curated packs from data/benchmark/*.json
npm run seed:benchmarks

# Seed all industries (generate missing baseline records)
npm run seed:benchmarks:all-industries

# Seed a specific set of industries
FORGE_SEED_BENCHMARK_INDUSTRIES="banking,hls" npm run seed:benchmarks:industries
```

For local development setup and architecture details, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

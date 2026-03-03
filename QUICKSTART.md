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

```bash
# Skip the warehouse prompt
./deploy.sh --warehouse "My SQL Warehouse"

# Use different model endpoints
./deploy.sh --endpoint "my-custom-model" --fast-endpoint "my-fast-model"

# Seed benchmark catalog at startup
./deploy.sh --seed-benchmarks

# Seed curated + generated baselines for all outcome-map industries
./deploy.sh --seed-benchmarks-all-industries

# Seed only selected industries
./deploy.sh --seed-benchmark-industries "banking,hls,rcg"
```

### Manual benchmark seeding

```bash
# Seed curated packs from data/benchmark/*.json
npm run seed:benchmarks

# Seed all industries (generate missing baseline records)
npm run seed:benchmarks:all-industries

# Seed a specific set of industries
FORGE_SEED_BENCHMARK_INDUSTRIES="banking,hls" npm run seed:benchmarks:industries
```

For local development setup and architecture details, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

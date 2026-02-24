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
```

For local development setup and architecture details, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

# Contributing to Databricks Forge AI

Thank you for your interest in contributing! This project is maintained by the
Databricks Field Engineering team and welcomes community contributions.

> **Note:** This is NOT an official Databricks product. See [NOTICE](NOTICE) for
> the full disclaimer.

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- A Databricks workspace with Unity Catalog, a SQL Warehouse, and a Model Serving endpoint

### Development Setup

1. Fork and clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file (see [README.md](README.md#quick-start-local-development) for required variables)
4. Generate the Prisma client:
   ```bash
   npx prisma generate
   ```
5. Start the dev server:
   ```bash
   npm run dev
   ```

### Running Checks

Before submitting a PR, make sure all checks pass:

```bash
npm run lint        # ESLint
npm run typecheck   # TypeScript strict mode
npm test            # Vitest unit tests
npm run build       # Production build
```

## How to Contribute

### Reporting Issues

- Search existing issues before opening a new one
- Include steps to reproduce, expected behaviour, and actual behaviour
- Include your Node.js version, OS, and browser (if relevant)

### Submitting Pull Requests

1. Create a feature branch from `dev`:
   ```bash
   git checkout -b feature/your-feature dev
   ```
2. Make your changes following the conventions below
3. Ensure all checks pass (`lint`, `typecheck`, `test`, `build`)
4. Write a clear PR description explaining **what** and **why**
5. Submit the PR against the `dev` branch

### Code Conventions

- **TypeScript strict mode** -- no `any` unless absolutely necessary
- **No raw SQL in components** -- all SQL lives in `lib/queries/`
- **No hardcoded credentials** -- use environment variables
- **Loading, empty, and error states** on every page and async component
- **Prompt templates** include business context, metadata scope, and output format spec
- Follow existing file organisation (see `AGENTS.md` for the folder contract)

### Commit Messages

Write concise commit messages that describe the change and its purpose.
Use the imperative mood (e.g. "Add scoring calibration" not "Added scoring calibration").

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md).
By participating, you agree to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the
[Apache License 2.0](LICENSE).
